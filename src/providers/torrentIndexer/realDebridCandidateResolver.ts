import { validateResolvedTorrentCandidate, type ResolvedTorrentCandidate, type TorrentCandidateResolutionRequest, type TorrentCandidateResolver } from "./torrentCandidateResolver.js";
import { errorFromSignal, isSafeRealDebridPath, raceAgainstSignal, RealDebridApiClient, RealDebridResolverError, type RealDebridErrorCode, type RealDebridFile, type RealDebridTorrentInfo } from "./realDebridApiClient.js";

export interface RealDebridResolverOptions {
  readonly pollAttempts?: number;
  readonly totalTimeoutMs?: number;
  readonly cleanup?: boolean;
  readonly cleanupTimeoutMs?: number;
  readonly delay?: (signal: AbortSignal) => Promise<void>;
}

const VIDEO = /\.(?:avi|m2ts|m4v|mkv|mov|mp4|mpeg|mpg|ts|webm)$/i;
const EXTRA = /(?:^|[._ -])(?:sample|trailer|extras?)(?:[._ -]|$)/i;
const FAILURE = new Set(["magnet_error", "error", "virus", "dead"]);

function episodeNumbers(id: string): readonly [number, number] | null {
  const match = /^tt\d{7,10}:(\d{1,3}):(\d{1,4})$/.exec(id);
  if (match === null) return null;
  const season = Number(match[1]); const episode = Number(match[2]);
  return season <= 999 && episode <= 9999 ? [season, episode] : null;
}

function safeVideo(file: RealDebridFile): boolean {
  const basename = file.path.split("/").at(-1) ?? "";
  return isSafeRealDebridPath(file.path) && VIDEO.test(file.path) && !EXTRA.test(basename);
}

export function selectRealDebridFile(files: readonly RealDebridFile[], media: TorrentCandidateResolutionRequest["media"]): RealDebridFile | null {
  const episode = media.type === "series" ? episodeNumbers(media.id) : null;
  const candidates = files.filter((file) => {
    if (!safeVideo(file)) return false;
    if (media.type !== "series") return true;
    if (episode === null) return false;
    const basename = file.path.split("/").at(-1) ?? "";
    const [season, number] = episode;
    const matches = basename.match(/(?:^|[^a-z0-9])s0*(\d{1,3})e0*(\d{1,4})(?=[^a-z0-9]|$)/gi) ?? [];
    if (matches.length !== 1) return false; // Double episodes and directory-only markers are rejected.
    const marker = new RegExp(`(?:^|[^a-z0-9])s0*${season}e0*${number}(?=[^a-z0-9]|$)`, "i");
    return marker.test(basename);
  });
  candidates.sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path) || left.id - right.id);
  return candidates[0] ?? null;
}

function selectAuthorizedFile(files: readonly RealDebridFile[], authorized: TorrentCandidateResolutionRequest["files"]): RealDebridFile | null {
  if (authorized.length === 0) return null;
  const exactPath = files.filter((file) => authorized.some((entry) => entry.path === file.path));
  if (exactPath.length === 0) throw new RealDebridResolverError("authorized_file_not_found");
  const exact = exactPath.filter((file) => authorized.some((entry) => entry.path === file.path && (entry.sizeBytes === undefined || entry.sizeBytes === file.bytes)));
  if (exact.length === 0) throw new RealDebridResolverError("authorized_file_size_mismatch");
  if (exact.length !== 1) throw new RealDebridResolverError("ambiguous_authorized_file");
  return exact[0]!;
}

export class RealDebridCandidateResolver implements TorrentCandidateResolver {
  private readonly attempts: number;
  private readonly timeoutMs: number;
  private readonly cleanup: boolean;
  private readonly cleanupTimeoutMs: number;
  private readonly delay: (signal: AbortSignal) => Promise<void>;
  private cleanupError: RealDebridResolverError | null = null;

  constructor(private readonly api: RealDebridApiClient, options: RealDebridResolverOptions = {}) {
    this.attempts = options.pollAttempts ?? 3;
    this.timeoutMs = options.totalTimeoutMs ?? 20_000;
    this.cleanup = options.cleanup ?? true;
    this.cleanupTimeoutMs = options.cleanupTimeoutMs ?? 2_000;
    this.delay = options.delay ?? (() => Promise.resolve());
    if (!Number.isInteger(this.attempts) || this.attempts < 1 || this.attempts > 20
      || !Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000
      || !Number.isInteger(this.cleanupTimeoutMs) || this.cleanupTimeoutMs < 1 || this.cleanupTimeoutMs > 5_000) {
      throw new RealDebridResolverError("invalid_configuration");
    }
  }

  get lastCleanupErrorCode(): RealDebridErrorCode | null { return this.cleanupError?.code ?? null; }

