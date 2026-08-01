import type { RealDebridHttpTransport, RealDebridTransportRequest, RealDebridTransportResponse } from "../../src/providers/torrentIndexer/realDebridApiClient.js";

export type FakeRealDebridOutcome = RealDebridTransportResponse | Error | "wait-for-abort" | Promise<RealDebridTransportResponse>;
export interface SanitizedRealDebridCall { readonly method: string; readonly pathname: string; readonly bodyKeys: readonly string[]; }

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function cloneResponse(value: RealDebridTransportResponse): RealDebridTransportResponse {
  return deepFreeze(structuredClone(value));
}

export function json(value: unknown, status = 200): RealDebridTransportResponse {
  return deepFreeze({ status, contentType: "application/json", bodyText: JSON.stringify(value) });
}
export const noContent = deepFreeze({ status: 204, contentType: "", bodyText: "" });

export class FakeRealDebridTransport implements RealDebridHttpTransport {
  private readonly queue: FakeRealDebridOutcome[];
  private readonly recorded: SanitizedRealDebridCall[] = [];

  constructor(outcomes: readonly FakeRealDebridOutcome[]) {
    this.queue = outcomes.map((outcome) => {
      if (outcome instanceof Error || outcome === "wait-for-abort" || outcome instanceof Promise) return outcome;
      return cloneResponse(outcome);
    });
  }

  get calls(): readonly SanitizedRealDebridCall[] { return deepFreeze(structuredClone(this.recorded)); }
  assertExhausted(): void {
    if (this.queue.length !== 0) throw new Error(`Expected fake response queue to be exhausted; ${this.queue.length} remain`);
  }

  async request(request: RealDebridTransportRequest): Promise<RealDebridTransportResponse> {
    this.recorded.push(deepFreeze({ method: request.method, pathname: request.pathname, bodyKeys: Object.freeze(Object.keys(request.body ?? {}).sort()) }));
    const outcome = this.queue.shift();
    if (outcome === undefined) throw new Error("Unexpected fake transport call");
    if (outcome === "wait-for-abort") {
      await new Promise<void>((_resolve, reject) => {
        if (request.signal.aborted) reject(request.signal.reason);
        else request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
      });
      throw new Error("unreachable");
    }
    if (outcome instanceof Error) throw outcome;
    return cloneResponse(await outcome);
  }
}
