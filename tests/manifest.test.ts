import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getManifest } from "../src/addon/manifest.js";

describe("manifest", () => {
  it("returns the Stremio addon manifest", () => {
    assert.deepEqual(getManifest(), {
      id: "community.mibr.addons",
      name: "MIBR Addons 🇧🇷",
      version: "0.3.0",
      description: "Filmes, séries e TV ao vivo dublados em Português (PT-BR) — Made in Brasil.",
      icon: "https://mibr.servidor.xyz.br/mibr-logo.png",
      logo: "https://mibr.servidor.xyz.br/mibr-logo.png",
      resources: ["stream", "catalog", "meta"],
      types: ["movie", "series", "channel"],
      idPrefixes: ["tt", "cs:channel:"],
      catalogs: [
        {
          type: "channel",
          id: "froststream-channels",
          name: "🇧🇷 Canais de TV Ao Vivo",
          extra: [
            { name: "genre" },
            { name: "search" },
            { name: "skip" },
          ],
        },
      ],
    });
  });
});
