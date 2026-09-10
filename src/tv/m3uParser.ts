import type { TvChannel } from "./types.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "canal";
}

function normalizeGroup(rawGroup: string): string {
  const trimmed = rawGroup.trim();
  const lower = trimmed.toLowerCase();

  if (/abert|nacional|rede|globo|sbt|record|band|cultura/i.test(lower)) {
    return "Abertos";
  }
  if (/esport|sport|futebol|premiere|espn|combate/i.test(lower)) {
    return "Esportes";
  }
  if (/streaming|stream|vod/i.test(lower)) {
    return "Streaming";
  }
  if (/filme|serie|séries|cinema|telecine|hbo|max|paramount/i.test(lower)) {
    return "Filmes & Séries";
  }
  if (/noticia|notícia|news|jornal/i.test(lower)) {
    return "Notícias";
  }
  if (/infantil|kids|desenho|cartoon|disney|nick/i.test(lower)) {
    return "Infantil";
  }
  if (/doc|historia|history|discovery|geo|animal/i.test(lower)) {
    return "Documentários";
  }
  if (/music|música|som|radio|rádio/i.test(lower)) {
    return "Música";
  }
  if (/religio|igreja|gospel/i.test(lower)) {
    return "Religiosos";
  }
  if (/adult|xxx|18\+/i.test(lower)) {
    return "Adultos";
  }

  return trimmed || "Variedades";
}

function parseAttribute(line: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr}=["']([^"']*)["']`, "i");
  const match = regex.exec(line);
  if (match && match[1] !== undefined) {
    return match[1].trim();
  }

  const unquotedRegex = new RegExp(`${attr}=([^\\s,"']+)`, "i");
  const unquotedMatch = unquotedRegex.exec(line);
  if (unquotedMatch && unquotedMatch[1] !== undefined) {
    return unquotedMatch[1].trim();
  }

  return undefined;
}

export function parseM3U(content: string): TvChannel[] {
  const lines = content.split(/\r?\n/);
  const channels: TvChannel[] = [];
  const usedIds = new Set<string>();

  let currentExtInf: string | null = null;
  let currentHeaders: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const rawLine = (lines[i] ?? "").trim();
    if (!rawLine) continue;

    if (rawLine.startsWith("#EXTINF:")) {
      currentExtInf = rawLine;
      continue;
    }

    if (rawLine.startsWith("#EXTVLCOPT:")) {
      const opt = rawLine.substring("#EXTVLCOPT:".length).trim();
      const eqIdx = opt.indexOf("=");
      if (eqIdx !== -1) {
        const key = opt.substring(0, eqIdx).toLowerCase();
        const value = opt.substring(eqIdx + 1).trim();
        if (key === "http-user-agent") currentHeaders["User-Agent"] = value;
        if (key === "http-referrer" || key === "http-referer") currentHeaders["Referer"] = value;
      }
      continue;
    }

    if (rawLine.startsWith("#")) {
      // Other comments/directives
      continue;
    }

    // This is a stream URL line
    if (currentExtInf !== null) {
      let streamUrl = rawLine;
      const headers: Record<string, string> = { ...currentHeaders };

      // Check pipe-delimited headers: url|User-Agent=...&Referer=...
      const pipeIdx = streamUrl.indexOf("|");
      if (pipeIdx !== -1) {
        const headerPart = streamUrl.substring(pipeIdx + 1);
        streamUrl = streamUrl.substring(0, pipeIdx).trim();

        const params = new URLSearchParams(headerPart);
        for (const [k, v] of params.entries()) {
          headers[k] = v;
        }
      }

      // Extract attributes from #EXTINF
      const tvgId = parseAttribute(currentExtInf, "tvg-id");
      const tvgName = parseAttribute(currentExtInf, "tvg-name");
      const tvgLogo = parseAttribute(currentExtInf, "tvg-logo");
      const groupTitle = parseAttribute(currentExtInf, "group-title");
      const tvgChno = parseAttribute(currentExtInf, "tvg-chno");

      // Extract channel title after comma
      let title = "";
      const commaIdx = currentExtInf.lastIndexOf(",");
      if (commaIdx !== -1) {
        title = currentExtInf.substring(commaIdx + 1).trim();
      }
      if (!title) {
        title = tvgName || tvgId || "Canal Sem Nome";
      }

      // Generate unique channel ID
      const baseSlug = slugify(tvgId || tvgName || title);
      let channelId = `mibr:tv:${baseSlug}`;
      let counter = 2;
      while (usedIds.has(channelId)) {
        channelId = `mibr:tv:${baseSlug}-${counter}`;
        counter++;
      }
      usedIds.add(channelId);

      const group = normalizeGroup(groupTitle || "Variedades");

      channels.push({
        id: channelId,
        name: title,
        group,
        logo: tvgLogo || undefined,
        streamUrl,
        httpHeaders: Object.keys(headers).length > 0 ? headers : undefined,
        epgId: tvgId || undefined,
        number: tvgChno ? Number(tvgChno) : undefined,
      });

      // Reset current item
      currentExtInf = null;
      currentHeaders = {};
    }
  }

  return channels;
}
