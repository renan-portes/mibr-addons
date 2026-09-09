export interface TvChannel {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly logo?: string;
  readonly streamUrl: string;
  readonly httpHeaders?: Record<string, string>;
  readonly epgId?: string;
  readonly number?: number;
}

export interface TvCatalogFilter {
  readonly genre?: string;
  readonly search?: string;
  readonly skip?: number;
  readonly limit?: number;
}
