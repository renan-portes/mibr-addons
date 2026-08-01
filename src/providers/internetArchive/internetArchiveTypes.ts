export interface InternetArchiveSearchItem {
  identifier: string;
  title: string;
  mediaType: string;
  externalIdentifiers: string[];
}

export interface InternetArchiveFile {
  name: string;
  format: string;
  source?: string;
  width?: number;
  height?: number;
  size?: number;
}

export interface InternetArchiveItem {
  identifier: string;
  title: string;
  mediaType: string;
  externalIdentifiers: string[];
  licenseUrls: string[];
  files: InternetArchiveFile[];
}
