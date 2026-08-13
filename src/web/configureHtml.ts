/**
 * Configurator HTML page renderer.
 * Serves an interactive web configuration UI for MIBR Addons.
 */

export function renderConfigureHtml(hostUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MIBR Addons — Configuração</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0b0e14;
      --card-bg: #151a23;
      --card-border: #222936;
      --accent: #00f0ff;
      --accent-hover: #33f3ff;
      --purple: #8a2be2;
      --text: #f0f4f8;
      --text-muted: #8b9bb4;
      --input-bg: #0f131a;
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
      padding: 2rem 1rem;
    }

    .container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .logo {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, var(--accent), var(--purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.6rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 9999px;
      background: rgba(0, 240, 255, 0.1);
      color: var(--accent);
      border: 1px solid rgba(0, 240, 255, 0.2);
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 1.75rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }

    .card-title {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 0.5rem;
    }

    .help-text {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.35rem;
    }

    .input-wrapper {
      position: relative;
    }

    input[type="text"], input[type="password"], select {
      width: 100%;
      padding: 0.75rem 1rem;
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      color: var(--text);
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s;
    }

    input[type="text"]:focus, input[type="password"]:focus, select:focus {
      border-color: var(--accent);
    }

    .toggle-btn {
      position: absolute;
      right: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.85rem;
    }

    .checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.75rem;
    }

    .checkbox-card {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.75rem 1rem;
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      user-select: none;
    }

    .checkbox-card:hover {
      border-color: rgba(0, 240, 255, 0.4);
    }

    .checkbox-card input[type="checkbox"] {
      width: 1.1rem;
      height: 1.1rem;
      accent-color: var(--accent);
      cursor: pointer;
    }

    .checkbox-card span {
      font-size: 0.9rem;
      font-weight: 500;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.875rem 1.5rem;
      font-size: 1rem;
      font-weight: 700;
      border-radius: 0.6rem;
      text-decoration: none;
      cursor: pointer;
      transition: transform 0.15s, filter 0.2s;
      border: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent), #00a8ff);
      color: #040810;
      box-shadow: 0 4px 15px rgba(0, 240, 255, 0.3);
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
      color: var(--success);
      margin-top: 0.5rem;
    }

    footer {
      text-align: center;
      margin-top: 2rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    footer a { color: var(--accent); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">MIBR Addons</div>
      <span class="badge">v0.2.0 BR</span>
      <p class="subtitle">Adicionador modular de torrents e streams em PT-BR para Stremio</p>
    </header>

    <!-- Debrid Configuration -->
    <div class="card">
      <h2 class="card-title">🔑 Serviço de Debrid</h2>
      <div class="form-group">
        <label for="rd-token">Token da API do Real-Debrid</label>
        <div class="input-wrapper">
          <input type="password" id="rd-token" placeholder="Cole sua API Key do Real-Debrid..." autocomplete="off" />
          <button type="button" class="toggle-btn" onclick="toggleTokenVisibility()">👁️ Mostrar</button>
        </div>
        <p class="help-text">Obtenha sua chave em <a href="https://real-debrid.com/apitoken" target="_blank" style="color:var(--accent);">real-debrid.com/apitoken</a></p>
      </div>
    </div>

    <!-- Providers Selection -->
    <div class="card">
      <h2 class="card-title">📡 Provedores de Conteúdo</h2>
      <div class="checkbox-grid">
        <label class="checkbox-card">
          <input type="checkbox" id="provider-torrentio" checked />
          <span>Torrentio (RD)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-novastreams" checked />
          <span>Nova Streams (HTTP)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-bludv" checked />
          <span>BluDV (PT-BR)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-torrentdosfilmes" checked />
          <span>Torrent dos Filmes</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-comando" checked />
          <span>Comando Torrents</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-ia" checked />
          <span>Internet Archive</span>
        </label>
      </div>
    </div>

    <!-- Filters & Preferences -->
    <div class="card">
      <h2 class="card-title">⚙️ Filtros e Preferências</h2>
      
      <div class="form-group">
        <label>Resoluções Permitidas</label>
        <div class="checkbox-grid">
          <label class="checkbox-card">
            <input type="checkbox" id="res-4k" checked />
            <span>4K / 2160p</span>
          </label>
          <label class="checkbox-card">
            <input type="checkbox" id="res-1080p" checked />
            <span>1080p Full HD</span>
          </label>
          <label class="checkbox-card">
            <input type="checkbox" id="res-720p" checked />
            <span>720p HD</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label for="audio-filter">Preferência de Áudio</label>
        <select id="audio-filter">
          <option value="all" selected>Todos os Áudios (Dublado + Legendado + Original)</option>
          <option value="ptbr_only">Apenas Português (Dublado PT-BR)</option>
          <option value="prefer_dual">Preferir Dual Áudio</option>
        </select>
      </div>

      <div class="form-group">
        <label class="checkbox-card" style="background:none; border:none; padding:0;">
          <input type="checkbox" id="disable-mocks" checked />
          <span>Desativar links de teste (Mocks)</span>
        </label>
      </div>
    </div>

    <!-- Install Actions -->
    <div class="actions">
      <a id="install-btn" href="#" class="btn btn-primary">🚀 Instalar no Stremio</a>
      <button id="copy-btn" class="btn btn-secondary" onclick="copyManifestLink()">📋 Copiar Link de Instalação</button>
      <div id="copy-toast" class="copy-toast">✓ Link copiado para a área de transferência!</div>
    </div>

    <footer>
      MIBR Addons — Desenvolvido de forma modular e independente.
    </footer>
  </div>

  <script>
    const HOST_URL = ${JSON.stringify(hostUrl)};

    function toggleTokenVisibility() {
      const input = document.getElementById('rd-token');
      const btn = event.target;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈 Ocultar';
      } else {
        input.type = 'password';
        btn.textContent = '👁️ Mostrar';
      }
    }

    function generateConfig() {
      const rdToken = document.getElementById('rd-token').value.trim();
      const providers = [];
      if (document.getElementById('provider-torrentio').checked) providers.push('torrentio');
      if (document.getElementById('provider-novastreams').checked) providers.push('nova-streams');
      if (document.getElementById('provider-bludv').checked) providers.push('bludv');
      if (document.getElementById('provider-torrentdosfilmes').checked) providers.push('torrentdosfilmes');
      if (document.getElementById('provider-comando').checked) providers.push('comando');
      if (document.getElementById('provider-ia').checked) providers.push('internetarchive');

      const resolutions = [];
      if (document.getElementById('res-4k').checked) resolutions.push('4k');
      if (document.getElementById('res-1080p').checked) resolutions.push('1080p');
      if (document.getElementById('res-720p').checked) resolutions.push('720p');

      const audioFilter = document.getElementById('audio-filter').value;
      const disableMocks = document.getElementById('disable-mocks').checked;

      const configObj = {
        realDebridToken: rdToken || undefined,
        providers,
        resolutions,
        audioFilter,
        disableMocks
      };

      const jsonStr = JSON.stringify(configObj);
      // Base64 URL safe
      const b64 = btoa(jsonStr).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      return b64;
    }

    function updateLinks() {
      const b64 = generateConfig();
      const baseUrl = HOST_URL.replace(/\\/$/, '');
      const manifestHttpUrl = baseUrl + '/' + b64 + '/manifest.json';
      const stremioUrl = manifestHttpUrl.replace(/^https?:\\/\\//, 'stremio://');

      document.getElementById('install-btn').href = stremioUrl;
      window.currentManifestUrl = manifestHttpUrl;
    }

    function copyManifestLink() {
      if (window.currentManifestUrl) {
        navigator.clipboard.writeText(window.currentManifestUrl).then(() => {
          const toast = document.getElementById('copy-toast');
          toast.style.display = 'block';
          setTimeout(() => { toast.style.display = 'none'; }, 2500);
        });
      }
    }

    // Attach listeners for live update
    document.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', updateLinks);
      el.addEventListener('change', updateLinks);
    });

    // Initial update
    updateLinks();
  </script>
</body>
</html>`;
}
