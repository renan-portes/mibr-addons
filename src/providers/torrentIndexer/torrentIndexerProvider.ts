import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import {
  validateResolvedTorrentCandidate,
  type TorrentCandidateResolver,
} from "./torrentCandidateResolver.js";
import { selectTorrentCandidates } from "./torrentCandidateSelection.js";
import type {
  TorrentIndexerRawResponse,
  TorrentIndexerRequest,
  TorrentIndexerResponse,
  TorrentIndexerSource,
} from "./torrentIndexerTypes.js";

const IMDB_BASE_PATTERN = /^(tt\d{7,10})(?::.*)?$/;
const DEFAULT_MAX_CANDIDATES = 3;
const MAX_CANDIDATES = 10;
const DEFAULT_RESOLVER_TIMEOUT_MS = 5_000;

export interface TorrentIndexerResolutionOptions {
  readonly enabled?: boolean;
  readonly candidateLimit?: number;
  readonly timeoutMs?: number;
}

function positiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`Expected an integer between 1 and ${maximum}`);
  }
  return value;
}

export class TorrentIndexerProvider implements StreamProvider {
  readonly id = "torrent-indexer";
  readonly name = "Torrent Indexer (experimental)";
  private readonly resolutionEnabled: boolean;
  private readonly candidateLimit: number;
  private readonly resolverTimeoutMs: number;

  constructor(
    private readonly client: DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse>,
    private readonly parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse>,
    readonly source: TorrentIndexerSource,
    private readonly resolver?: TorrentCandidateResolver,
    resolution: TorrentIndexerResolutionOptions = {},
  ) {
    this.resolutionEnabled = resolution.enabled === true;
    this.candidateLimit = positiveInteger(
      resolution.candidateLimit,
      DEFAULT_MAX_CANDIDATES,
      MAX_CANDIDATES,
    );
    this.resolverTimeoutMs = positiveInteger(
      resolution.timeoutMs,
      DEFAULT_RESOLVER_TIMEOUT_MS,
      60_000,
    );
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    signal.throwIfAborted();
    const imdb = IMDB_BASE_PATTERN.exec(query.id)?.[1];
    if (imdb === undefined) return [];
    if (this.resolutionEnabled && this.resolver === undefined) return [];

    const payload = await this.client.fetch(
      {
        q: query.id,
        imdb,
        filterResults: true,
      },
      signal,
    );
    const response = this.parser.parse(payload);

    if (this.resolver === undefined || !this.resolutionEnabled) return [];

    const candidates = selectTorrentCandidates(
      response.items,
      imdb,
      query,
      signal,
      this.candidateLimit,
    );

    for (const candidate of candidates) {
      signal.throwIfAborted();
      const controller = new AbortController();
      const resolverPromise = Promise.resolve().then(() => this.resolver!.resolve(Object.freeze({
          ...candidate,
          signal: controller.signal,
        })));
      const outcome = await new Promise<
        | { readonly type: "resolved"; readonly value: unknown }
        | { readonly type: "error" }
        | { readonly type: "timeout" }
        | { readonly type: "cancelled" }
      >((resolve) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const finish = (value:
          | { readonly type: "resolved"; readonly value: unknown }
          | { readonly type: "error" }
          | { readonly type: "timeout" }
          | { readonly type: "cancelled" }) => {
          if (settled) return;
          settled = true;
          if (timeout !== undefined) clearTimeout(timeout);
          signal.removeEventListener("abort", abortFromParent);
          resolve(value);
        };
        const abortFromParent = () => {
          controller.abort(signal.reason);
          finish({ type: "cancelled" });
        };
        signal.addEventListener("abort", abortFromParent, { once: true });
        timeout = setTimeout(() => {
          controller.abort(new DOMException("Resolver timed out", "TimeoutError"));
          finish({ type: "timeout" });
        }, this.resolverTimeoutMs);

        resolverPromise.then(
          (value) => finish({ type: "resolved", value }),
          () => finish({ type: "error" }),
        );
      });

      signal.throwIfAborted();
      if (outcome.type === "cancelled") signal.throwIfAborted();
      if (outcome.type === "resolved") {
        const validated = outcome.value === null
          ? null
          : validateResolvedTorrentCandidate(outcome.value);
        signal.throwIfAborted();
        if (validated !== null) {
          signal.throwIfAborted();
          return [{
            name: "Torrent candidate resolver",
            title: validated.name ?? "Resolved media",
            url: validated.url,
          }];
        }
      }
    }

    return [];
  }
}
