import type {
  ResolvedTorrentCandidate,
  TorrentCandidateResolutionRequest,
  TorrentCandidateResolver,
} from "../../src/providers/torrentIndexer/torrentCandidateResolver.js";

export type FakeTorrentCandidateResolverResult =
  | ResolvedTorrentCandidate
  | null
  | Error
  | "wait-for-abort"
  | Promise<ResolvedTorrentCandidate | null>;

export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, resolve, reject });
}

export class FakeTorrentCandidateResolver implements TorrentCandidateResolver {
  private readonly recordedRequests: TorrentCandidateResolutionRequest[] = [];
  private readonly callWaiters: Array<() => void> = [];

  constructor(private readonly results: readonly FakeTorrentCandidateResolverResult[]) {}

  get callCount(): number {
    return this.recordedRequests.length;
  }

  get requests(): readonly TorrentCandidateResolutionRequest[] {
    return this.recordedRequests;
  }

  async waitForCall(): Promise<void> {
    if (this.callCount > 0) return;
    await new Promise<void>((resolve) => this.callWaiters.push(resolve));
  }

  async resolve(request: TorrentCandidateResolutionRequest): Promise<ResolvedTorrentCandidate | null> {
    this.recordedRequests.push(request);
    this.callWaiters.splice(0).forEach((resolve) => resolve());
    const result = this.results[this.callCount - 1] ?? null;

    if (result === "wait-for-abort") {
      await new Promise<void>((_resolve, reject) => {
        if (request.signal.aborted) {
          reject(request.signal.reason);
          return;
        }
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
      });
      return null;
    }
    if (result instanceof Error) throw result;
    return await result;
  }
}
