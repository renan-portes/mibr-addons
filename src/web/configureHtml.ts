import { manifest } from "../addon/manifest.js";
import type { ChannelStore } from "../tv/channelStore.js";

export function renderConfigureHtml(hostUrl: string, channelStore?: ChannelStore): string {
  const version = manifest.version;
  const stats = channelStore?.getStats() ?? { totalChannels: 0, genres: {} };

  // Category metadata with icons
  const CATEGORY_ICONS: Record<string, string> = {
    Esportes: "⚽",
    "Filmes & Séries": "🍿",
    Abertos: "📺",
    Streaming: "🎬",
    Documentários: "🦁",
    Infantil: "🎈",
    Entretenimento: "🎭",
    Notícias: "📰",
  };

  const genresList = [
    "Esportes",
    "Filmes & Séries",
    "Abertos",
    "Streaming",
    "Documentários",
    "Infantil",
    "Entretenimento",
    "Notícias",
  ];

  const genresJson = JSON.stringify(genresList);
  const statsGenresJson = JSON.stringify(stats.genres);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MIBR TV 🇧🇷 — Configuração do Addon</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #070a12;
      --card-bg: #0d121f;
      --card-border: #192236;
      --card-inner: #090d16;
      --card-inner-border: #151c2d;
      --accent: #00e676;
      --accent-glow: rgba(0, 230, 118, 0.25);
      --fenix-orange: #ff6b35;
      --fenix-glow: rgba(255, 107, 53, 0.25);
      --gold: #ffd700;
      --azure: #00b0ff;
      --text: #f0f6fc;
      --text-muted: #8b9eb7;
      --text-dim: #52637a;
      --success: #10b981;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2.5rem 1rem 3.5rem;
    }

    .container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
    }

    /* Main Container Card */
    .app-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 2.2rem 1.8rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.65);
    }

    @media (max-width: 480px) {
      .app-card {
        padding: 1.5rem 1.1rem;
        border-radius: 18px;
      }
    }

    /* Header */
    header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .brand-logo {
      max-width: 130px;
      height: auto;
      margin-bottom: 0.8rem;
      filter: drop-shadow(0 6px 20px var(--accent-glow));
    }

    .logo-box {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      margin-bottom: 0.3rem;
    }

    .logo {
      font-size: 2.3rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, var(--accent), var(--gold), var(--azure));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.6rem;
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
      max-width: 460px;
      margin: 0.3rem auto 0;
    }

    /* Section Headers */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1.8rem;
      margin-bottom: 0.8rem;
    }

    .section-title {
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .section-badge {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--accent);
      background: rgba(0, 230, 118, 0.1);
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      border: 1px solid rgba(0, 230, 118, 0.2);
    }

    /* Grid for Toggles */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.65rem;
    }

    @media (max-width: 520px) {
      .grid-2 {
        grid-template-columns: 1fr;
      }
    }

    /* Switch Card */
    .switch-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--card-inner);
      border: 1px solid var(--card-inner-border);
      border-radius: 12px;
      padding: 0.8rem 0.95rem;
      transition: border-color 0.2s, background 0.2s;
      cursor: pointer;
      user-select: none;
    }

    .switch-card:hover {
      border-color: #243048;
    }

    .switch-label {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--text);
    }

    .switch-sublabel {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--text-muted);
    }

    /* Modern Switch (Toggle) */
    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      flex-shrink: 0;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #182236;
      transition: 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 9999px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.4);
    }

    input:checked + .slider {
      background-color: var(--accent);
      box-shadow: 0 0 10px var(--accent-glow);
    }

    input:checked + .slider.slider-orange {
      background-color: var(--fenix-orange);
      box-shadow: 0 0 10px var(--fenix-glow);
    }

    input:checked + .slider:before {
      transform: translateX(20px);
    }

    /* Master Switch Card */
    .master-switch-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 107, 53, 0.05);
      border: 1px solid rgba(255, 107, 53, 0.25);
      border-radius: 14px;
      padding: 0.95rem 1.1rem;
      margin-bottom: 0.85rem;
      cursor: pointer;
      user-select: none;
    }

    .master-title {
      font-size: 0.98rem;
      font-weight: 700;
      color: var(--text);
    }

    .fenix-box {
      border: 1px solid var(--card-inner-border);
      border-radius: 14px;
      padding: 1.1rem;
      background: rgba(7, 10, 18, 0.5);
      margin-bottom: 0.5rem;
    }

    .fenix-brand {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      margin-bottom: 0.8rem;
    }

    .fenix-logo-img {
      width: 34px;
      height: 34px;
      border-radius: 8px;
    }

    .fenix-attribution {
      font-size: 0.78rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    .fenix-attribution strong {
      color: var(--text);
    }

    .sub-section-title {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-dim);
      margin: 1rem 0 0.5rem;
    }

    .sub-section-title:first-of-type {
      margin-top: 0.4rem;
    }

    /* Stream Proxy Banner */
    .security-badge {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      background: rgba(0, 176, 255, 0.08);
      border: 1px solid rgba(0, 176, 255, 0.22);
      border-radius: 12px;
      padding: 0.8rem 1rem;
      font-size: 0.82rem;
      color: #90caf9;
      margin-bottom: 1.2rem;
    }

    /* Preview Box */
    .preview-section {
      margin-top: 2rem;
    }

    .preview-box {
      background: #06080e;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 0.85rem 1rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8rem;
      color: #90caf9;
      word-break: break-all;
      line-height: 1.5;
      min-height: 52px;
      display: flex;
      align-items: center;
    }

    /* Action Buttons */
    .actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.2rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      width: 100%;
      padding: 1rem 1.5rem;
      font-size: 1rem;
      font-weight: 700;
      border-radius: 12px;
      text-decoration: none;
      cursor: pointer;
      transition: transform 0.15s, filter 0.2s, background 0.2s;
      border: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent), #00b0ff);
      color: #040810;
      box-shadow: 0 4px 25px rgba(0, 230, 118, 0.35);
    }

    .btn-primary:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: var(--card-inner);
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
      padding: 0.6rem;
      background: rgba(16, 185, 129, 0.12);
      border-radius: 8px;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    footer {
      text-align: center;
      margin-top: 2.2rem;
      font-size: 0.8rem;
      color: var(--text-dim);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="app-card">
      <header>
        <img src="/mibr-logo.png" alt="MIBR TV 🇧🇷" class="brand-logo" />
        <div class="logo-box">
          <div class="logo">MIBR TV</div>
          <span class="badge">v${version} 🇧🇷</span>
        </div>
        <p class="subtitle">Transmissões de Canais de TV Ao Vivo, Filmes e Séries em Alta Definição no Stremio</p>
      </header>

      <div class="security-badge">
        <span>🛡️</span>
        <div>
          <strong>Stream Proxy Ativo:</strong> Seus links e servidores de IPTV são mascarados e protegidos contra vazamento de URL.
        </div>
      </div>

      <!-- SEÇÃO 1: TV AO VIVO -->
      <div class="section-header">
        <span class="section-title">📺 Canais de TV Ao Vivo</span>
        <span id="channel-count-badge" class="section-badge">${stats.totalChannels} de ${stats.totalChannels} canais ativos</span>
      </div>

      <!-- Catálogo Geral Toggle -->
      <div class="switch-card" style="margin-bottom: 0.65rem;" onclick="toggleInput('tv_all')">
        <div class="switch-label">
          <span>⭐ Catálogo Geral (Todos os Canais)</span>
          <span class="switch-sublabel">Exibe a fileira com todos os canais juntos no Stremio</span>
        </div>
        <label class="switch" onclick="event.stopPropagation()">
          <input type="checkbox" id="tv_all" checked onchange="updateConfiguration()" />
          <span class="slider"></span>
        </label>
      </div>

      <!-- Categorias Grid -->
      <div class="grid-2">
        ${genresList.map(genre => {
          const count = stats.genres[genre] ?? 0;
          const icon = CATEGORY_ICONS[genre] ?? "📺";
          const id = "genre_" + genre.toLowerCase().replace(/[^a-z0-9]/g, "_");
          return `
            <div class="switch-card" onclick="toggleInput('${id}')">
              <div class="switch-label">
                <span>${icon} ${genre}</span>
                <span class="switch-sublabel">${count} canais disponíveis</span>
              </div>
              <label class="switch" onclick="event.stopPropagation()">
                <input type="checkbox" id="${id}" data-genre="${genre}" data-count="${count}" checked onchange="updateConfiguration()" />
                <span class="slider"></span>
              </label>
            </div>
          `;
        }).join("")}
      </div>

      <!-- SEÇÃO 2: FILMES & SÉRIES (FENIXFLIX) -->
      <div class="section-header" style="margin-top: 2rem;">
        <span class="section-title">🎬 Filmes & Séries On-Demand</span>
      </div>

      <!-- Master Switch FenixFlix -->
      <div class="master-switch-card" onclick="toggleInput('fenix_enabled')">
        <div class="switch-label">
          <span class="master-title">Integrar Filmes e Séries On-Demand</span>
          <span class="switch-sublabel">Ativa catálogos e streams do FenixFlix integrados ao addon</span>
        </div>
        <label class="switch" onclick="event.stopPropagation()">
          <input type="checkbox" id="fenix_enabled" checked onchange="updateConfiguration()" />
          <span class="slider slider-orange"></span>
        </label>
      </div>

      <!-- FenixFlix Sub-Options (Collapsible) -->
      <div id="fenix-options-box" class="fenix-box">
        <div class="fenix-brand">
          <img src="/fenix-flix-logo.png" alt="FenixFlix" class="fenix-logo-img" onerror="this.style.display='none'" />
          <div class="fenix-attribution">
            <strong>FenixFlix Integration</strong> — Conteúdo sob demanda transmitido via integração direta com o addon público oficial FenixFlix (streams mantidos sem modificação).
          </div>
        </div>

        <div class="sub-section-title">Qualidade de Vídeo</div>
        <div class="grid-2">
          <div class="switch-card" onclick="toggleInput('q_4k')">
            <span class="switch-label">4K (2160p)</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="q_4k" data-quality="4k" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
          <div class="switch-card" onclick="toggleInput('q_1080p')">
            <span class="switch-label">Full HD (1080p)</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="q_1080p" data-quality="1080p" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
          <div class="switch-card" onclick="toggleInput('q_720p')">
            <span class="switch-label">HD (720p)</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="q_720p" data-quality="720p" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
          <div class="switch-card" onclick="toggleInput('q_sd')">
            <span class="switch-label">SD (480p)</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="q_sd" data-quality="sd" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
          <div class="switch-card" onclick="toggleInput('q_cam')">
            <span class="switch-label">Câmera (CAM/TS)</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="q_cam" data-quality="cam" onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
        </div>

        <div class="sub-section-title">Opções de Áudio</div>
        <div class="grid-2">
          <div class="switch-card" onclick="toggleInput('a_dublado')">
            <span class="switch-label">Dublado (PT-BR)</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="a_dublado" data-audio="dublado" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
          <div class="switch-card" onclick="toggleInput('a_legendado')">
            <span class="switch-label">Legendado (Original)</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="a_legendado" data-audio="legendado" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
        </div>

        <div class="sub-section-title">Catálogos no Stremio</div>
        <div class="grid-2">
          <div class="switch-card" onclick="toggleInput('cat_populares_movie')">
            <span class="switch-label">Filmes Populares</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="cat_populares_movie" data-cat="populares_movie" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
          <div class="switch-card" onclick="toggleInput('cat_populares_series')">
            <span class="switch-label">Séries Populares</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="cat_populares_series" data-cat="populares_series" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
          <div class="switch-card" onclick="toggleInput('cat_recentes_movie')">
            <span class="switch-label">Filmes Recém Adicionados</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="cat_recentes_movie" data-cat="recentes_movie" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
          <div class="switch-card" onclick="toggleInput('cat_recentes_series')">
            <span class="switch-label">Séries Recém Adicionadas</span>
            <label class="switch" onclick="event.stopPropagation()">
              <input type="checkbox" id="cat_recentes_series" data-cat="recentes_series" checked onchange="updateConfiguration()" />
              <span class="slider slider-orange"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- SEÇÃO 3: LINK GERADO (PREVIEW) -->
      <div class="preview-section">
        <div class="section-title" style="margin-bottom: 0.5rem;">Link Gerado (Preview)</div>
        <div id="manifest-preview" class="preview-box">...</div>
      </div>

      <!-- Ações -->
      <div class="actions">
        <a id="install-btn" href="#" class="btn btn-primary" onclick="installInStremio(event)">🚀 Instalar no Stremio</a>
        <button type="button" id="copy-btn" class="btn btn-secondary" onclick="copyManifestLink(event)">📋 Copiar Link</button>
        <div id="copy-toast" class="copy-toast">✓ Link copiado para a área de transferência!</div>
      </div>

      <footer>
        MIBR TV 🇧🇷 — Made in Brasil. Addon autossuficiente para Stremio.
      </footer>
    </div>
  </div>

  <script>
    const HOST_URL = ${JSON.stringify(hostUrl)};
    const ALL_GENRES = ${genresJson};
    const GENRES_STATS = ${statsGenresJson};
    const TOTAL_CHANNELS = ${stats.totalChannels};

    function toggleInput(id) {
      const input = document.getElementById(id);
      if (input) {
        input.checked = !input.checked;
        updateConfiguration();
      }
    }

    function getSelectedTvGenres() {
      const genres = [];
      document.querySelectorAll('[data-genre]').forEach(el => {
        if (el.checked) genres.push(el.getAttribute('data-genre'));
      });
      return genres;
    }

    function getSelectedQualities() {
      const q = [];
      document.querySelectorAll('[data-quality]').forEach(el => {
        if (el.checked) q.push(el.getAttribute('data-quality'));
      });
      return q;
    }

    function getSelectedAudio() {
      const a = [];
      document.querySelectorAll('[data-audio]').forEach(el => {
        if (el.checked) a.push(el.getAttribute('data-audio'));
      });
      return a;
    }

    function getSelectedCatalogs() {
      const c = [];
      document.querySelectorAll('[data-cat]').forEach(el => {
        if (el.checked) c.push(el.getAttribute('data-cat'));
      });
      return c;
    }

    function computeManifestUrl() {
      const origin = (window.location.origin && window.location.origin !== 'null')
        ? window.location.origin
        : HOST_URL.replace(/\\/$/, '');

      const selectedGenres = getSelectedTvGenres();
      const tvAll = document.getElementById('tv_all').checked;
      const fenixEnabled = document.getElementById('fenix_enabled').checked;
      const qualities = getSelectedQualities();
      const audio = getSelectedAudio();
      const catalogs = getSelectedCatalogs();

      // Check if user has non-default settings
      const isDefaultGenres = selectedGenres.length === ALL_GENRES.length;
      const isDefaultQualities = qualities.join(',') === '4k,1080p,720p,sd';
      const isDefaultAudio = audio.join(',') === 'dublado,legendado';
      const isDefaultCatalogs = catalogs.join(',') === 'populares_movie,populares_series,recentes_movie,recentes_series';

      if (isDefaultGenres && tvAll && fenixEnabled && isDefaultQualities && isDefaultAudio && isDefaultCatalogs) {
        return origin + '/manifest.json';
      }

      const parts = [];

      if (!isDefaultGenres) {
        parts.push('tv_genres=' + (selectedGenres.length > 0 ? selectedGenres.join(',') : 'none'));
      }
      if (!tvAll) {
        parts.push('tv_all=false');
      }

      if (!fenixEnabled) {
        parts.push('fenix_enabled=false');
      } else {
        parts.push('qualities=' + (qualities.length > 0 ? qualities.join(',') : 'none'));
        parts.push('audio=' + (audio.length > 0 ? audio.join(',') : 'none'));
        parts.push('catalogs=' + (catalogs.length > 0 ? catalogs.join(',') : 'none'));
      }

      const configPath = encodeURIComponent(parts.join('|'));
      return origin + '/' + configPath + '/manifest.json';
    }

    function updateConfiguration() {
      // 1. Update TV channel count
      const selectedGenres = getSelectedTvGenres();
      let activeChannels = 0;
      selectedGenres.forEach(g => {
        activeChannels += (GENRES_STATS[g] || 0);
      });
      const countBadge = document.getElementById('channel-count-badge');
      if (countBadge) {
        countBadge.textContent = activeChannels + ' de ' + TOTAL_CHANNELS + ' canais ativos';
      }

      // 2. Toggle FenixFlix sub-options visibility
      const fenixEnabled = document.getElementById('fenix_enabled').checked;
      const fenixBox = document.getElementById('fenix-options-box');
      if (fenixBox) {
        fenixBox.style.display = fenixEnabled ? 'block' : 'none';
      }

      // 3. Update preview box and install href
      const manifestUrl = computeManifestUrl();
      const previewBox = document.getElementById('manifest-preview');
      if (previewBox) {
        previewBox.textContent = manifestUrl;
      }

      const installBtn = document.getElementById('install-btn');
      if (installBtn) {
        installBtn.href = manifestUrl.replace(/^https?:\\/\\//, 'stremio://');
      }
    }

    function installInStremio(evt) {
      if (evt) evt.preventDefault();
      const manifestUrl = computeManifestUrl();
      const stremioUrl = manifestUrl.replace(/^https?:\\/\\//, 'stremio://');
      window.location.href = stremioUrl;
    }

    function copyManifestLink(evt) {
      if (evt) evt.preventDefault();
      const manifestUrl = computeManifestUrl();

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

    // Initialize UI on load
    updateConfiguration();
  </script>
</body>
</html>`;
}
