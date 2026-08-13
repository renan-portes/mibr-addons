/**
 * FlareSolverr client — bypasses Cloudflare anti-bot protection.
 *
 * FlareSolverr runs as a sidecar container and exposes an HTTP API
 * that solves Cloudflare challenges before returning the page HTML.
 *
 * Docs: https://github.com/FlareSolverr/FlareSolverr
 */

const FLARESOLVERR_URL = (process.env.FLARESOLVERR_URL ?? "http://flaresolverr:8191").replace(/\/$/, "");
const FLARE_MAX_TIMEOUT_MS = 30_000;

interface FlareSolverrOkResponse {
  status: "ok";
  solution: {
    url: string;
    status: number;
    response: string;
    cookies: Array<{ name: string; value: string; domain: string }>;
    userAgent: string;
  };
}

interface FlareSolverrErrorResponse {
  status: "error" | string;
  message: string;
}

type FlareSolverrResponse = FlareSolverrOkResponse | FlareSolverrErrorResponse;

export interface FlareResult {
  html: string;
  statusCode: number;
  resolvedUrl: string;
}

function isOk(r: FlareSolverrResponse): r is FlareSolverrOkResponse {
  return r.status === "ok";
}

/**
 * Fetch a URL through FlareSolverr (GET request).
 * Throws if FlareSolverr itself fails or returns an error.
 */
export async function flareGet(url: string, signal: AbortSignal): Promise<FlareResult> {
  const controller = new AbortController();
  const linked = () => controller.abort();
  signal.addEventListener("abort", linked, { once: true });

  try {
    const resp = await fetch(`${FLARESOLVERR_URL}/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url,
        maxTimeout: FLARE_MAX_TIMEOUT_MS,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`FlareSolverr HTTP ${resp.status} for ${url}`);
    }

    const data = (await resp.json()) as FlareSolverrResponse;

    if (!isOk(data)) {
      throw new Error(`FlareSolverr error: ${(data as FlareSolverrErrorResponse).message ?? data.status}`);
    }

    return {
      html: data.solution.response,
      statusCode: data.solution.status,
      resolvedUrl: data.solution.url,
    };
  } finally {
    signal.removeEventListener("abort", linked);
  }
}
