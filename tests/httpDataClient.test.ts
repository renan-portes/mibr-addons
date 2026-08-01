import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import {
  HttpDataClient,
  type HttpDataClientClock,
} from "../src/clients/http/httpDataClient.js";
import {
  HttpCancellationError,
  HttpInvalidJsonError,
  HttpResponseTooLargeError,
  HttpStatusError,
  HttpTimeoutError,
} from "../src/clients/http/httpErrors.js";

describe("HttpDataClient", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createServer((request, response) => {
      switch (request.url) {
        case "/text":
          response.end("fixture response");
          break;
        case "/json":
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ ok: true, source: "local" }));
          break;
        case "/invalid-json":
          response.end('{"broken":');
          break;
        case "/error":
          response.statusCode = 503;
          response.statusMessage = "Fixture unavailable";
          response.end("unavailable");
          break;
        case "/slow":
          setTimeout(() => response.end("late response"), 100);
          break;
        case "/large":
          response.write("1234567890");
          response.end("abcdefghij");
          break;
        case "/headers":
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              userAgent: request.headers["user-agent"],
              clientHeader: request.headers["x-client-header"],
              requestHeader: request.headers["x-request-header"],
            }),
          );
          break;
        default:
          response.statusCode = 404;
          response.end();
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();

    if (address === null || typeof address === "string") {
      throw new Error("Unable to determine test server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  });

  it("returns a successful text response", async () => {
    const text = await new HttpDataClient().getText(`${baseUrl}/text`);

    assert.equal(text, "fixture response");
  });

  it("returns valid JSON as unknown", async () => {
    const payload = await new HttpDataClient().getJson(`${baseUrl}/json`);

    assert.deepEqual(payload, { ok: true, source: "local" });
  });

  it("throws a typed error for invalid JSON", async () => {
    await assert.rejects(
      () => new HttpDataClient().getJson(`${baseUrl}/invalid-json`),
      HttpInvalidJsonError,
    );
  });

  it("throws a typed error for non-success HTTP status", async () => {
    await assert.rejects(
      () => new HttpDataClient().getText(`${baseUrl}/error`),
      (error: unknown) =>
        error instanceof HttpStatusError &&
        error.status === 503 &&
        error.statusText === "Fixture unavailable",
    );
  });

  it("times out a slow response", async () => {
    await assert.rejects(
      () => new HttpDataClient({ timeoutMs: 20 }).getText(`${baseUrl}/slow`),
      HttpTimeoutError,
    );
  });

  it("respects an external AbortSignal", async () => {
    const controller = new AbortController();
    const request = new HttpDataClient().getText(`${baseUrl}/slow`, {
      signal: controller.signal,
    });
    controller.abort();

    await assert.rejects(() => request, HttpCancellationError);
  });

  it("rejects responses above the configured size limit", async () => {
    await assert.rejects(
      () => new HttpDataClient({ maxResponseBytes: 10 }).getText(`${baseUrl}/large`),
      HttpResponseTooLargeError,
    );
  });

  it("sends configured headers and User-Agent", async () => {
    const client = new HttpDataClient({
      userAgent: "mibr-addons-test/0.0.1",
      headers: { "X-Client-Header": "client" },
    });
    const payload = await client.getJson(`${baseUrl}/headers`, {
      headers: { "X-Request-Header": "request" },
    });

    assert.deepEqual(payload, {
      userAgent: "mibr-addons-test/0.0.1",
      clientHeader: "client",
      requestHeader: "request",
    });
  });

  it("clears its timeout timer after a successful request", async () => {
    const activeTimers = new Set<ReturnType<typeof setTimeout>>();
    const clock: HttpDataClientClock = {
      setTimeout(callback, delayMs) {
        const handle = setTimeout(callback, delayMs);
        activeTimers.add(handle);
        return handle;
      },
      clearTimeout(handle) {
        clearTimeout(handle);
        activeTimers.delete(handle);
      },
    };

    await new HttpDataClient({}, clock).getText(`${baseUrl}/text`);

    assert.equal(activeTimers.size, 0);
  });
});
