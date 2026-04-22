(function () {
  'use strict';

  const STORAGE_KEYS = {
    ranking: 'prodradar_ranking',
    settings: 'prodradar_settings'
  };

  const ROOT_ID = 'pr-root';
  const DEFAULT_SETTINGS = {
    folderName: 'ranking',
    affiliateTag: '',
    autoOpenPanel: true,
    filterMode: 'all',
    sortMode: 'manual',
    searchQuery: '',
    downloadImages: true,
    downloadVideos: true,
    includeRelatedVideos: false
  };

  let state = {
    products: [],
    settings: { ...DEFAULT_SETTINGS },
    bulk: {
      jobId: '',
      total: 0,
      completed: 0,
      failed: 0,
      message: '',
      active: false,
      itemStates: {}
    }
  };

  const CSS = `
    #pr-root, #pr-root * { box-sizing: border-box !important; }
    #pr-root {
      font-family: Arial, sans-serif !important;
      color: #1e2a32 !important;
    }
    #pr-toggle {
      position: fixed !important;
      top: 50% !important;
      right: 0 !important;
      transform: translateY(-50%) !important;
      z-index: 2147483646 !important;
      padding: 14px 8px !important;
      border: 0 !important;
      border-radius: 12px 0 0 12px !important;
      background: linear-gradient(180deg, #d86a1c 0%, #a94f11 100%) !important;
      color: #fff !important;
      cursor: pointer !important;
      writing-mode: vertical-rl !important;
      text-orientation: mixed !important;
      letter-spacing: 0.08em !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      box-shadow: -4px 0 16px rgba(30, 42, 50, 0.2) !important;
      user-select: none !important;
    }
    #pr-dot {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 20px !important;
      height: 20px !important;
      margin-bottom: 8px !important;
      border-radius: 999px !important;
      background: rgba(255,255,255,0.18) !important;
      color: #fff !important;
      font-size: 10px !important;
      writing-mode: horizontal-tb !important;
    }
    #pr-panel {
      position: fixed !important;
      top: 0 !important;
      right: -430px !important;
      width: 410px !important;
      max-width: calc(100vw - 18px) !important;
      height: 100vh !important;
      z-index: 2147483645 !important;
      display: flex !important;
      flex-direction: column !important;
      background: linear-gradient(180deg, #f7f2ea 0%, #efe8dc 100%) !important;
      border-left: 1px solid rgba(30, 42, 50, 0.08) !important;
      box-shadow: -10px 0 24px rgba(30, 42, 50, 0.16) !important;
      transition: right 0.28s ease !important;
    }
    #pr-panel.pr-open { right: 0 !important; }
    #pr-header {
      padding: 16px !important;
      border-bottom: 1px solid rgba(30, 42, 50, 0.08) !important;
      background: rgba(255,255,255,0.72) !important;
      backdrop-filter: blur(6px) !important;
    }
    #pr-header-top {
      display: flex !important;
      align-items: flex-start !important;
      gap: 10px !important;
    }
    #pr-title-wrap { flex: 1 !important; }
    #pr-kicker {
      display: inline-flex !important;
      padding: 3px 8px !important;
      border-radius: 999px !important;
      background: #f3e5d3 !important;
      color: #a94f11 !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
      margin-bottom: 8px !important;
    }
    #pr-title {
      font-family: Georgia, 'Times New Roman', serif !important;
      font-size: 22px !important;
      line-height: 1 !important;
      margin: 0 !important;
      color: #1e2a32 !important;
    }
    #pr-subtitle {
      margin-top: 6px !important;
      font-size: 12px !important;
      line-height: 1.5 !important;
      color: #61707a !important;
    }
    #pr-close-btn {
      width: 34px !important;
      height: 34px !important;
      border-radius: 999px !important;
      border: 1px solid rgba(30, 42, 50, 0.12) !important;
      background: white !important;
      color: #1e2a32 !important;
      cursor: pointer !important;
      font-size: 18px !important;
    }
    #pr-summary {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 8px !important;
      margin-top: 14px !important;
    }
    .pr-stat {
      padding: 10px !important;
      border-radius: 12px !important;
      background: rgba(255,255,255,0.8) !important;
      border: 1px solid rgba(30, 42, 50, 0.08) !important;
    }
    .pr-stat-label {
      display: block !important;
      font-size: 10px !important;
      color: #61707a !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
      margin-bottom: 4px !important;
    }
    .pr-stat-value {
      display: block !important;
      font-size: 18px !important;
      font-weight: 700 !important;
      color: #1e2a32 !important;
    }
    #pr-toolbar {
      display: grid !important;
      grid-template-columns: 1fr 120px 120px !important;
      gap: 8px !important;
      padding: 12px 16px !important;
      border-bottom: 1px solid rgba(30, 42, 50, 0.08) !important;
      background: rgba(255,255,255,0.58) !important;
    }
    .pr-input, .pr-select {
      width: 100% !important;
      min-width: 0 !important;
      padding: 9px 10px !important;
      border-radius: 10px !important;
      border: 1px solid rgba(30, 42, 50, 0.14) !important;
      background: white !important;
      color: #1e2a32 !important;
      font-size: 12px !important;
      outline: none !important;
    }
    .pr-input:focus, .pr-select:focus {
      border-color: #d86a1c !important;
      box-shadow: 0 0 0 3px rgba(216,106,28,0.12) !important;
    }
    #pr-status {
      margin: 0 16px 12px !important;
      padding: 10px 12px !important;
      border-radius: 12px !important;
      background: rgba(255,255,255,0.72) !important;
      border: 1px solid rgba(30, 42, 50, 0.08) !important;
      font-size: 12px !important;
      color: #44515a !important;
      line-height: 1.5 !important;
    }
    #pr-list {
      flex: 1 !important;
      overflow-y: auto !important;
      padding: 0 16px 16px !important;
    }
    #pr-list::-webkit-scrollbar { width: 8px !important; }
    #pr-list::-webkit-scrollbar-thumb {
      background: rgba(30, 42, 50, 0.18) !important;
      border-radius: 999px !important;
    }
    .pr-empty {
      margin-top: 8px !important;
      padding: 26px 18px !important;
      border-radius: 16px !important;
      border: 1px dashed rgba(30, 42, 50, 0.18) !important;
      background: rgba(255,255,255,0.52) !important;
      text-align: center !important;
      font-size: 13px !important;
      color: #61707a !important;
      line-height: 1.7 !important;
    }
    .pr-item {
      display: flex !important;
      gap: 10px !important;
      align-items: flex-start !important;
      padding: 12px !important;
      margin-bottom: 10px !important;
      border-radius: 16px !important;
      background: white !important;
      border: 1px solid rgba(30, 42, 50, 0.08) !important;
      box-shadow: 0 8px 18px rgba(30, 42, 50, 0.06) !important;
    }
    .pr-item.pr-draggable { cursor: grab !important; }
    .pr-item.pr-dragging {
      opacity: 0.55 !important;
      border-style: dashed !important;
      border-color: #d86a1c !important;
    }
    .pr-pos {
      flex: 0 0 28px !important;
      width: 28px !important;
      height: 28px !important;
      border-radius: 999px !important;
      background: #1e2a32 !important;
      color: white !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      margin-top: 2px !important;
    }
    .pr-thumb {
      width: 58px !important;
      height: 58px !important;
      border-radius: 10px !important;
      object-fit: contain !important;
      background: #f6f3ee !important;
      border: 1px solid rgba(30, 42, 50, 0.08) !important;
      flex: 0 0 58px !important;
    }
    .pr-info {
      min-width: 0 !important;
      flex: 1 !important;
    }
    .pr-title {
      font-size: 12px !important;
      line-height: 1.45 !important;
      color: #1e2a32 !important;
      margin-bottom: 6px !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 2 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
    }
    .pr-meta {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      margin-bottom: 6px !important;
    }
    .pr-chip {
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
      padding: 3px 8px !important;
      border-radius: 999px !important;
      background: #f2ebdf !important;
      color: #5d6870 !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
    }
    .pr-chip.video {
      background: #eaf4ed !important;
      color: #1f7a3f !important;
    }
    .pr-price {
      font-size: 12px !important;
      font-weight: 700 !important;
      color: #b24c12 !important;
    }
    .pr-link {
      font-size: 11px !important;
      color: #61707a !important;
      text-decoration: none !important;
    }
    .pr-link:hover { color: #a94f11 !important; }
    .pr-actions {
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
    }
    .pr-btn {
      width: 28px !important;
      height: 28px !important;
      border-radius: 10px !important;
      border: 1px solid rgba(30, 42, 50, 0.1) !important;
      background: #f8f4ec !important;
      color: #1e2a32 !important;
      cursor: pointer !important;
      font-size: 12px !important;
      font-weight: 700 !important;
    }
    .pr-btn:hover { border-color: #d86a1c !important; color: #a94f11 !important; }
    #pr-footer {
      padding: 16px !important;
      border-top: 1px solid rgba(30, 42, 50, 0.08) !important;
      background: rgba(255,255,255,0.72) !important;
    }
    #pr-settings {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
      margin-bottom: 10px !important;
    }
    .pr-setting-full { grid-column: 1 / -1 !important; }
    .pr-field-label {
      display: block !important;
      margin-bottom: 5px !important;
      font-size: 10px !important;
      color: #61707a !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
    }
    .pr-check-grid {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
      margin-bottom: 12px !important;
    }
    .pr-check {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 8px 10px !important;
      border-radius: 12px !important;
      background: #f7f2ea !important;
      border: 1px solid rgba(30, 42, 50, 0.08) !important;
      font-size: 12px !important;
      color: #44515a !important;
    }
    .pr-check input { accent-color: #d86a1c !important; }
    .pr-button-row {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
      margin-bottom: 8px !important;
    }
    .pr-primary,
    .pr-secondary,
    .pr-ghost {
      width: 100% !important;
      border-radius: 12px !important;
      border: 0 !important;
      padding: 10px 12px !important;
      cursor: pointer !important;
      font-size: 12px !important;
      font-weight: 700 !important;
    }
    .pr-primary {
      background: linear-gradient(180deg, #d86a1c 0%, #a94f11 100%) !important;
      color: white !important;
    }
    .pr-secondary {
      background: #1e2a32 !important;
      color: white !important;
    }
    .pr-ghost {
      background: #f8f4ec !important;
      color: #44515a !important;
      border: 1px solid rgba(30, 42, 50, 0.1) !important;
    }
    #pr-notification {
      position: fixed !important;
      right: 20px !important;
      bottom: 20px !important;
      z-index: 2147483647 !important;
      padding: 10px 14px !important;
      border-radius: 999px !important;
      background: #1e2a32 !important;
      color: white !important;
      opacity: 0 !important;
      transform: translateY(8px) !important;
      transition: opacity 0.2s ease, transform 0.2s ease !important;
      pointer-events: none !important;
      font-size: 12px !important;
      box-shadow: 0 10px 20px rgba(30, 42, 50, 0.22) !important;
    }
    #pr-notification.pr-show {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
  `;

  function createRoot() {
    if (document.getElementById(ROOT_ID)) return;

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <style>${CSS}</style>
      <div id="pr-toggle"><span id="pr-dot">0</span> PRODRADAR</div>
      <aside id="pr-panel">
        <div id="pr-header">
          <div id="pr-header-top">
            <div id="pr-title-wrap">
              <span id="pr-kicker">ProdRadar</span>
              <h2 id="pr-title">Ranking board</h2>
              <div id="pr-subtitle">Filtra, ordena, exporta y descarga assets sin salir de Amazon.</div>
            </div>
            <button id="pr-close-btn" type="button" aria-label="Cerrar">x</button>
          </div>
          <div id="pr-summary">
            <div class="pr-stat">
              <span class="pr-stat-label">Total</span>
              <span class="pr-stat-value" id="pr-stat-total">0</span>
            </div>
            <div class="pr-stat">
              <span class="pr-stat-label">Con video</span>
              <span class="pr-stat-value" id="pr-stat-video">0</span>
            </div>
            <div class="pr-stat">
              <span class="pr-stat-label">Visibles</span>
              <span class="pr-stat-value" id="pr-stat-visible">0</span>
            </div>
          </div>
        </div>
        <div id="pr-toolbar">
          <input id="pr-search" class="pr-input" type="search" placeholder="Buscar por titulo o ASIN">
          <select id="pr-filter" class="pr-select">
            <option value="all">Todos</option>
            <option value="video">Solo video</option>
            <option value="no-video">Sin video</option>
          </select>
          <select id="pr-sort" class="pr-select">
            <option value="manual">Orden manual</option>
            <option value="recent">Mas recientes</option>
            <option value="title">Titulo A-Z</option>
            <option value="price-desc">Precio alto</option>
            <option value="price-asc">Precio bajo</option>
          </select>
        </div>
        <div id="pr-status">Listo para capturar productos.</div>
        <div id="pr-list"></div>
        <div id="pr-footer">
          <div id="pr-settings">
            <div>
              <label class="pr-field-label" for="pr-folder-input">Carpeta</label>
              <input id="pr-folder-input" class="pr-input" type="text" placeholder="nombre-del-proyecto" spellcheck="false">
            </div>
            <div>
              <label class="pr-field-label" for="pr-tag-input">Tag afiliado</label>
              <input id="pr-tag-input" class="pr-input" type="text" placeholder="mitag-21" spellcheck="false">
            </div>
            <div class="pr-setting-full pr-check-grid">
              <label class="pr-check"><input id="pr-check-images" type="checkbox"> Descargar imagenes</label>
              <label class="pr-check"><input id="pr-check-videos" type="checkbox"> Descargar videos</label>
              <label class="pr-check"><input id="pr-check-related" type="checkbox"> Incluir relacionados</label>
              <label class="pr-check"><input id="pr-check-open" type="checkbox"> Auto abrir panel</label>
            </div>
          </div>
          <div class="pr-button-row">
            <button id="pr-btn-download" class="pr-primary" type="button">Descargar assets</button>
            <button id="pr-btn-briefing" class="pr-secondary" type="button">Export TXT</button>
          </div>
          <div class="pr-button-row">
            <button id="pr-btn-csv" class="pr-ghost" type="button">Export CSV</button>
            <button id="pr-btn-json" class="pr-ghost" type="button">Export JSON</button>
          </div>
          <button id="pr-btn-clear" class="pr-ghost" type="button">Vaciar ranking</button>
        </div>
      </aside>
      <div id="pr-notification"></div>
    `;

    document.body.appendChild(root);
  }

  function loadStorage() {
    chrome.storage.local.get([STORAGE_KEYS.ranking, STORAGE_KEYS.settings], result => {
      state.products = result[STORAGE_KEYS.ranking] || [];
      state.settings = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.settings] || {}) };
      hydrateInputs();
      render();
    });
  }

  function saveRanking(products) {
    state.products = products;
    chrome.storage.local.set({ [STORAGE_KEYS.ranking]: products });
  }

  function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });
  }

  function hydrateInputs() {
    document.getElementById('pr-folder-input').value = state.settings.folderName;
    document.getElementById('pr-tag-input').value = state.settings.affiliateTag;
    document.getElementById('pr-search').value = state.settings.searchQuery;
    document.getElementById('pr-filter').value = state.settings.filterMode;
    document.getElementById('pr-sort').value = state.settings.sortMode;
    document.getElementById('pr-check-images').checked = state.settings.downloadImages;
    document.getElementById('pr-check-videos').checked = state.settings.downloadVideos;
    document.getElementById('pr-check-related').checked = state.settings.includeRelatedVideos;
    document.getElementById('pr-check-open').checked = state.settings.autoOpenPanel;
  }

  function sanitizeFolderName(value) {
    return (value || 'ranking')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .trim()
      .slice(0, 80) || 'ranking';
  }

  function sanitizeText(value, fallback = '') {
    return (value || fallback)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function parsePrice(price) {
    if (!price) return Number.NaN;
    const cleaned = price.replace(/[^0-9,.-]/g, '');
    if (!cleaned) return Number.NaN;

    const commaCount = (cleaned.match(/,/g) || []).length;
    const dotCount = (cleaned.match(/\./g) || []).length;
    let normalized = cleaned;

    if (commaCount && dotCount) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (commaCount > 1) {
      normalized = cleaned.replace(/,/g, '');
    } else if (commaCount === 1 && !dotCount) {
      normalized = cleaned.replace(',', '.');
    }

    return parseFloat(normalized);
  }

  function getProductBaseUrl(asin) {
    return `${location.origin}/dp/${asin}`;
  }

  function getAffiliateUrl(asin) {
    const baseUrl = getProductBaseUrl(asin);
    const tag = state.settings.affiliateTag.trim();
    return tag ? `${baseUrl}/?tag=${encodeURIComponent(tag)}` : baseUrl;
  }

  function getVisibleProducts() {
    const query = state.settings.searchQuery.trim().toLowerCase();
    const filter = state.settings.filterMode;
    const sort = state.settings.sortMode;

    let items = state.products
      .map((product, index) => ({ ...product, originalIndex: index }))
      .filter(product => {
        if (filter === 'video' && !product.hasVideo) return false;
        if (filter === 'no-video' && product.hasVideo) return false;
        if (!query) return true;
        return `${product.title} ${product.asin}`.toLowerCase().includes(query);
      });

    if (sort === 'recent') {
      items = items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    } else if (sort === 'title') {
      items = items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sort === 'price-desc') {
      items = items.sort((a, b) => (parsePrice(b.price) || -1) - (parsePrice(a.price) || -1));
    } else if (sort === 'price-asc') {
      items = items.sort((a, b) => {
        const aValue = parsePrice(a.price);
        const bValue = parsePrice(b.price);
        if (Number.isNaN(aValue)) return 1;
        if (Number.isNaN(bValue)) return -1;
        return aValue - bValue;
      });
    }

    return items;
  }

  function render() {
    const visibleProducts = getVisibleProducts();
    const total = state.products.length;
    const withVideo = state.products.filter(product => product.hasVideo).length;

    document.getElementById('pr-dot').textContent = String(total);
    document.getElementById('pr-stat-total').textContent = String(total);
    document.getElementById('pr-stat-video').textContent = String(withVideo);
    document.getElementById('pr-stat-visible').textContent = String(visibleProducts.length);
    document.getElementById('pr-status').textContent = buildStatusLine();

    const list = document.getElementById('pr-list');
    if (!visibleProducts.length) {
      list.innerHTML = `
        <div class="pr-empty">
          Tu ranking esta vacio o no coincide con los filtros activos.<br>
          Pasa el raton por un producto y usa <strong>+ Ranking</strong> para empezar.
        </div>
      `;
      return;
    }

    const draggable = state.settings.sortMode === 'manual' &&
      state.settings.filterMode === 'all' &&
      !state.settings.searchQuery.trim();

    list.innerHTML = visibleProducts.map((product, index) => `
      <article class="pr-item ${draggable ? 'pr-draggable' : ''}" data-asin="${escapeHtml(product.asin)}" ${draggable ? 'draggable="true"' : ''}>
        <div class="pr-pos">${index + 1}</div>
        <img class="pr-thumb" src="${escapeHtml(product.imageUrl || '')}" alt="" onerror="this.style.display='none'">
        <div class="pr-info">
          <div class="pr-title">${escapeHtml(product.title || 'Producto sin titulo')}</div>
          <div class="pr-meta">
            <span class="pr-chip ${product.hasVideo ? 'video' : ''}">${product.hasVideo ? 'Video' : 'Sin video'}</span>
            <span class="pr-chip">${escapeHtml(product.asin)}</span>
            ${product.price ? `<span class="pr-chip">${escapeHtml(product.price)}</span>` : ''}
          </div>
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <a class="pr-link" href="${escapeHtml(getProductBaseUrl(product.asin))}" target="_blank" rel="noreferrer">Abrir producto</a>
            <span class="pr-price">${escapeHtml(product.price || 'Sin precio')}</span>
          </div>
        </div>
        <div class="pr-actions">
          <button class="pr-btn" data-action="copy" data-asin="${escapeHtml(product.asin)}" title="Copiar enlace">Ln</button>
          <button class="pr-btn" data-action="remove" data-asin="${escapeHtml(product.asin)}" title="Quitar">X</button>
        </div>
      </article>
    `).join('');

    if (draggable) bindDragAndDrop();
    bindItemButtons();
  }

  function buildStatusLine() {
    if (!state.bulk.active) {
      return `${state.products.length} productos guardados. Ajusta filtros, exporta o descarga assets.`;
    }

    const percent = state.bulk.total ? Math.round(((state.bulk.completed + state.bulk.failed) / state.bulk.total) * 100) : 0;
    return `Descarga en curso: ${state.bulk.completed}/${state.bulk.total} completados, ${state.bulk.failed} con error. ${state.bulk.message || `${percent}%`}`;
  }

  function bindItemButtons() {
    document.querySelectorAll('.pr-btn[data-action="remove"]').forEach(button => {
      button.addEventListener('click', () => {
        const asin = button.dataset.asin;
        saveRanking(state.products.filter(product => product.asin !== asin));
        render();
        showNotification('Producto eliminado del ranking');
      });
    });

    document.querySelectorAll('.pr-btn[data-action="copy"]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(getAffiliateUrl(button.dataset.asin));
          showNotification('Enlace copiado al portapapeles');
        } catch (_) {
          showNotification('No se pudo copiar el enlace');
        }
      });
    });
  }

  function bindDragAndDrop() {
    let draggedAsin = '';

    document.querySelectorAll('.pr-item.pr-draggable').forEach(item => {
      item.addEventListener('dragstart', event => {
        draggedAsin = item.dataset.asin;
        item.classList.add('pr-dragging');
        event.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragover', event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', event => {
        event.preventDefault();
        const targetAsin = item.dataset.asin;
        if (!draggedAsin || draggedAsin === targetAsin) return;

        const products = [...state.products];
        const sourceIndex = products.findIndex(product => product.asin === draggedAsin);
        const targetIndex = products.findIndex(product => product.asin === targetAsin);
        if (sourceIndex === -1 || targetIndex === -1) return;

        const [moved] = products.splice(sourceIndex, 1);
        products.splice(targetIndex, 0, moved);
        saveRanking(products);
        render();
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('pr-dragging');
        draggedAsin = '';
      });
    });
  }

  function addProduct(product) {
    if (!product?.asin) return;

    if (state.products.some(item => item.asin === product.asin)) {
      showNotification('Ese producto ya esta en el ranking');
      return;
    }

    const nextProducts = [...state.products, { ...product, addedAt: product.addedAt || Date.now() }];
    saveRanking(nextProducts);
    render();
    showNotification('Producto anadido al ranking');

    if (state.settings.autoOpenPanel) {
      document.getElementById('pr-panel').classList.add('pr-open');
    }
  }

  function buildExportRows() {
    return state.products.map((product, index) => ({
      position: index + 1,
      asin: product.asin,
      title: product.title || '',
      price: product.price || '',
      hasVideo: product.hasVideo ? 'YES' : 'NO',
      productUrl: getProductBaseUrl(product.asin),
      affiliateUrl: getAffiliateUrl(product.asin),
      imageUrl: product.imageUrl || ''
    }));
  }

  function downloadTextFile(filename, content, mimeType) {
    const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
    chrome.runtime.sendMessage({ action: 'downloadFile', url: dataUrl, filename }, () => void chrome.runtime.lastError);
  }
  function exportBriefing() {
    const rows = buildExportRows();
    if (!rows.length) {
      showNotification('No hay productos para exportar');
      return;
    }

    const lines = [
      'PRODRADAR - RANKING BRIEF',
      '=========================',
      `Date: ${new Date().toLocaleDateString('es-ES')}`,
      `Products: ${rows.length}`,
      `With video: ${rows.filter(row => row.hasVideo === 'YES').length}`,
      `Affiliate tag: ${state.settings.affiliateTag || '(none)'}`,
      ''
    ];

    rows.forEach(row => {
      lines.push(`#${row.position} - ${row.title}`);
      lines.push(`ASIN: ${row.asin}`);
      lines.push(`Price: ${row.price || 'N/A'}`);
      lines.push(`Video: ${row.hasVideo}`);
      lines.push(`URL: ${row.productUrl}`);
      lines.push(`Affiliate: ${row.affiliateUrl}`);
      lines.push(`Image: ${row.imageUrl}`);
      lines.push('');
    });

    downloadTextFile(`${sanitizeFolderName(state.settings.folderName)}/briefing.txt`, lines.join('\n'), 'text/plain');
    showNotification('Briefing TXT exportado');
  }

  function exportCsv() {
    const rows = buildExportRows();
    if (!rows.length) {
      showNotification('No hay productos para exportar');
      return;
    }

    const header = ['position', 'asin', 'title', 'price', 'hasVideo', 'productUrl', 'affiliateUrl', 'imageUrl'];
    const csv = [header.join(',')]
      .concat(rows.map(row => header.map(key => `"${String(row[key]).replace(/"/g, '""')}"`).join(',')))
      .join('\n');

    downloadTextFile(`${sanitizeFolderName(state.settings.folderName)}/ranking.csv`, csv, 'text/csv');
    showNotification('CSV exportado');
  }

  function exportJson() {
    const rows = buildExportRows();
    if (!rows.length) {
      showNotification('No hay productos para exportar');
      return;
    }

    downloadTextFile(
      `${sanitizeFolderName(state.settings.folderName)}/ranking.json`,
      JSON.stringify(rows, null, 2),
      'application/json'
    );
    showNotification('JSON exportado');
  }

  function startBulkDownload() {
    if (!state.products.length) {
      showNotification('El ranking esta vacio');
      return;
    }

    if (!state.settings.downloadImages && !state.settings.downloadVideos) {
      showNotification('Activa al menos una opcion de descarga');
      return;
    }

    const rootFolder = sanitizeFolderName(state.settings.folderName);
    const totalTasks = state.products.reduce((total, product) => {
      let count = total;
      if (state.settings.downloadImages && product.imageUrl) count += 1;
      if (state.settings.downloadVideos && product.hasVideo) count += 1;
      return count;
    }, 0);

    if (!totalTasks) {
      showNotification('No hay assets descargables con la configuracion actual');
      return;
    }

    const jobId = `bulk-${Date.now()}`;
    state.bulk = {
      jobId,
      total: totalTasks,
      completed: 0,
      failed: 0,
      message: 'Preparando assets',
      active: true,
      itemStates: {}
    };
    render();

    state.products.forEach((product, index) => {
      const position = String(index + 1).padStart(2, '0');
      const folder = `${rootFolder}/${position}_${product.asin}`;
      const safeTitle = sanitizeText(product.title, 'producto').slice(0, 60) || 'producto';

      if (state.settings.downloadImages && product.imageUrl) {
        const imageUrl = product.imageUrl.replace(/\._[^.]+_(\.\w+)$/, '$1');
        chrome.runtime.sendMessage({
          action: 'downloadFile',
          url: imageUrl,
          filename: `${folder}/image.jpg`,
          job: {
            jobId,
            itemId: `image-${product.asin}`,
            label: `${product.asin} image`,
            total: totalTasks
          }
        }, () => void chrome.runtime.lastError);
      }

      if (state.settings.downloadVideos && product.hasVideo) {
        chrome.runtime.sendMessage({
          action: 'fetchAndDownloadVideo',
          asin: product.asin,
          origin: location.origin,
          includeRelated: state.settings.includeRelatedVideos,
          filename: `${folder}/${safeTitle}`,
          job: {
            jobId,
            itemId: `video-${product.asin}`,
            label: `${product.asin} video`,
            total: totalTasks
          }
        }, () => void chrome.runtime.lastError);
      }
    });

    showNotification(`Descarga iniciada en la carpeta ${rootFolder}`);
  }

  function handleProgress(message) {
    if (message.action !== 'jobProgress') return;
    if (!state.bulk.active || message.jobId !== state.bulk.jobId) return;

    state.bulk.itemStates[message.itemId] = message.status;
    state.bulk.message = `${message.label || 'Asset'}: ${message.message || message.status}`;
    state.bulk.completed = Object.values(state.bulk.itemStates).filter(status => status === 'completed').length;
    state.bulk.failed = Object.values(state.bulk.itemStates).filter(status => status === 'failed').length;

    if (state.bulk.completed + state.bulk.failed >= state.bulk.total) {
      state.bulk.active = false;
      state.bulk.message = state.bulk.failed
        ? `Proceso terminado con ${state.bulk.failed} errores`
        : 'Descarga completada';
      showNotification(state.bulk.message);
    }

    render();
  }

  function showNotification(message) {
    const toast = document.getElementById('pr-notification');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('pr-show');
    clearTimeout(showNotification.timer);
    showNotification.timer = setTimeout(() => toast.classList.remove('pr-show'), 2200);
  }

  function bindEvents() {
    document.getElementById('pr-toggle').addEventListener('click', () => {
      document.getElementById('pr-panel').classList.toggle('pr-open');
    });

    document.getElementById('pr-close-btn').addEventListener('click', () => {
      document.getElementById('pr-panel').classList.remove('pr-open');
    });

    document.getElementById('pr-search').addEventListener('input', event => {
      saveSettings({ searchQuery: event.target.value });
      render();
    });

    document.getElementById('pr-filter').addEventListener('change', event => {
      saveSettings({ filterMode: event.target.value });
      render();
    });

    document.getElementById('pr-sort').addEventListener('change', event => {
      saveSettings({ sortMode: event.target.value });
      render();
    });

    document.getElementById('pr-folder-input').addEventListener('change', event => {
      const folderName = sanitizeFolderName(event.target.value);
      event.target.value = folderName;
      saveSettings({ folderName });
    });

    document.getElementById('pr-tag-input').addEventListener('change', event => {
      saveSettings({ affiliateTag: sanitizeText(event.target.value).replace(/\s+/g, '') });
      hydrateInputs();
      render();
    });

    document.getElementById('pr-check-images').addEventListener('change', event => {
      saveSettings({ downloadImages: event.target.checked });
    });

    document.getElementById('pr-check-videos').addEventListener('change', event => {
      saveSettings({ downloadVideos: event.target.checked });
    });

    document.getElementById('pr-check-related').addEventListener('change', event => {
      saveSettings({ includeRelatedVideos: event.target.checked });
    });

    document.getElementById('pr-check-open').addEventListener('change', event => {
      saveSettings({ autoOpenPanel: event.target.checked });
    });

    document.getElementById('pr-btn-download').addEventListener('click', startBulkDownload);
    document.getElementById('pr-btn-briefing').addEventListener('click', exportBriefing);
    document.getElementById('pr-btn-csv').addEventListener('click', exportCsv);
    document.getElementById('pr-btn-json').addEventListener('click', exportJson);

    document.getElementById('pr-btn-clear').addEventListener('click', () => {
      if (!state.products.length) {
        showNotification('No hay productos que borrar');
        return;
      }

      if (!confirm('Quieres vaciar todo el ranking?')) return;
      saveRanking([]);
      render();
      showNotification('Ranking vaciado');
    });

    window.addEventListener('prodradar:add', event => addProduct(event.detail));
    chrome.runtime.onMessage.addListener(handleProgress);
  }

  function escapeHtml(value) {
    return (value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function init() {
    createRoot();
    bindEvents();
    loadStorage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
