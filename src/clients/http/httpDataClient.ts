import {
  HttpCancellationError,
  HttpInvalidJsonError,
  HttpResponseTooLargeError,
  HttpStatusError,
  HttpTimeoutError,
} from "./httpErrors.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;

export type HttpHeadersInit =
  | Headers
  | Record<string, string>
  | Array<[string, string]>;

export interface HttpDataClientOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  userAgent?: string;
  headers?: HttpHeadersInit;
}

export interface HttpRequestOptions {
  signal?: AbortSignal;
  headers?: HttpHeadersInit;
}

export interface HttpDataClientClock {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const systemClock: HttpDataClientClock = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class HttpDataClient {
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly headers: Headers;

  constructor(
    options: HttpDataClientOptions = {},
    private readonly clock: HttpDataClientClock = systemClock,
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new Error(`Invalid HTTP timeout: ${this.timeoutMs}`);
    }

    if (!Number.isInteger(this.maxResponseBytes) || this.maxResponseBytes < 1) {
      throw new Error(`Invalid maximum response size: ${this.maxResponseBytes}`);
    }

    this.headers = new Headers(options.headers);

    if (options.userAgent !== undefined) {
      this.headers.set("User-Agent", options.userAgent);
    }
  }

  async getText(url: string | URL, options: HttpRequestOptions = {}): Promise<string> {
    return this.execute(url, options, async (response) => {
      const bytes = await this.readBody(response);
      return new TextDecoder().decode(bytes);
    });
  }

  async getJson(url: string | URL, options: HttpRequestOptions = {}): Promise<unknown> {
    const text = await this.getText(url, options);

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new HttpInvalidJsonError(url.toString(), { cause: error });
    }
  }

  private async execute<T>(
    url: string | URL,
    options: HttpRequestOptions,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    if (options.signal?.aborted) {
      throw new HttpCancellationError();
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortFromExternalSignal = () => controller.abort(options.signal?.reason);
    const timeoutHandle = this.clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    options.signal?.addEventListener("abort", abortFromExternalSignal, { once: true });

    if (options.signal?.aborted) {
      abortFromExternalSignal();
    }

    try {
      const headers = new Headers(this.headers);

      for (const [name, value] of new Headers(options.headers)) {
        headers.set(name, value);
      }

      const response = await fetch(url, { method: "GET", headers, signal: controller.signal });

      if (!response.ok) {
        await response.body?.cancel();
        throw new HttpStatusError(response.status, response.statusText, response.url);
      }

      return await consume(response);
    } catch (error) {
      if (timedOut) {
        throw new HttpTimeoutError(this.timeoutMs);
      }

      if (options.signal?.aborted) {
        throw new HttpCancellationError();
      }

      throw error;
    } finally {
      this.clock.clearTimeout(timeoutHandle);
      options.signal?.removeEventListener("abort", abortFromExternalSignal);
    }
  }

  private async readBody(response: Response): Promise<Uint8Array> {
    const declaredLength = Number(response.headers.get("content-length"));

    if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
      await response.body?.cancel();
      throw new HttpResponseTooLargeError(this.maxResponseBytes, declaredLength);
    }

    if (response.body === null) {
      return new Uint8Array();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        receivedBytes += value.byteLength;

        if (receivedBytes > this.maxResponseBytes) {
          await reader.cancel();
          throw new HttpResponseTooLargeError(this.maxResponseBytes, receivedBytes);
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const body = new Uint8Array(receivedBytes);
    let offset = 0;

    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return body;
  }
}
