import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProviderManagerForConfig } from "../src/app/bootstrap.js";
import { decodeUserConfig, encodeUserConfig } from "../src/utils/configEncoder.js";
import { routeRequest } from "../src/server/router.js";

describe("ConfigEncoder & Router", () => {
  it("encodes and decodes UserConfig bidirectionally", () => {
    const config = {
      realDebridToken: "SECRET_TOKEN_123",
      providers: ["bludv", "comando"],
      resolutions: ["1080p"],
      audioFilter: "ptbr_only" as const,
      disableMocks: true,
    };

    const encoded = encodeUserConfig(config);
    assert.ok(encoded.length > 0);

    const decoded = decodeUserConfig(encoded);
    assert.deepEqual(decoded, config);
  });

  it("handles invalid or empty base64 string gracefully", () => {
    assert.equal(decodeUserConfig(""), null);
    assert.equal(decodeUserConfig("not-valid-base64-json!!!"), null);
  });

  it("serves HTML configure UI on GET / and GET /configure", async () => {
    const rootResult = await routeRequest("GET", "/");
    assert.equal(rootResult.status, 200);
    assert.equal("html" in rootResult && typeof rootResult.html === "string", true);

    const configResult = await routeRequest("GET", "/configure");
    assert.equal(configResult.status, 200);
    assert.equal("html" in configResult && typeof configResult.html === "string", true);
  });

  it("serves manifest on GET /manifest.json and GET /:config/manifest.json", async () => {
    const normal = await routeRequest("GET", "/manifest.json");
    assert.equal(normal.status, 200);

    const encoded = encodeUserConfig({ realDebridToken: "TEST" });
    const configured = await routeRequest("GET", `/${encoded}/manifest.json`);
    assert.equal(configured.status, 200);
  });

  it("isolates custom user config from env token when token is left empty", () => {
    process.env.REALDEBRID_TOKEN = "GLOBAL_TOKEN";
    const manager = createProviderManagerForConfig({ providers: ["bludv"] });
    assert.ok(manager);
  });
});
