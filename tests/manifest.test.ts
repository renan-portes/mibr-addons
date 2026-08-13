import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getManifest } from "../src/addon/manifest.js";

describe("manifest", () => {
  it("returns the Stremio addon manifest", () => {
    assert.deepEqual(getManifest(), {
      id: "community.mibr.addons",
      name: "MIBR Addons 🇧🇷",
      version: "0.2.0",
      description: "Filmes e séries dublados em Português (PT-BR) — Made in Brasil.",
      icon: "https://mibr.servidor.xyz.br/mibr-logo.png",
      logo: "https://mibr.servidor.xyz.br/mibr-logo.png",
      resources: ["stream"],
      types: ["movie", "series"],
      idPrefixes: ["tt"],
    });
  });
});
