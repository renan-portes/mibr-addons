import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ADDON_CONFIG,
  DEFAULT_TV_GENRES,
  parseAddonConfig,
  serializeAddonConfig,
  toFenixFlixUpstreamConfig,
} from "../src/addon/addonConfig.js";

test("addonConfig", async (t) => {
  await t.test("returns default config when input is empty or undefined", () => {
    const config1 = parseAddonConfig();
    assert.deepEqual(config1.tvGenres, [...DEFAULT_TV_GENRES]);
    assert.equal(config1.tvAll, true);
    assert.equal(config1.fenixEnabled, true);
    assert.deepEqual(config1.fenixQualities, ["4k", "1080p", "720p", "sd"]);
    assert.deepEqual(config1.fenixAudio, ["dublado", "legendado"]);

    const config2 = parseAddonConfig("");
    assert.deepEqual(config2.tvGenres, [...DEFAULT_TV_GENRES]);
  });

  await t.test("parses custom TV genres and case insensitivity", () => {
    const raw = "tv_genres=esportes,abertos,filmes %26 s%C3%A9ries|tv_all=false";
    const config = parseAddonConfig(raw);
    assert.deepEqual(config.tvGenres, ["Abertos", "Esportes", "Filmes & Séries"]);
    assert.equal(config.tvAll, false);
    assert.equal(config.fenixEnabled, true);
  });

  await t.test("parses empty tv_genres correctly", () => {
    const raw = "tv_genres=none";
    const config = parseAddonConfig(raw);
    assert.deepEqual(config.tvGenres, []);
  });

  await t.test("parses fenixflix disabled", () => {
    const raw = "fenix_enabled=false";
    const config = parseAddonConfig(raw);
    assert.equal(config.fenixEnabled, false);
    assert.equal(toFenixFlixUpstreamConfig(config), "");
  });

  await t.test("parses fenixflix qualities, audio, and catalogs filters", () => {
    const raw = "fenix_qualities=1080p,720p|fenix_audio=dublado|fenix_catalogs=populares_movie";
    const config = parseAddonConfig(raw);
    assert.deepEqual(config.fenixQualities, ["1080p", "720p"]);
    assert.deepEqual(config.fenixAudio, ["dublado"]);
    assert.deepEqual(config.fenixCatalogs, ["populares_movie"]);

    const upstream = toFenixFlixUpstreamConfig(config);
    assert.equal(upstream, "qualities=1080p,720p|audio=dublado|catalogs=populares_movie");
  });

  await t.test("supports direct FenixFlix keys (qualities, audio, catalogs)", () => {
    const raw = "qualities=4k,1080p|audio=legendado|catalogs=populares_series";
    const config = parseAddonConfig(raw);
    assert.deepEqual(config.fenixQualities, ["4k", "1080p"]);
    assert.deepEqual(config.fenixAudio, ["legendado"]);
    assert.deepEqual(config.fenixCatalogs, ["populares_series"]);
  });

  await t.test("parses catalogs=none and generates upstream catalogs=none", () => {
    const raw = "qualities=4k,1080p,720p,sd|audio=dublado,legendado|catalogs=none";
    const config = parseAddonConfig(raw);
    assert.deepEqual(config.fenixCatalogs, []);
    assert.equal(toFenixFlixUpstreamConfig(config), "qualities=4k,1080p,720p,sd|audio=dublado,legendado|catalogs=none");
  });

  await t.test("serializes config to pipe string", () => {
    const serialized = serializeAddonConfig({
      tvGenres: ["Abertos", "Esportes"],
      tvAll: true,
      fenixEnabled: true,
      fenixQualities: ["1080p"],
      fenixAudio: ["dublado"],
      fenixCatalogs: ["populares_movie"],
    });

    assert.equal(
      serialized,
      "tv_genres=Abertos,Esportes|tv_all=true|fenix_enabled=true|qualities=1080p|audio=dublado|catalogs=populares_movie",
    );
  });
});
