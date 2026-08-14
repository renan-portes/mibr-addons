import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { CometRawResponse, CometRequest } from "./cometTypes.js";

const DEFAULT_COMET_CONFIG_B64 = "eyJtYXhSZXN1bHRzUGVyUmVzb2x1dGlvbiI6MCwibWF4U2l6ZSI6MCwiY2FjaGVkT25seSI6ZmFsc2UsInNvcnRDYWNoZWRVbmNhY2hlZFRvZ2V0aGVyIjpmYWxzZSwicmVtb3ZlVHJhc2giOnRydWUsInJlc3VsdEZvcm1hdCI6WyJhbGwiXSwiZGVicmlkU2VydmljZXMiOltdLCJlbmFibGVUb3JyZW50Ijp0cnVlLCJkZWR1cGxpY2F0ZVN0cmVhbXMiOmZhbHNlLCJzY3JhcGVEZWJyaWRBY2NvdW50VG9ycmVudHMiOmZhbHNlLCJkZWJyaWRTdHJlYW1Qcm94eVBhc3N3b3JkIjoiIiwibGFuZ3VhZ2VzIjp7InJlcXVpcmVkIjpbXSwiYWxsb3dlZCI6W10sImV4Y2x1ZGUiOltdLCJwcmVmZXJyZWQiOltdfSwicmVzb2x1dGlvbnMiOnt9LCJvcHRpb25zIjp7InJlbW92ZV9yYW5rc191bmRlciI6LTEwMDAwMDAwMDAwLCJhbGxvd19lbmdsaXNoX2luX2xhbmd1YWdlcyI6dHJ1ZSwicmVtb3ZlX3Vua25vd25fbGFuZ3VhZ2VzIjpmYWxzZX19";

export interface CometClientOptions {
  readonly baseUrl?: string | URL;
  readonly configB64?: string;
}

export class CometClient implements DataClient<CometRequest, CometRawResponse> {
  private readonly httpClient: HttpDataClient;
  private readonly baseUrl: string;
  private readonly configB64: string;

  constructor(httpClient: HttpDataClient, options?: CometClientOptions) {
    this.httpClient = httpClient;
    const rawUrl = options?.baseUrl ? String(options.baseUrl) : "https://comet.elfhosted.com";
    this.baseUrl = rawUrl.replace(/\/$/, "");
    this.configB64 = options?.configB64 || DEFAULT_COMET_CONFIG_B64;
  }

  async fetch(request: CometRequest, signal: AbortSignal): Promise<CometRawResponse> {
    const endpoint = `${this.baseUrl}/${this.configB64}/stream/${request.type}/${encodeURIComponent(request.id)}.json`;
    try {
      const data = await this.httpClient.getJson(endpoint, { signal });
      return (data as CometRawResponse) ?? { streams: [] };
    } catch {
      return { streams: [] };
    }
  }
}
