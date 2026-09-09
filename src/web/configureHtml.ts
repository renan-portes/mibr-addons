import { manifest } from "../addon/manifest.js";
import type { ChannelStore } from "../tv/channelStore.js";

export function renderConfigureHtml(hostUrl: string, channelStore?: ChannelStore): string {
  const version = manifest.version;
  const stats = channelStore?.getStats() ?? { totalChannels: 0, genres: {} };
  const genresList = channelStore?.getGenres() ?? [];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MIBR TV 🇧🇷 — Canais Ao Vivo no Stremio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #070a11;
      --card-bg: #0f1422;
      --card-border: #1a2235;
      --accent: #00e676;
      --accent-glow: rgba(0, 230, 118, 0.25);
      --gold: #ffd700;
      --azure: #00b0ff;
      --text: #f0f6fc;
      --text-muted: #8b9eb7;
      --input-bg: #090d17;
      --success: #10b981;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem 1rem;
    }

    .container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 2.2rem;
    }

    .brand-logo {
      max-width: 150px;
      height: auto;
      margin-bottom: 1rem;
      filter: drop-shadow(0 6px 20px var(--accent-glow));
    }

    .logo-box {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      margin-bottom: 0.4rem;
    }

    .logo {
      font-size: 2.4rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, var(--accent), var(--gold), var(--azure));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.65rem;
      font-size: 0.75rem;
      font-weight: 700;
      border-radius: 9999px;
      background: rgba(0, 230, 118, 0.12);
      color: var(--accent);
      border: 1px solid rgba(0, 230, 118, 0.3);
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-top: 0.4rem;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1.2rem;
      padding: 1.75rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 12px 35px rgba(0,0,0,0.4);
    }

    .card-title {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--text);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .stat-box {
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.8rem;
      padding: 1rem;
      text-align: center;
    }

    .stat-value {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--accent);
    }

    .stat-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .genre-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }

    .genre-pill {
      padding: 0.35rem 0.75rem;
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-muted);
    }

    .security-badge {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      background: rgba(0, 176, 255, 0.08);
      border: 1px solid rgba(0, 176, 255, 0.25);
      border-radius: 0.75rem;
      padding: 0.85rem 1rem;
      font-size: 0.85rem;
      color: #90caf9;
      margin-bottom: 1.5rem;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      margin-top: 1rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      width: 100%;
      padding: 1rem 1.5rem;
      font-size: 1.05rem;
      font-weight: 700;
      border-radius: 0.75rem;
      text-decoration: none;
      cursor: pointer;
      transition: transform 0.15s, filter 0.2s;
      border: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent), var(--azure));
      color: #040810;
      box-shadow: 0 4px 20px rgba(0, 230, 118, 0.35);
    }

    .btn-primary:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: var(--card-bg);
      color: var(--text);
      border: 1px solid var(--card-border);
    }

    .btn-secondary:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .copy-toast {
      display: none;
      text-align: center;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--success);
      margin-top: 0.5rem;
      padding: 0.6rem;
      background: rgba(16, 185, 129, 0.12);
      border-radius: 0.5rem;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    footer {
      text-align: center;
      margin-top: 2.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <img src="/mibr-logo.png" alt="MIBR TV 🇧🇷" class="brand-logo" />
      <div class="logo-box">
        <div class="logo">MIBR TV</div>
        <span class="badge">v${version} 🇧🇷</span>
      </div>
      <p class="subtitle">Transmissões de Canais de TV Ao Vivo em Alta Definição no Stremio</p>
    </header>

    <div class="security-badge">
      <span>🛡️</span>
      <div>
        <strong>Stream Proxy Ativo:</strong> Seus links e servidores de IPTV são totalmente mascarados e protegidos contra vazamento de URL.
      </div>
    </div>

    <!-- Stats & Categories -->
    <div class="card">
      <h2 class="card-title">📺 Estado dos Canais</h2>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${stats.totalChannels}</div>
          <div class="stat-label">Canais Disponíveis</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${genresList.length}</div>
          <div class="stat-label">Categorias</div>
        </div>
      </div>

      <div class="genre-pills">
        ${genresList.map(g => `<span class="genre-pill">${g} (${stats.genres[g] ?? 0})</span>`).join("")}
      </div>
    </div>

    <!-- Actions -->
    <div class="actions">
      <a id="install-btn" href="#" class="btn btn-primary" onclick="installInStremio(event)">🚀 Instalar MIBR TV no Stremio</a>
      <button type="button" id="copy-btn" class="btn btn-secondary" onclick="copyManifestLink(event)">📋 Copiar Link de Instalação</button>
      <div id="copy-toast" class="copy-toast">✓ Link copiado para a área de transferência!</div>
    </div>

    <footer>
      MIBR TV 🇧🇷 — Made in Brasil. Addon autossuficiente para Stremio.
    </footer>
  </div>

  <script>
    const HOST_URL = ${JSON.stringify(hostUrl)};

    function getManifestUrl() {
      const origin = (window.location.origin && window.location.origin !== 'null')
        ? window.location.origin
        : HOST_URL.replace(/\\/$/, '');
      return origin + '/manifest.json';
    }

    function installInStremio(evt) {
      if (evt) evt.preventDefault();
      const manifestUrl = getManifestUrl();
      const stremioUrl = manifestUrl.replace(/^https?:\\/\\//, 'stremio://');
      window.location.href = stremioUrl;
    }

    function copyManifestLink(evt) {
      if (evt) evt.preventDefault();
      const manifestUrl = getManifestUrl();

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(manifestUrl).then(showToast).catch(fallback);
      } else {
        fallback();
      }

      function fallback() {
        const input = document.createElement('input');
        input.value = manifestUrl;
        document.body.appendChild(input);
        input.select();
        try {
          document.execCommand('copy');
          showToast();
        } catch(e) {
          alert('Link do manifest: ' + manifestUrl);
        }
        document.body.removeChild(input);
      }

      function showToast() {
        const toast = document.getElementById('copy-toast');
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 2500);
      }
    }

    // Set install link href on load
    document.getElementById('install-btn').href = getManifestUrl().replace(/^https?:\\/\\//, 'stremio://');
  </script>
</body>
</html>`;
}