  async resolve(request: TorrentCandidateResolutionRequest): Promise<ResolvedTorrentCandidate | null> {
    if (request.signal.aborted) throw errorFromSignal(request.signal);
    if (request.magnet === undefined || request.magnet.length > 8_192 || !request.magnet.startsWith("magnet:?")) return null;
    this.cleanupError = null;
    const main = new AbortController();
    const abortMain = () => main.abort(request.signal.reason);
    request.signal.addEventListener("abort", abortMain, { once: true });
    const mainTimer = setTimeout(() => main.abort(new DOMException("timeout", "TimeoutError")), this.timeoutMs);
    let torrentId: string | undefined;
    let result: ResolvedTorrentCandidate | null = null;
    let primary: unknown;
    try {
      torrentId = await this.api.addMagnet(request.magnet, main.signal); this.check(main.signal);
      let info = await this.readInfo(torrentId, main.signal);
      info = await this.waitForFiles(torrentId, info, main.signal);
      const file = request.files.length > 0
        ? selectAuthorizedFile(info.files, request.files)
        : selectRealDebridFile(info.files, request.media);
      if (file === null) result = null;
      else {
        await this.api.selectFile(torrentId, file.id, main.signal); this.check(main.signal);
        info = await this.readInfo(torrentId, main.signal); // Mandatory post-select snapshot and attempt 1.
        info = await this.waitUntilDownloaded(torrentId, info, main.signal);
        const chosenStillExists = info.files.some((entry) => entry.id === file.id);
        if (!chosenStillExists) throw new RealDebridResolverError("file_not_found");
        const selected = info.files.filter((entry) => entry.selected);
        if (selected.length !== 1 || selected[0]?.id !== file.id) throw new RealDebridResolverError("ambiguous_file_selection");
        if (info.links.length === 0) throw new RealDebridResolverError("link_not_found");
        if (info.links.length !== 1) throw new RealDebridResolverError("ambiguous_link");
        const download = await this.api.unrestrict(info.links[0]!, main.signal); this.check(main.signal);
        const validated = validateResolvedTorrentCandidate({ url: download, name: file.path.split("/").at(-1), sizeBytes: file.bytes > 0 ? file.bytes : undefined, source: "authorized-resolver" });
        if (validated === null || new URL(validated.url).protocol !== "https:") throw new RealDebridResolverError("invalid_final_url");
        this.check(main.signal);
        result = validated;
      }
    } catch (error) {
      primary = main.signal.aborted
        ? this.signalError(main.signal)
        : error instanceof RealDebridResolverError ? error : new RealDebridResolverError("transport_error");
    } finally {
      clearTimeout(mainTimer);
      request.signal.removeEventListener("abort", abortMain);
    }

    if (this.cleanup && torrentId !== undefined) await this.runCleanup(torrentId, request.signal);
    if (request.signal.aborted) throw errorFromSignal(request.signal);
    if (primary !== undefined) throw primary;
    return result;
  }

  private signalError(signal: AbortSignal): RealDebridResolverError {
    return new RealDebridResolverError(signal.reason instanceof DOMException && signal.reason.name === "TimeoutError" ? "global_timeout" : "canceled");
  }

  private check(signal: AbortSignal): void { if (signal.aborted) throw this.signalError(signal); }

  private async readInfo(torrentId: string, signal: AbortSignal): Promise<RealDebridTorrentInfo> {
    try {
      const info = await this.api.info(torrentId, signal);
      this.check(signal);
      return info;
    } catch (error) {
      this.check(signal);
      if (error instanceof RealDebridResolverError && error.code === "timeout") throw new RealDebridResolverError("info_request_timeout");
      throw error;
    }
  }

  private async waitDelay(signal: AbortSignal): Promise<void> {
    const operation = Promise.resolve().then(() => this.delay(signal));
    try { await raceAgainstSignal(operation, signal); }
    catch (error) {
      this.check(signal);
      if (error instanceof RealDebridResolverError && error.code === "timeout") throw new RealDebridResolverError("polling_delay_timeout");
      throw error;
    }
    this.check(signal);
  }

  private async waitUntilDownloaded(torrentId: string, initial: RealDebridTorrentInfo, signal: AbortSignal): Promise<RealDebridTorrentInfo> {
    let info = initial;
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      this.check(signal);
      if (FAILURE.has(info.status)) throw new RealDebridResolverError("terminal_status");
      if (info.status === "downloaded") return info;
      if (attempt + 1 >= this.attempts) break;
      await this.waitDelay(signal);
      info = await this.readInfo(torrentId, signal);
    }
    throw new RealDebridResolverError("polling_exhausted");
  }

  private async waitForFiles(torrentId: string, initial: RealDebridTorrentInfo, signal: AbortSignal): Promise<RealDebridTorrentInfo> {
    let info = initial;
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      this.check(signal);
      if (FAILURE.has(info.status)) throw new RealDebridResolverError("terminal_status");
      if (info.files.length > 0) return info;
      if (attempt + 1 >= this.attempts) break;
      await this.waitDelay(signal);
      info = await this.readInfo(torrentId, signal);
    }
    throw new RealDebridResolverError("polling_exhausted");
  }

  private async runCleanup(torrentId: string, parent: AbortSignal): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort(parent.reason);
    if (parent.aborted) controller.abort(parent.reason);
    else parent.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException("cleanup timeout", "TimeoutError")), this.cleanupTimeoutMs);
    try { await this.api.delete(torrentId, controller.signal); }
    catch { this.cleanupError = new RealDebridResolverError("cleanup_failed"); }
    finally { clearTimeout(timer); parent.removeEventListener("abort", abort); }
  }
}
