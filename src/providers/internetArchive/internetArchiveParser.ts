import type {
  InternetArchiveFile,
  InternetArchiveItem,
  InternetArchiveSearchItem,
} from "./internetArchiveTypes.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toStrings(value: unknown): string[] {
  if (isNonEmptyString(value)) {
    return [value.trim()];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isNonEmptyString).map((entry) => entry.trim());
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (isNonEmptyString(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  return undefined;
}

function isSafeFileName(value: string): boolean {
  return (
    !value.startsWith("/") &&
    !value.includes("://") &&
    !value.split("/").some((segment) => segment === "..")
  );
}

function parseFile(value: unknown): InternetArchiveFile | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const file = value as Record<string, unknown>;

  if (
    !isNonEmptyString(file.name) ||
    !isSafeFileName(file.name) ||
    !isNonEmptyString(file.format)
  ) {
    return null;
  }

  return {
    name: file.name.trim(),
    format: file.format.trim(),
    ...(isNonEmptyString(file.source) ? { source: file.source.trim() } : {}),
    ...(toOptionalNumber(file.width) !== undefined ? { width: toOptionalNumber(file.width) } : {}),
    ...(toOptionalNumber(file.height) !== undefined
      ? { height: toOptionalNumber(file.height) }
      : {}),
    ...(toOptionalNumber(file.size) !== undefined ? { size: toOptionalNumber(file.size) } : {}),
  };
}

export class InternetArchiveParser {
  parseSearch(input: unknown): InternetArchiveSearchItem[] {
    if (typeof input !== "object" || input === null) {
      return [];
    }

    const response = (input as Record<string, unknown>).response;

    if (typeof response !== "object" || response === null) {
      return [];
    }

    const docs = (response as Record<string, unknown>).docs;

    if (!Array.isArray(docs)) {
      return [];
    }

    return docs.flatMap((value): InternetArchiveSearchItem[] => {
      if (typeof value !== "object" || value === null) {
        return [];
      }

      const doc = value as Record<string, unknown>;
      const externalIdentifiers = toStrings(
        doc["external-identifier"] ?? doc.external_identifier,
      );

      if (
        !isNonEmptyString(doc.identifier) ||
        !isNonEmptyString(doc.title) ||
        !isNonEmptyString(doc.mediatype)
      ) {
        return [];
      }

      return [
        {
          identifier: doc.identifier.trim(),
          title: doc.title.trim(),
          mediaType: doc.mediatype.trim(),
          externalIdentifiers,
        },
      ];
    });
  }

  parseMetadata(input: unknown): InternetArchiveItem | null {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return null;
    }

    const record = input as Record<string, unknown>;
    const metadata = record.metadata;

    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      return null;
    }

    const itemMetadata = metadata as Record<string, unknown>;

    if (
      !isNonEmptyString(itemMetadata.identifier) ||
      !isNonEmptyString(itemMetadata.title) ||
      !isNonEmptyString(itemMetadata.mediatype)
    ) {
      return null;
    }

    const files = Array.isArray(record.files)
      ? record.files
          .map(parseFile)
          .filter((file): file is InternetArchiveFile => file !== null)
      : [];

    return {
      identifier: itemMetadata.identifier.trim(),
      title: itemMetadata.title.trim(),
      mediaType: itemMetadata.mediatype.trim(),
      externalIdentifiers: toStrings(
        itemMetadata["external-identifier"] ?? itemMetadata.external_identifier,
      ),
      licenseUrls: toStrings(itemMetadata.licenseurl),
      files,
    };
  }
}
