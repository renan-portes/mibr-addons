import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import type { Server } from "node:http";
import { createAddonServer } from "../src/server/httpServer.js";

describe("HTTP Server Static & Integration", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createAddonServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("serves /mibr-logo.png with image/png content-type", async () => {
    const res = await fetch(`${baseUrl}/mibr-logo.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 0);
  });

  it("serves /fenix-flix-logo.png with image/png content-type", async () => {
    const res = await fetch(`${baseUrl}/fenix-flix-logo.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 0);
  });

  it("serves /configure with modern redesigned HTML", async () => {
    const res = await fetch(`${baseUrl}/configure`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    const text = await res.text();
    assert.ok(text.includes("MIBR TV"));
    assert.ok(text.includes("FenixFlix Integration"));
    assert.ok(text.includes("canais ativos"));
    assert.ok(text.includes("Qualidade de Vídeo"));
    assert.ok(text.includes("Link Gerado (Preview)"));
  });
});
