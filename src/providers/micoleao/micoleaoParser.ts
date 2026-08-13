import type { Parser } from "../../types/parser.js";
import { TorrentIndexerParser } from "../torrentIndexer/torrentIndexerParser.js";
import type { MicoLeaoRawResponse, MicoLeaoResponse } from "./micoleaoTypes.js";

export class MicoLeaoParser implements Parser<MicoLeaoRawResponse, MicoLeaoResponse> {
  private readonly parser = new TorrentIndexerParser();

  parse(raw: MicoLeaoRawResponse): MicoLeaoResponse {
    return this.parser.parse(raw);
  }
}
