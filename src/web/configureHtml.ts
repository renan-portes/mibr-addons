import { manifest } from "../addon/manifest.js";

/**
 * MIBR Addons (Made in Brasil) — Configurator HTML page renderer.
 * Serves an interactive web configuration UI focused on PT-BR dubbed content.
 */

export function renderConfigureHtml(hostUrl: string): string {
  const version = manifest.version;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MIBR Addons 🇧🇷 — Configuração (Made in Brasil)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #080c14;
      --card-bg: #111724;
      --card-border: #1d2636;
      --accent: #00e676;
      --accent-hover: #33eb91;
      --gold: #ffd700;
      --azure: #00b0ff;
      --text: #f0f6fc;
      --text-muted: #8b9eb7;
      --input-bg: #0b0f19;
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
      padding: 2.5rem 1rem;
    }

    .container {
      width: 100%;
      max-width: 680px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 2.2rem;
    }

    .logo-box {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      margin-bottom: 0.4rem;
    }

    .logo {
      font-size: 2.2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, var(--accent), var(--gold), var(--azure));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .flag-badge {
      font-size: 1.4rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.65rem;
      font-size: 0.75rem;
      font-weight: 700;
      border-radius: 9999px;
      background: rgba(0, 230, 118, 0.12);
      color: var(--accent);
      border: 1px solid rgba(0, 230, 118, 0.25);
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-top: 0.4rem;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1.1rem;
      padding: 1.75rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 12px 35px rgba(0,0,0,0.4);
    }

    .card-title {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 1.1rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--text);
    }

    .form-group {
      margin-bottom: 1.35rem;
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
      margin-top: 0.4rem;
    }

    .input-wrapper {
      position: relative;
    }

    input[type="text"], input[type="password"], select {
      width: 100%;
      padding: 0.8rem 1rem;
      padding-right: 6.5rem;
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.6rem;
      color: var(--text);
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    select {
      padding-right: 1rem;
    }

    input[type="text"]:focus, input[type="password"]:focus, select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(0, 230, 118, 0.15);
    }

    .toggle-btn {
      position: absolute;
      right: 0.5rem;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      border-radius: 0.4rem;
      color: var(--text);
      cursor: pointer;
      font-size: 0.8rem;
      padding: 0.4rem 0.7rem;
      transition: background 0.2s;
    }

    .toggle-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    .checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 0.75rem;
    }

    .checkbox-card {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.8rem 1rem;
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.6rem;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      user-select: none;
    }

    .checkbox-card:hover {
      border-color: rgba(0, 230, 118, 0.4);
      background: rgba(0, 230, 118, 0.03);
    }

    .checkbox-card input[type="checkbox"] {
      width: 1.15rem;
      height: 1.15rem;
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
      gap: 0.85rem;
      margin-top: 1.5rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      width: 100%;
      padding: 0.95rem 1.5rem;
      font-size: 1.05rem;
      font-weight: 700;
      border-radius: 0.7rem;
      text-decoration: none;
      cursor: pointer;
      transition: transform 0.15s, filter 0.2s;
      border: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent), #00b0ff);
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

    .brand-logo {
      max-width: 160px;
      height: auto;
      margin-bottom: 0.75rem;
      filter: drop-shadow(0 6px 20px rgba(0, 230, 118, 0.25));
    }

    footer {
      text-align: center;
      margin-top: 2.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    footer a { color: var(--accent); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <img src="/mibr-logo.png" alt="MIBR Addons 🇧🇷" class="brand-logo" />
      <div class="logo-box">
        <div class="logo">MIBR Addons</div>
        <span class="badge">v${version} BR 🇧🇷</span>
      </div>
      <p class="subtitle">Agregador modular de torrents e streams 100% dublados em PT-BR (Made in Brasil)</p>
    </header>

    <!-- Debrid Configuration -->
    <div class="card">
      <h2 class="card-title">🔑 Serviço de Debrid</h2>
      
      <div class="form-group">
        <label for="debrid-provider">Provedor Debrid</label>
        <select id="debrid-provider" onchange="toggleDebridTokenField()">
          <option value="realdebrid" selected>RealDebrid</option>
          <option value="alldebrid">AllDebrid</option>
          <option value="premiumize">Premiumize</option>
          <option value="debridlink">DebridLink</option>
          <option value="torbox">TorBox</option>
          <option value="offcloud">Offcloud</option>
          <option value="putio">Put.io</option>
          <option value="none">Nenhum (Torrent / Stream Direto)</option>
        </select>
      </div>

      <div class="form-group" id="debrid-token-group">
        <label for="debrid-token">Token / API Key do Debrid</label>
        <div class="input-wrapper">
          <input type="password" id="debrid-token" placeholder="Cole sua API Key do serviço selecionado..." autocomplete="off" />
          <button type="button" class="toggle-btn" id="toggle-token-btn" onclick="toggleTokenVisibility()">👁️ Mostrar</button>
        </div>
        <p class="help-text" id="debrid-help-link">Obtenha sua chave em <a href="https://real-debrid.com/apitoken" target="_blank" style="color:var(--accent);">real-debrid.com/apitoken</a></p>
      </div>
    </div>

    <!-- Content Providers PT-BR -->
    <div class="card">
      <h2 class="card-title">🇧🇷 Provedores Nacionais (100% PT-BR / Dublado)</h2>
      <div class="checkbox-grid">
        <label class="checkbox-card">
          <input type="checkbox" id="provider-froststream" checked />
          <span>⚡ FrostStream (HTTP PT-BR)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-fenixflix" checked />
          <span>🐦‍🔥 FenixFlix (HTTP PT-BR)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-kingvod" checked />
          <span>👑 King VOD (HLS PT-BR)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-vidking" checked />
          <span>🎬 VidKing (Player Web)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-brazuca" checked />
          <span>🇧🇷 Brazuca Torrents</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-bludv" checked />
          <span>🇧🇷 BluDV (Torrent)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-comando" checked />
          <span>🇧🇷 Comando Torrents</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-micoleao" checked />
          <span>🇧🇷 Mico Leão Dublado</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-torrentdosfilmes" checked />
          <span>🇧🇷 Torrent dos Filmes</span>
        </label>
      </div>
    </div>

    <!-- Global / Fallback Providers -->
    <div class="card">
      <h2 class="card-title">🌍 Provedores Globais & Fallback (Original / Multi-Áudio / P2P)</h2>
      <p class="subtitle" style="font-size:0.85rem; margin-bottom:1rem;">Úteis para filmes/séries antigos ou quando não houver versão dublada disponível.</p>
      <div class="checkbox-grid">
        <label class="checkbox-card">
          <input type="checkbox" id="provider-comet" checked />
          <span>☄️ Comet (Global P2P/Debrid)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-stremthru" checked />
          <span>⚡ StremThru Torz</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-novastreams" checked />
          <span>🌐 Nova Streams (HTTP)</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-torrentio" checked />
          <span>⚡ Torrentio</span>
        </label>
        <label class="checkbox-card">
          <input type="checkbox" id="provider-ia" checked />
          <span>📦 Internet Archive</span>
        </label>
      </div>
    </div>

    <!-- Filters & Preferences -->
    <div class="card">
      <h2 class="card-title">⚙️ Filtros e Preferências de Áudio</h2>
      
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
          <label class="checkbox-card">
            <input type="checkbox" id="res-480p" checked />
            <span>480p SD</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label for="audio-filter">Preferência de Áudio</label>
        <select id="audio-filter">
          <option value="ptbr_only" selected>🇧🇷 Apenas Português (Dublado PT-BR / Dual Áudio)</option>
          <option value="prefer_dual">🔄 Preferir Dual Áudio</option>
          <option value="all">🌐 Todos os Áudios (Dublado + Legendado + Original)</option>
        </select>
      </div>
    </div>

    <!-- Actions -->
    <div class="actions">
      <a id="install-btn" href="#" class="btn btn-primary" onclick="installInStremio(event)">🚀 Instalar no Stremio</a>
      <button type="button" id="copy-btn" class="btn btn-secondary" onclick="copyManifestLink(event)">📋 Copiar Link de Instalação</button>
      <div id="copy-toast" class="copy-toast">✓ Link copiado para a área de transferência!</div>
    </div>

    <footer>
      MIBR Addons 🇧🇷 — Made in Brasil. Desenvolvido de forma modular e independente.
    </footer>
  </div>

  <script>
    const HOST_URL = ${JSON.stringify(hostUrl)};

    function toggleDebridTokenField() {
      const provider = document.getElementById('debrid-provider').value;
      const group = document.getElementById('debrid-token-group');
      const help = document.getElementById('debrid-help-link');

      if (provider === 'none') {
        group.style.display = 'none';
      } else {
        group.style.display = 'block';
        if (provider === 'realdebrid') {
          help.innerHTML = 'Obtenha sua chave em <a href="https://real-debrid.com/apitoken" target="_blank" style="color:var(--accent);">real-debrid.com/apitoken</a>';
        } else if (provider === 'alldebrid') {
          help.innerHTML = 'Obtenha sua chave em <a href="https://alldebrid.com/apikeys" target="_blank" style="color:var(--accent);">alldebrid.com/apikeys</a>';
        } else if (provider === 'premiumize') {
          help.innerHTML = 'Obtenha sua chave em <a href="https://www.premiumize.me/account" target="_blank" style="color:var(--accent);">premiumize.me/account</a>';
        } else if (provider === 'debridlink') {
          help.innerHTML = 'Obtenha sua chave em <a href="https://debrid-link.com/webapp/apikeys" target="_blank" style="color:var(--accent);">debrid-link.com/webapp/apikeys</a>';
        } else if (provider === 'torbox') {
          help.innerHTML = 'Obtenha sua chave em <a href="https://torbox.app/settings" target="_blank" style="color:var(--accent);">torbox.app/settings</a>';
        } else {
          help.innerHTML = 'Cole a chave da API do seu provedor selecionado.';
        }
      }
      updateLinks();
    }

    function toggleTokenVisibility() {
      const input = document.getElementById('debrid-token');
      const btn = document.getElementById('toggle-token-btn');
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈 Ocultar';
      } else {
        input.type = 'password';
        btn.textContent = '👁️ Mostrar';
      }
    }

    function toBase64Url(str) {
      try {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) {
          bin += String.fromCharCode(bytes[i]);
        }
        return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      } catch (e) {
        return '';
      }
    }

    function generateConfig() {
      const debridProvider = document.getElementById('debrid-provider').value;
      const debridToken = document.getElementById('debrid-token').value.trim();

      const providers = [];
      if (document.getElementById('provider-froststream').checked) providers.push('froststream');
      if (document.getElementById('provider-fenixflix').checked) providers.push('fenixflix');
      if (document.getElementById('provider-kingvod').checked) providers.push('kingvod');
      if (document.getElementById('provider-vidking').checked) providers.push('vidking');
      if (document.getElementById('provider-brazuca').checked) providers.push('brazuca');
      if (document.getElementById('provider-bludv').checked) providers.push('bludv');
      if (document.getElementById('provider-comando').checked) providers.push('comando');
      if (document.getElementById('provider-micoleao').checked) providers.push('micoleao');
      if (document.getElementById('provider-torrentdosfilmes').checked) providers.push('torrentdosfilmes');
      if (document.getElementById('provider-comet').checked) providers.push('comet');
      if (document.getElementById('provider-stremthru').checked) providers.push('stremthru');
      if (document.getElementById('provider-novastreams').checked) providers.push('nova-streams');
      if (document.getElementById('provider-torrentio').checked) providers.push('torrentio');
      if (document.getElementById('provider-ia').checked) providers.push('internetarchive');

      const resolutions = [];
      if (document.getElementById('res-4k').checked) resolutions.push('4k');
      if (document.getElementById('res-1080p').checked) resolutions.push('1080p');
      if (document.getElementById('res-720p').checked) resolutions.push('720p');
      if (document.getElementById('res-480p').checked) resolutions.push('480p');

      const audioFilter = document.getElementById('audio-filter').value;

      const configObj = {
        debridProvider,
        debridToken: debridToken || undefined,
        realDebridToken: debridToken || undefined,
        providers,
        resolutions,
        audioFilter,
        disableMocks: true
      };

      return toBase64Url(JSON.stringify(configObj));
    }

    function updateLinks() {
      const b64 = generateConfig();
      const origin = (window.location.origin && window.location.origin !== 'null')
        ? window.location.origin
        : HOST_URL.replace(/\\/$/, '');
      const manifestHttpUrl = origin + '/' + b64 + '/manifest.json';
      const stremioUrl = manifestHttpUrl.replace(/^https?:\\/\\//, 'stremio://');

      document.getElementById('install-btn').href = stremioUrl;
      window.currentManifestUrl = manifestHttpUrl;
    }

    function installInStremio(evt) {
      updateLinks();
      const installBtn = document.getElementById('install-btn');
      if (installBtn.href && installBtn.href !== '#') {
        window.location.href = installBtn.href;
      }
      if (evt) evt.preventDefault();
    }

    function copyManifestLink(evt) {
      if (evt) evt.preventDefault();
      updateLinks();
      const url = window.currentManifestUrl || '';
      if (!url) return;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(showToast).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }

      function fallbackCopy() {
        const tempInput = document.createElement('input');
        tempInput.value = url;
        document.body.appendChild(tempInput);
        tempInput.select();
        try {
          document.execCommand('copy');
          showToast();
        } catch (e) {
          alert('Link de instalação: ' + url);
        }
        document.body.removeChild(tempInput);
      }

      function showToast() {
        const toast = document.getElementById('copy-toast');
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 2500);
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
