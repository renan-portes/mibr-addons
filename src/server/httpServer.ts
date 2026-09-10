import { createServer, type Server } from "node:http";
import https from "node:https";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { routeRequest } from "./router.js";

const logoProxyCache = new Map<string, string>();

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  });
  response.end(JSON.stringify(body));
}

function sendHtml(
  response: import("node:http").ServerResponse,
  status: number,
  html: string,
): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(html);
}

export function createAddonServer(): Server {
  return createServer((request, response) => {
    void (async () => {
      try {
        const method = request.method ?? "GET";

        if (method === "OPTIONS") {
          response.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
          });
          response.end();
          return;
        }

        const proto = (request.headers["x-forwarded-proto"] as string) ?? "http";
        const host = request.headers.host ? `${proto}://${request.headers.host}` : "http://127.0.0.1:7000";
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

        if (pathname === "/mibr-logo.png" || pathname.endsWith("/mibr-logo.png")) {
          const logoPath = join(process.cwd(), "mibr-logo.png");
          if (existsSync(logoPath)) {
            response.writeHead(200, {
              "Content-Type": "image/png",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=86400",
            });
            createReadStream(logoPath).pipe(response);
            return;
          }
        }

        if (pathname === "/fenix-flix-logo.png" || pathname.endsWith("/fenix-flix-logo.png")) {
          const logoPath = join(process.cwd(), "fenix-flix-logo.png");
          if (existsSync(logoPath)) {
            response.writeHead(200, {
              "Content-Type": "image/png",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=86400",
            });
            createReadStream(logoPath).pipe(response);
            return;
          }
        }

        // Logo proxy: wraps logo in an SVG with padding so circular clip doesn't cut content
        if (pathname.startsWith("/logo-proxy/")) {
          const encodedUrl = pathname.replace("/logo-proxy/", "").split("?")[0] ?? "";
          const targetUrl = decodeURIComponent(encodedUrl);

          // Return from memory cache if available
          const cachedSvg = logoProxyCache.get(targetUrl);
          if (cachedSvg) {
            response.writeHead(200, {
              "Content-Type": "image/svg+xml",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=604800",
            });
            response.end(cachedSvg);
            return;
          }

          // Handle local files (e.g. local:cazetv.png or local:combate.svg)
          if (targetUrl.startsWith("local:")) {
            const localFile = targetUrl.slice("local:".length).trim();
            if (/^[\w.-]+\.(png|jpg|jpeg|svg)$/.test(localFile)) {
              const localPath = join(process.cwd(), "data", "logos", localFile);
              if (existsSync(localPath)) {
                const imgBuf = readFileSync(localPath);
                const b64 = imgBuf.toString("base64");
                const isSvg = localFile.endsWith(".svg");
                const mime = isSvg ? "image/svg+xml" : "image/png";
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512"><image xlink:href="data:${mime};base64,${b64}" x="51" y="51" width="410" height="410" preserveAspectRatio="xMidYMid meet"/></svg>`;
                logoProxyCache.set(targetUrl, svg);
                response.writeHead(200, {
                  "Content-Type": "image/svg+xml",
                  "Access-Control-Allow-Origin": "*",
                  "Cache-Control": "public, max-age=604800",
                });
                response.end(svg);
                return;
              }
            }
          }

          // Handle remote GitHub logos
          if (targetUrl.startsWith("https://raw.githubusercontent.com/tv-logo/")) {
            try {
              await new Promise<void>((resolve, reject) => {
                https.get(targetUrl, { headers: { "User-Agent": "MIBR-TV/1.0" } }, (upstream) => {
                  if (upstream.statusCode !== 200) {
                    resolve();
                    return;
                  }
                  const chunks: Buffer[] = [];
                  upstream.on("data", (c: Buffer) => chunks.push(c));
                  upstream.on("end", () => {
                    const img = Buffer.concat(chunks);
                    const b64 = img.toString("base64");
                    // Wrap in SVG with 10% padding on each side so circular clip doesn't cut edges
                    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512"><image xlink:href="data:image/png;base64,${b64}" x="51" y="51" width="410" height="410" preserveAspectRatio="xMidYMid meet"/></svg>`;
                    logoProxyCache.set(targetUrl, svg);
                    response.writeHead(200, {
                      "Content-Type": "image/svg+xml",
                      "Access-Control-Allow-Origin": "*",
                      "Cache-Control": "public, max-age=604800",
                    });
                    response.end(svg);
                    resolve();
                  });
                  upstream.on("error", reject);
                }).on("error", reject);
              });
              return;
            } catch {
              // Fall through to 404
            }
          }
        }

        if (pathname.startsWith("/logos/")) {
          const rawFile = (pathname.replace("/logos/", "").split("?")[0] ?? "").trim();

          // Serve file if it exists on disk
          if (rawFile && /^[\w.-]+\.(png|jpg|jpeg|svg)$/.test(rawFile)) {
            const logoPath = join(process.cwd(), "data", "logos", rawFile);
            if (existsSync(logoPath)) {
              const dotIdx = rawFile.lastIndexOf(".");
              const ext = dotIdx >= 0 ? rawFile.slice(dotIdx + 1) : "png";
              const ct = ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
              response.writeHead(200, { "Content-Type": ct, "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400" });
              createReadStream(logoPath).pipe(response);
              return;
            }
          }

          // Inline SVG fallback for known channels (512×512, always available)
          const svgMap: Record<string, { bg: string; fg: string; text: string; sub?: string }> = {
            globo:  { bg: "#003087", fg: "#FFFFFF", text: "G",   sub: "GLOBO"  },
            sbt:    { bg: "#00A859", fg: "#FFFFFF", text: "SBT"               },
            band:   { bg: "#FF6600", fg: "#FFFFFF", text: "B",   sub: "BAND"  },
            record: { bg: "#CC0000", fg: "#FFFFFF", text: "R7",  sub: "RECORD" },
          };
          const stem = rawFile.replace(/\.\w+$/, "");
          const def = svgMap[stem];
          if (def) {
            const { bg, fg, text, sub } = def;
            const fs2 = text.length > 3 ? 140 : 180;
            const ty = sub ? Math.round(256 + fs2 * 0.35 - 40) : Math.round(256 + fs2 * 0.35);
            const sy = Math.round(256 + fs2 * 0.35 + 56);
            const subEl = sub ? `<text x="256" y="${sy}" font-family="Arial,sans-serif" font-weight="700" font-size="56" fill="${fg}" text-anchor="middle" opacity="0.85">${sub}</text>` : "";
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="${bg}" rx="64"/><text x="256" y="${ty}" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${fs2}" fill="${fg}" text-anchor="middle">${text}</text>${subEl}</svg>`;
            response.writeHead(200, { "Content-Type": "image/svg+xml", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400" });
            response.end(svg);
            return;
          }
        }

        const result = await routeRequest(method, request.url ?? "/", host);

        if ("rawBody" in result) {
          response.writeHead(result.status, {
            "Content-Type": result.contentType,
            "Access-Control-Allow-Origin": "*",
            ...(result.headers ?? {}),
          });
          response.end(result.rawBody);
        } else if ("html" in result) {
          sendHtml(response, result.status, result.html);
        } else {
          sendJson(response, result.status, result.body);
        }
      } catch {
        sendJson(response, 500, { error: "Internal server error" });
      }
    })();
  });
}

export function startAddonServer(port: number): Promise<Server> {
  const server = createAddonServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

export function getServerAddress(server: Server): AddressInfo {
  const address = server.address();

  if (typeof address === "object" && address !== null) {
    return address;
  }

  throw new Error("Server is not bound to a port");
}
