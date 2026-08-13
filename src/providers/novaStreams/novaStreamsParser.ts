import type { StreamResult } from "../../types/streamResult.js";
import type { NovaStreamsRawResponse } from "./novaStreamsTypes.js";

export class NovaStreamsParser {
  parse(raw: NovaStreamsRawResponse): StreamResult[] {
    if (!raw || !Array.isArray(raw.streams)) {
      return [];
    }

    const results: StreamResult[] = [];

    for (const item of raw.streams) {
      if (!item.url || typeof item.url !== "string") continue;
      if (new URL(item.url, "https://invalid.local").protocol === "javascript:") continue;

      const titleLines = (item.title ?? "").split("\n").filter((l) => l.trim().length > 0);
      const titleStr = titleLines.join(" | ");
      const nameStr = item.name ? item.name.replace(/^Nova Streams\s*/i, "").trim() : "";
      const displayTitle = [nameStr, titleStr].filter(Boolean).join(" ");

      results.push({
        name: `Nova Streams${nameStr ? ` ${nameStr}` : ""}`,
        title: titleStr || "Nova Stream HTTP",
        url: item.url,
      });
    }

    return results;
  }
}
