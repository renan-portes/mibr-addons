export interface NovaStreamsStreamItem {
  name?: string;
  title?: string;
  url?: string;
}

export interface NovaStreamsRawResponse {
  streams?: NovaStreamsStreamItem[];
}
