import { lstatSync, readFileSync, statSync } from "node:fs";

const IMDB = /^tt\d{7,10}$/;
const MAX_IDS = 4;
const MAX_TOKEN_BYTES = 4_096;
const MAX_CANDIDATE_BYTES = 16_384;

export class ExperimentalRealDebridClientModeError extends Error {
  constructor() {
    super("Experimental Real-Debrid client mode rejected (configuration_invalid)");
    this.name = "ExperimentalRealDebridClientModeError";
  }
}

export type ExperimentalRealDebridClientMode = Readonly<{
  readonly enabled: boolean;
  readonly token?: string;
  readonly authorizedImdbIds: readonly string[];
  readonly candidates: readonly ExperimentalAuthorizedCandidate[];
}>;

export type ExperimentalAuthorizedCandidate = Readonly<{ readonly imdbId: string; readonly type: "movie" | "series"; readonly magnet: string; readonly infoHash: string; readonly filePath: string; readonly fileBytes: number }>;
export type CandidateFileSystem = Readonly<{ lstat(path: string): { isFile(): boolean; isSymbolicLink(): boolean; uid: number; gid: number; mode: number; size: number }; readFile(path: string): string }>;
const candidateFileSystem: CandidateFileSystem = Object.freeze({ lstat: (path) => { const link = lstatSync(path); const info = statSync(path); return { isFile: () => link.isFile(), isSymbolicLink: () => link.isSymbolicLink(), uid: info.uid, gid: info.gid, mode: info.mode, size: info.size }; }, readFile: (path) => readFileSync(path, "utf8") });

function exactTrue(value: string | undefined): boolean { return value === "true"; }

function parseAllowlist(value: string | undefined): readonly string[] {
  if (value === undefined || value === "") return Object.freeze([]);
  const values = value.split(",");
  if (values.length > MAX_IDS || values.some((id) => !IMDB.test(id)) || new Set(values).size !== values.length) {
    throw new ExperimentalRealDebridClientModeError();
  }
  return Object.freeze([...values]);
}

function readSecret(path: string | undefined, fileSystem: CandidateFileSystem): string {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) throw new ExperimentalRealDebridClientModeError();
  try {
    const info = fileSystem.lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_TOKEN_BYTES
      || info.uid !== 1000 || info.gid !== 1000 || (info.mode & 0o777) !== 0o400) throw new ExperimentalRealDebridClientModeError();
    const token = fileSystem.readFile(path);
    if (token.trim() !== token || token.length === 0 || /[\u0000-\u001f\u007f]/.test(token)) throw new ExperimentalRealDebridClientModeError();
    return token;
  } catch (error) {
    if (error instanceof ExperimentalRealDebridClientModeError) throw error;
    throw new ExperimentalRealDebridClientModeError();
  }
}

function readCandidates(path: string | undefined, allowed: readonly string[], fileSystem: CandidateFileSystem): readonly ExperimentalAuthorizedCandidate[] {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) throw new ExperimentalRealDebridClientModeError();
  try {
    const info = fileSystem.lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > MAX_CANDIDATE_BYTES || info.uid !== 1000 || info.gid !== 1000 || (info.mode & 0o777) !== 0o400) throw new ExperimentalRealDebridClientModeError();
    const raw: unknown = JSON.parse(fileSystem.readFile(path));
    if (!Array.isArray(raw) || raw.length > MAX_IDS || raw.length !== allowed.length) throw new ExperimentalRealDebridClientModeError();
    const candidates = raw.map((value): ExperimentalAuthorizedCandidate => {
      if (value === null || typeof value !== "object") throw new ExperimentalRealDebridClientModeError();
      const candidate = value as Record<string, unknown>;
      const { imdbId, type, magnet, infoHash, filePath, fileBytes } = candidate;
      if (typeof imdbId !== "string" || !allowed.includes(imdbId) || (type !== "movie" && type !== "series") || typeof magnet !== "string" || typeof infoHash !== "string" || !/^[a-f0-9]{40}$/.test(infoHash) || !magnet.includes(`xt=urn:btih:${infoHash}`) || typeof filePath !== "string" || filePath.length === 0 || filePath.startsWith("/") || /[%\\\u0000-\u001f]|(^|\/)\.\.?($|\/)/.test(filePath) || typeof fileBytes !== "number" || !Number.isSafeInteger(fileBytes) || fileBytes < 0) throw new ExperimentalRealDebridClientModeError();
      return Object.freeze({ imdbId, type, magnet, infoHash, filePath, fileBytes: fileBytes as number });
    });
    if (new Set(candidates.map((candidate) => candidate.imdbId)).size !== candidates.length) throw new ExperimentalRealDebridClientModeError();
    return Object.freeze(candidates);
  } catch (error) { if (error instanceof ExperimentalRealDebridClientModeError) throw error; throw new ExperimentalRealDebridClientModeError(); }
}

/** Parses only explicit runtime opt-in state. It never performs network I/O. */
export function createExperimentalRealDebridClientMode(environment: Readonly<Record<string, string | undefined>>, fileSystem: CandidateFileSystem = candidateFileSystem): ExperimentalRealDebridClientMode {
  const enabled = exactTrue(environment.EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED);
  if (!enabled) return Object.freeze({ enabled: false, authorizedImdbIds: Object.freeze([]), candidates: Object.freeze([]) });
  if (!exactTrue(environment.EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED)
    || !exactTrue(environment.EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED)) throw new ExperimentalRealDebridClientModeError();
  const authorizedImdbIds = parseAllowlist(environment.EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS);
  return Object.freeze({ enabled: true, token: readSecret(environment.REAL_DEBRID_TOKEN_FILE, fileSystem), authorizedImdbIds, candidates: readCandidates(environment.EXPERIMENTAL_ADDON_CANDIDATES_FILE, authorizedImdbIds, fileSystem) });
}
