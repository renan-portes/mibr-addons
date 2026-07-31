import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getManifest } from "../src/addon/manifest.js";

describe("manifest", () => {
  it("returns the Stremio addon manifest", () => {
    assert.deepEqual(getManifest(), {
      id: "community.mibr.addons",
      name: "MIBR Addons",
      version: "0.1.0",
      description: "Modular media addon with independent providers.",
      resources: ["stream"],
      types: ["movie", "series"],
      idPrefixes: ["tt"],
    });
  });
});
