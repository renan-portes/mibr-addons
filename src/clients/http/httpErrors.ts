export class HttpTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`HTTP request timed out after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
  }
}

export class HttpCancellationError extends Error {
  constructor() {
    super("HTTP request was cancelled");
    this.name = "HttpCancellationError";
  }
}

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
  ) {
    super(`HTTP ${status} ${statusText} for ${url}`);
    this.name = "HttpStatusError";
  }
}

export class HttpResponseTooLargeError extends Error {
  constructor(
    readonly maxBytes: number,
    readonly receivedBytes: number,
  ) {
    super(`HTTP response exceeded ${maxBytes} bytes`);
    this.name = "HttpResponseTooLargeError";
  }
}

export class HttpInvalidJsonError extends Error {
  constructor(readonly url: string, options?: ErrorOptions) {
    super(`HTTP response from ${url} is not valid JSON`, options);
    this.name = "HttpInvalidJsonError";
  }
}
