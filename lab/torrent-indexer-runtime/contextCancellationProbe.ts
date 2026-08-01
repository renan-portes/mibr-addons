export type ContextCancellationCause = "NONE" | "PARENT_CANCELED" | "TIMEOUT" | "UNKNOWN";

export interface SanitizedContextMarker {
  stage: "HANDLER" | "DIRECT_REQUEST" | "FALLBACK" | "POST_V1" | "COMPLETE";
  contextState: "ACTIVE" | "CANCELED";
  cause: ContextCancellationCause;
  deadlinePresent: boolean;
  remainingMsRounded: number | null;
  fallbackStarted: boolean;
  postV1Started: boolean;
  postV1Completed: boolean;
  durationMs: number;
}

export interface OfflineContextFlowOptions {
  directEndpoint: string;
  flaresolverrEndpoint: string;
  signal: AbortSignal;
  deadlineAtMs?: number;
  beforeFallback?: () => void | Promise<void>;
  skipFallbackWhenCanceled?: boolean;
}

export interface OfflineContextFlowResult {
  result: "DIRECT" | "FALLBACK" | "FAILURE";
  error: string | null;
  fallbackCalls: number;
  markers: SanitizedContextMarker[];
}

function cancellationCause(signal: AbortSignal): ContextCancellationCause {
  if (!signal.aborted) return "NONE";
  if (signal.reason instanceof DOMException && signal.reason.name === "TimeoutError") return "TIMEOUT";
  if (signal.reason === "parent-canceled" || signal.reason instanceof DOMException && signal.reason.name === "AbortError") {
    return "PARENT_CANCELED";
  }
  return "UNKNOWN";
}

export async function runOfflineContextFlow(options: OfflineContextFlowOptions): Promise<OfflineContextFlowResult> {
  const startedAt = performance.now();
  const markers: SanitizedContextMarker[] = [];
  let fallbackStarted = false;
  let postV1Started = false;
  let postV1Completed = false;
  let fallbackCalls = 0;

  const mark = (stage: SanitizedContextMarker["stage"]): void => {
    const remaining = options.deadlineAtMs === undefined ? null : Math.max(0, options.deadlineAtMs - Date.now());
    markers.push({
      stage,
      contextState: options.signal.aborted ? "CANCELED" : "ACTIVE",
      cause: cancellationCause(options.signal),
      deadlinePresent: options.deadlineAtMs !== undefined,
      remainingMsRounded: remaining === null ? null : Math.round(remaining / 100) * 100,
      fallbackStarted,
      postV1Started,
      postV1Completed,
      durationMs: Math.round(performance.now() - startedAt),
    });
  };

  mark("HANDLER");
  let needsFallback = false;
  try {
    mark("DIRECT_REQUEST");
    const response = await fetch(options.directEndpoint, { signal: options.signal });
    needsFallback = /just a moment|cf-chl-bypass|under attack/i.test(await response.text());
  } catch {
    needsFallback = true;
  }

  if (!needsFallback) {
    mark("COMPLETE");
    return { result: "DIRECT", error: null, fallbackCalls, markers };
  }

  await options.beforeFallback?.();
  if (options.skipFallbackWhenCanceled === true && options.signal.aborted) {
    mark("COMPLETE");
    return {
      result: "FAILURE",
      error: "failed to do request for url [redacted-url]: context canceled",
      fallbackCalls,
      markers,
    };
  }
  fallbackStarted = true;
  fallbackCalls++;
  mark("FALLBACK");
  try {
    postV1Started = true;
    mark("POST_V1");
    const response = await fetch(options.flaresolverrEndpoint, { method: "POST", signal: options.signal });
    await response.text();
    postV1Completed = true;
    mark("COMPLETE");
    return { result: "FALLBACK", error: null, fallbackCalls, markers };
  } catch {
    mark("COMPLETE");
    const cause = options.signal.aborted ? "context canceled" : "request failed";
    return { result: "FAILURE", error: `failed to do request for url [redacted-url]: ${cause}`, fallbackCalls, markers };
  }
}
