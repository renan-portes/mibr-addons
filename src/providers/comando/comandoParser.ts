import type { Parser } from "../../types/parser.js";
import { TorrentIndexerParser } from "../torrentIndexer/torrentIndexerParser.js";
import type { ComandoRawResponse, ComandoResponse } from "./comandoTypes.js";

export class ComandoParser implements Parser<ComandoRawResponse, ComandoResponse> {
  private readonly parser = new TorrentIndexerParser();

  parse(raw: ComandoRawResponse): ComandoResponse {
    return this.parser.parse(raw);
  }
}
