// =====================================================
//  PRODRADAR - Sidebar de Ranking
//  Panel lateral inyectado en páginas de Amazon
// =====================================================

(function () {
  'use strict';

  const STORAGE_KEY = 'prodradar_ranking';
  const ROOT_ID     = 'pr-root';

  // ── ESTILOS (todos con !important para no ser sobreescritos por Amazon) ──────

  const CSS = `
    /* ---- Toggle lateral ---- */
    #pr-toggle {
      position: fixed !important;
      right: 0 !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      z-index: 2147483646 !important;
      background: #131921 !important;
      color: white !important;
      writing-mode: vertical-rl !important;
      text-orientation: mixed !important;
      padding: 14px 8px !important;
      border-radius: 10px 0 0 10px !important;
      cursor: pointer !important;
      font-family: Arial, sans-serif !important;
      font-size: 12px !important;
      font-weight: bold !important;
      letter-spacing: 1px !important;
      box-shadow: -2px 0 10px rgba(0,0,0,0.3) !important;
      transition: background 0.2s !important;
      user-select: none !important;
      line-height: 1 !important;
      border: none !important;
      margin: 0 !important;
    }
    #pr-toggle:hover { background: #ff6b00 !important; }

    #pr-dot {
      display: inline-block !important;
      background: #ff6b00 !important;
      color: white !important;
      border-radius: 50% !important;
      width: 18px !important;
      height: 18px !important;
      font-size: 10px !important;
      line-height: 18px !important;
      text-align: center !important;
      writing-mode: horizontal-tb !important;
      margin-bottom: 6px !important;
    }

    /* ---- Panel principal ---- */
    #pr-panel {
      position: fixed !important;
      top: 0 !important;
      right: -380px !important;
      width: 360px !important;
      height: 100vh !important;
      z-index: 2147483645 !important;
      background: #f0f2f5 !important;
      box-shadow: -4px 0 20px rgba(0,0,0,0.25) !important;
      display: flex !important;
      flex-direction: column !important;
      font-family: Arial, sans-serif !important;
      transition: right 0.3s ease !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
    }
    #pr-panel.pr-open { right: 0 !important; }

    /* ---- Header ---- */
    #pr-panel-header {
      background: #131921 !important;
      color: white !important;
      padding: 14px 16px !important;
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      gap: 10px !important;
      flex-shrink: 0 !important;
      box-sizing: border-box !important;
    }
    #pr-panel-header h3 {
      font-size: 15px !important;
      font-weight: bold !important;
      flex: 1 !important;
      margin: 0 !important;
      padding: 0 !important;
      color: white !important;
      font-family: Arial, sans-serif !important;
    }
    #pr-count-badge {
      background: #ff6b00 !important;
      color: white !important;
      border-radius: 12px !important;
      padding: 2px 9px !important;
      font-size: 11px !important;
      font-weight: bold !important;
      font-family: Arial, sans-serif !important;
    }
    #pr-close-btn {
      background: transparent !important;
      border: none !important;
      color: rgba(255,255,255,0.7) !important;
      font-size: 18px !important;
      cursor: pointer !important;
      padding: 0 4px !important;
      line-height: 1 !important;
      display: inline-block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    #pr-close-btn:hover { color: white !important; }

    /* ---- Stats ---- */
    #pr-stats {
      background: white !important;
      padding: 10px 16px !important;
      font-size: 12px !important;
      color: #555 !important;
      border-bottom: 1px solid #e0e0e0 !important;
      display: flex !important;
      flex-direction: row !important;
      gap: 16px !important;
      flex-shrink: 0 !important;
      box-sizing: border-box !important;
      font-family: Arial, sans-serif !important;
    }
    #pr-stats strong { color: #131921 !important; }

    /* ---- Lista ---- */
    #pr-list {
      flex: 1 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding: 10px !important;
      box-sizing: border-box !important;
      min-height: 0 !important;
    }
    #pr-list::-webkit-scrollbar { width: 6px !important; }
    #pr-list::-webkit-scrollbar-thumb { background: #ccc !important; border-radius: 3px !important; }

    .pr-empty {
      text-align: center !important;
      color: #aaa !important;
      padding: 40px 20px !important;
      font-size: 13px !important;
      line-height: 1.7 !important;
      font-family: Arial, sans-serif !important;
    }
    .pr-empty-icon {
      font-size: 36px !important;
      display: block !important;
      margin-bottom: 10px !important;
    }

    /* ---- Items del ranking ---- */
    .pr-item {
      background: white !important;
      border: 1px solid #dde1e7 !important;
      border-radius: 10px !important;
      padding: 10px !important;
      margin-bottom: 8px !important;
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      gap: 10px !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
      box-sizing: border-box !important;
      cursor: grab !important;
    }
    .pr-item:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important; }
    .pr-item.pr-dragging { opacity: 0.5 !important; border: 2px dashed #ff6b00 !important; }

    .pr-pos {
      min-width: 24px !important;
      max-width: 24px !important;
      height: 24px !important;
      background: #131921 !important;
      color: white !important;
      border-radius: 50% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 11px !important;
      font-weight: bold !important;
      flex-shrink: 0 !important;
      font-family: Arial, sans-serif !important;
    }
    .pr-thumb {
      width: 52px !important;
      height: 52px !important;
      object-fit: contain !important;
      border-radius: 6px !important;
      background: #f8f8f8 !important;
      border: 1px solid #eee !important;
      flex-shrink: 0 !important;
    }
    .pr-info {
      flex: 1 !important;
      min-width: 0 !important;
      overflow: hidden !important;
    }
    .pr-title {
      font-size: 11px !important;
      color: #232f3e !important;
      line-height: 1.4 !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 2 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
      margin-bottom: 4px !important;
      font-family: Arial, sans-serif !important;
    }
    .pr-meta {
      display: flex !important;
      flex-direction: row !important;
      gap: 6px !important;
      align-items: center !important;
      flex-wrap: wrap !important;
    }
    .pr-video-tag {
      background: #1a7f37 !important;
      color: white !important;
      font-size: 9px !important;
      font-weight: bold !important;
      padding: 1px 6px !important;
      border-radius: 8px !important;
      font-family: Arial, sans-serif !important;
      display: inline-block !important;
    }
    .pr-no-video-tag {
      background: #888 !important;
      color: white !important;
      font-size: 9px !important;
      font-weight: bold !important;
      padding: 1px 6px !important;
      border-radius: 8px !important;
      font-family: Arial, sans-serif !important;
      display: inline-block !important;
    }
    .pr-price {
      font-size: 11px !important;
      color: #B12704 !important;
      font-weight: bold !important;
      font-family: Arial, sans-serif !important;
    }
    .pr-asin {
      font-size: 9px !important;
      color: #aaa !important;
      font-family: monospace !important;
    }
    .pr-actions {
      display: flex !important;
      flex-direction: column !important;
      gap: 3px !important;
      flex-shrink: 0 !important;
    }
    .pr-action-btn {
      background: #f0f2f5 !important;
      border: 1px solid #dde1e7 !important;
      border-radius: 5px !important;
      width: 24px !important;
      height: 24px !important;
      min-width: 24px !important;
      min-height: 24px !important;
      cursor: pointer !important;
      font-size: 10px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      line-height: 1 !important;
      visibility: visible !important;
      opacity: 1 !important;
      color: #333 !important;
      text-decoration: none !important;
    }
    .pr-action-btn:hover { background: #e0e0e0 !important; }
    .pr-action-btn.pr-remove:hover {
      background: #ffebee !important;
      color: #c62828 !important;
      border-color: #ffcdd2 !important;
    }
    .pr-action-btn.pr-copy-link:hover {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
      border-color: #a5d6a7 !important;
    }
    .pr-action-btn.pr-copy-link.pr-copied {
      background: #2e7d32 !important;
      color: white !important;
      border-color: #2e7d32 !important;
    }

    /* ---- FOOTER con los 3 botones ---- */
    #pr-footer {
      background: white !important;
      border-top: 1px solid #e0e0e0 !important;
      padding: 12px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 8px !important;
      flex-shrink: 0 !important;
      box-sizing: border-box !important;
      visibility: visible !important;
      overflow: visible !important;
    }
    #pr-folder-row {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    #pr-folder-label {
      font-size: 11px !important;
      color: #555 !important;
      white-space: nowrap !important;
      font-family: Arial, sans-serif !important;
      flex-shrink: 0 !important;
    }
    #pr-folder-input {
      flex: 1 !important;
      font-size: 12px !important;
      font-family: Arial, sans-serif !important;
      padding: 5px 8px !important;
      border: 1px solid #dde1e7 !important;
      border-radius: 6px !important;
      background: #f8f9fa !important;
      color: #232f3e !important;
      box-sizing: border-box !important;
      min-width: 0 !important;
      outline: none !important;
    }
    #pr-folder-input:focus {
      border-color: #ff6b00 !important;
      background: white !important;
    }
    #pr-tag-row {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    #pr-tag-label {
      font-size: 11px !important;
      color: #555 !important;
      white-space: nowrap !important;
      font-family: Arial, sans-serif !important;
      flex-shrink: 0 !important;
    }
    #pr-tag-input {
      flex: 1 !important;
      font-size: 12px !important;
      font-family: monospace !important;
      padding: 5px 8px !important;
      border: 1px solid #dde1e7 !important;
      border-radius: 6px !important;
      background: #f8f9fa !important;
      color: #232f3e !important;
      box-sizing: border-box !important;
      min-width: 0 !important;
      outline: none !important;
    }
    #pr-tag-input:focus {
      border-color: #ff6b00 !important;
      background: white !important;
    }
    /* Botones del footer como divs para evitar conflictos con CSS de Amazon */
    .pr-footer-btn {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      padding: 9px 12px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: bold !important;
      cursor: pointer !important;
      box-sizing: border-box !important;
      font-family: Arial, sans-serif !important;
      border: none !important;
      text-align: center !important;
      line-height: 1.4 !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      user-select: none !important;
      min-height: 36px !important;
      text-decoration: none !important;
    }
    #pr-btn-download {
      background: #ff6b00 !important;
      color: white !important;
    }
    #pr-btn-download:hover { background: #e05a00 !important; }
    #pr-btn-export {
      background: #232f3e !important;
      color: white !important;
    }
    #pr-btn-export:hover { background: #131921 !important; }
    #pr-btn-clear {
      background: #f5f5f5 !important;
      color: #888 !important;
      border: 1px solid #ddd !important;
    }
    #pr-btn-clear:hover {
      background: #ffebee !important;
      color: #c62828 !important;
      border-color: #ffcdd2 !important;
    }

    /* ---- Notificación ---- */
    #pr-notification {
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483647 !important;
      background: #131921 !important;
      color: white !important;
      padding: 9px 16px !important;
      border-radius: 20px !important;
      font-family: Arial, sans-serif !important;
      font-size: 12px !important;
      font-weight: bold !important;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;
      opacity: 0 !important;
      transform: translateY(8px) !important;
      transition: opacity 0.25s, transform 0.25s !important;
      pointer-events: none !important;
      visibility: visible !important;
    }
    #pr-notification.pr-show {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
  `;

  // ── CREAR DOM ─────────────────────────────────────────────────────────────────

  function init() {
    if (document.getElementById(ROOT_ID)) return;

    const root = document.createElement('div');
    root.id = ROOT_ID;

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    // Toggle lateral
    const toggle = document.createElement('div');
    toggle.id = 'pr-toggle';
    toggle.innerHTML = '<span id="pr-dot">0</span>📊 RANKING';
    root.appendChild(toggle);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'pr-panel';
    panel.innerHTML = `
      <div id="pr-panel-header">
        <h3>📊 Ranking</h3>
        <span id="pr-count-badge">0</span>
        <button id="pr-close-btn">✕</button>
      </div>
      <div id="pr-stats">
        <span>Productos: <strong id="pr-stat-total">0</strong></span>
        <span>Con vídeo: <strong id="pr-stat-video">0</strong></span>
      </div>
      <div id="pr-list"></div>
      <div id="pr-footer">
        <div id="pr-folder-row">
          <span id="pr-folder-label">📁 Carpeta:</span>
          <input id="pr-folder-input" type="text" placeholder="nombre-del-proyecto" spellcheck="false">
        </div>
        <div id="pr-tag-row">
          <span id="pr-tag-label">🔗 Tag afil.:</span>
          <input id="pr-tag-input" type="text" placeholder="tu-tag-21" spellcheck="false">
        </div>
        <div class="pr-footer-btn" id="pr-btn-download" role="button" tabindex="0">⬇️ Descargar todos los assets</div>
        <div class="pr-footer-btn" id="pr-btn-export"   role="button" tabindex="0">📋 Exportar briefing</div>
        <div class="pr-footer-btn" id="pr-btn-clear"    role="button" tabindex="0">🗑️ Limpiar ranking</div>
      </div>
    `;
    root.appendChild(panel);

    // Notificación flotante
    const notif = document.createElement('div');
    notif.id = 'pr-notification';
    root.appendChild(notif);

    document.body.appendChild(root);
    bindEvents();
    loadAndRender();
    loadAffiliateTag();
  }

  // ── STORAGE ───────────────────────────────────────────────────────────────────

  function saveRanking(products) {
    chrome.storage.local.set({ [STORAGE_KEY]: products });
  }

  function loadRanking(callback) {
    chrome.storage.local.get([STORAGE_KEY], result => {
      callback(result[STORAGE_KEY] || []);
    });
  }

  function loadAffiliateTag() {
    chrome.storage.local.get(['prodradar_affiliate_tag'], result => {
      const tag = result['prodradar_affiliate_tag'] || '';
      const input = document.getElementById('pr-tag-input');
      if (input && tag) input.value = tag;
    });
  }

  function getAffiliateTag() {
    const input = document.getElementById('pr-tag-input');
    return (input?.value || '').trim();
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────

  function loadAndRender() {
    loadRanking(products => render(products));
  }

  function render(products) {
    const list = document.getElementById('pr-list');
    if (!list) return;

    const total     = products.length;
    const withVideo = products.filter(p => p.hasVideo).length;

    document.getElementById('pr-count-badge').textContent  = total;
    document.getElementById('pr-dot').textContent          = total;
    document.getElementById('pr-stat-total').textContent   = total;
    document.getElementById('pr-stat-video').textContent   = withVideo;

    if (total === 0) {
      list.innerHTML = `
        <div class="pr-empty">
          <span class="pr-empty-icon">📋</span>
          Tu ranking está vacío.<br>
          Pasa el ratón sobre un producto<br>y pulsa <strong>＋ Ranking</strong>.
        </div>`;
      return;
    }

    list.innerHTML = '';

    products.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className   = 'pr-item';
      item.dataset.asin = p.asin;
      item.draggable   = true;

      // Construir HTML interno con createElement para mayor fiabilidad
      item.innerHTML = `
        <div class="pr-pos">${idx + 1}</div>
        <img class="pr-thumb" src="${esc(p.imageUrl)}" alt="" onerror="this.style.display='none'">
        <div class="pr-info">
          <div class="pr-title">${esc(p.title)}</div>
          <div class="pr-meta">
            <span class="${p.hasVideo ? 'pr-video-tag' : 'pr-no-video-tag'}">${p.hasVideo ? '▶ VIDEO' : '✕ Sin vídeo'}</span>
            ${p.price ? `<span class="pr-price">${esc(p.price)}</span>` : ''}
            <span class="pr-asin">${esc(p.asin)}</span>
          </div>
        </div>
        <div class="pr-actions">
          <div class="pr-action-btn pr-up"        role="button" tabindex="0" title="Subir">▲</div>
          <div class="pr-action-btn pr-down"      role="button" tabindex="0" title="Bajar">▼</div>
          <div class="pr-action-btn pr-copy-link" role="button" tabindex="0" title="Copiar enlace afiliado">🔗</div>
          <div class="pr-action-btn pr-remove"    role="button" tabindex="0" title="Quitar">✕</div>
        </div>
      `;

      item.querySelector('.pr-up').addEventListener('click', () => {
        if (idx === 0) return;
        loadRanking(prods => {
          [prods[idx - 1], prods[idx]] = [prods[idx], prods[idx - 1]];
          saveRanking(prods); render(prods);
        });
      });

      item.querySelector('.pr-down').addEventListener('click', () => {
        loadRanking(prods => {
          if (idx >= prods.length - 1) return;
          [prods[idx], prods[idx + 1]] = [prods[idx + 1], prods[idx]];
          saveRanking(prods); render(prods);
        });
      });

      item.querySelector('.pr-remove').addEventListener('click', () => {
        loadRanking(prods => {
          const updated = prods.filter(x => x.asin !== p.asin);
          saveRanking(updated); render(updated);
          showNotif('Eliminado del ranking');
        });
      });

      item.querySelector('.pr-copy-link').addEventListener('click', function () {
        const btn = this;
        copyAffiliateLink(p.asin, btn);
      });

      // Drag & drop
      item.addEventListener('dragstart', onDragStart);
      item.addEventListener('dragover',  onDragOver);
      item.addEventListener('drop',      onDrop);
      item.addEventListener('dragend',   onDragEnd);

      list.appendChild(item);
    });
  }

  // ── DRAG & DROP ───────────────────────────────────────────────────────────────

  let dragSrc = null;

  function onDragStart(e) {
    dragSrc = this.dataset.asin;
    this.classList.add('pr-dragging');
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function onDrop(e) {
    e.preventDefault();
    const target = this.dataset.asin;
    if (!dragSrc || dragSrc === target) return;
    loadRanking(prods => {
      const si = prods.findIndex(x => x.asin === dragSrc);
      const ti = prods.findIndex(x => x.asin === target);
      if (si < 0 || ti < 0) return;
      const [moved] = prods.splice(si, 1);
      prods.splice(ti, 0, moved);
      saveRanking(prods); render(prods);
    });
  }
  function onDragEnd() { this.classList.remove('pr-dragging'); dragSrc = null; }

  // ── EVENTOS ───────────────────────────────────────────────────────────────────

  function bindEvents() {
    document.getElementById('pr-toggle').addEventListener('click', () => {
      document.getElementById('pr-panel').classList.toggle('pr-open');
    });
    document.getElementById('pr-close-btn').addEventListener('click', () => {
      document.getElementById('pr-panel').classList.remove('pr-open');
    });

    document.getElementById('pr-tag-input').addEventListener('change', () => {
      const tag = getAffiliateTag();
      chrome.storage.local.set({ prodradar_affiliate_tag: tag });
    });

    document.getElementById('pr-btn-download').addEventListener('click', downloadAllAssets);
    document.getElementById('pr-btn-export').addEventListener('click', exportBriefing);
    document.getElementById('pr-btn-clear').addEventListener('click', () => {
      if (!confirm('¿Limpiar todo el ranking?')) return;
      saveRanking([]); render([]);
      showNotif('Ranking limpiado');
    });

    window.addEventListener('prodradar:add', (e) => {
      addProduct(e.detail);
      document.getElementById('pr-panel').classList.add('pr-open');
    });
  }

  // ── AÑADIR PRODUCTO ───────────────────────────────────────────────────────────

  function addProduct(product) {
    loadRanking(products => {
      if (products.find(p => p.asin === product.asin)) {
        showNotif('⚠️ Ya está en el ranking');
        return;
      }
      products.push(product);
      saveRanking(products); render(products);
      showNotif('✓ Añadido al ranking');
    });
  }

  // ── COPIAR ENLACE DE AFILIADO ─────────────────────────────────────────────────

  async function copyAffiliateLink(asin, btn) {
    const tag      = getAffiliateTag();
    const origin   = location.origin;
    const longUrl  = tag ? `${origin}/dp/${asin}/?tag=${tag}` : `${origin}/dp/${asin}`;

    let finalUrl = longUrl;

    // Intentar obtener el short link de SiteStripe si hay tag configurado
    if (tag) {
      try {
        const apiUrl = `${origin}/gp/associates/sitestripe/getShortUrl?asin=${asin}&storeId=${tag}&ref=nosim&linkCode=ll2`;
        const res    = await fetch(apiUrl, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data?.shortUrl) finalUrl = data.shortUrl;
        }
      } catch (_) {
        // Si falla SiteStripe usamos el enlace largo sin problema
      }
    }

    try {
      await navigator.clipboard.writeText(finalUrl);
      // Feedback visual en el botón
      btn.classList.add('pr-copied');
      btn.textContent = '✓';
      setTimeout(() => {
        btn.classList.remove('pr-copied');
        btn.textContent = '🔗';
      }, 1500);
      const isShort = finalUrl.includes('amzn.to');
      showNotif(isShort ? '🔗 Enlace corto copiado' : '🔗 Enlace afiliado copiado');
    } catch (_) {
      showNotif('⚠️ No se pudo copiar');
    }
  }

  // ── DESCARGAR ASSETS ──────────────────────────────────────────────────────────

  function getRootFolder() {
    const input = document.getElementById('pr-folder-input');
    const raw   = (input?.value || '').trim();
    const safe  = raw.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 80);
    return safe || 'ranking';
  }

  function downloadAllAssets() {
    loadRanking(products => {
      if (!products.length) { showNotif('El ranking está vacío'); return; }

      const root   = getRootFolder();
      const origin = location.origin;
      let imgCount = 0;
      let vidCount = 0;

      products.forEach((p, idx) => {
        const pos       = String(idx + 1).padStart(2, '0');
        const safeTitle = (p.title || 'producto')
          .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
        const folder    = `${root}/${pos}_${p.asin}`;

        // Imagen del producto (versión a máxima resolución)
        if (p.imageUrl) {
          const fullImg = p.imageUrl.replace(/\._[^.]+_(\.\w+)$/, '$1');
          chrome.runtime.sendMessage({
            action:   'downloadFile',
            url:      fullImg,
            filename: `${folder}/imagen.jpg`
          });
          imgCount++;
        }

        // Vídeo del vendedor (fetch página → extrae URL HLS → descarga como MP4)
        if (p.hasVideo) {
          chrome.runtime.sendMessage({
            action:   'fetchAndDownloadVideo',
            asin:     p.asin,
            origin,
            filename: `${folder}/${safeTitle}.mp4`
          });
          vidCount++;
        }
      });

      const parts = [];
      if (imgCount) parts.push(`${imgCount} imagen${imgCount > 1 ? 'es' : ''}`);
      if (vidCount) parts.push(`${vidCount} vídeo${vidCount > 1 ? 's' : ''}`);
      showNotif(`⬇️ Descargando en "${root}"…`);
    });
  }

  // ── EXPORTAR BRIEFING ─────────────────────────────────────────────────────────

  function exportBriefing() {
    loadRanking(products => {
      if (!products.length) { showNotif('El ranking está vacío'); return; }

      const tag    = getAffiliateTag();
      const origin = location.origin;

      const lines = [
        'PRODRADAR - BRIEFING DE RANKING',
        '================================',
        `Fecha: ${new Date().toLocaleDateString('es-ES')}`,
        `Total productos: ${products.length}`,
        `Con vídeo: ${products.filter(p => p.hasVideo).length}`,
        tag ? `Tag afiliado: ${tag}` : 'Tag afiliado: (no configurado)',
        '', 'PRODUCTOS POR POSICIÓN:', '------------------------',
      ];
      products.forEach((p, idx) => {
        const baseUrl      = `${origin}/dp/${p.asin}`;
        const affiliateUrl = tag ? `${baseUrl}/?tag=${tag}` : baseUrl;
        lines.push(`\n#${idx + 1} — ${p.title}`);
        lines.push(`   ASIN:      ${p.asin}`);
        lines.push(`   Precio:    ${p.price || 'N/D'}`);
        lines.push(`   Vídeo:     ${p.hasVideo ? 'SÍ ▶' : 'NO'}`);
        lines.push(`   Imagen:    ${p.imageUrl}`);
        lines.push(`   URL:       ${baseUrl}`);
        lines.push(`   Afiliado:  ${affiliateUrl}`);
      });

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const root = getRootFolder();
      chrome.runtime.sendMessage({
        action:   'downloadFile',
        url:      URL.createObjectURL(blob),
        filename: `${root}/briefing.txt`
      });
      showNotif('📋 Briefing exportado');
    });
  }

  // ── NOTIFICACIÓN ──────────────────────────────────────────────────────────────

  let notifTimer = null;
  function showNotif(msg) {
    const el = document.getElementById('pr-notification');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('pr-show');
    clearTimeout(notifTimer);
    notifTimer = setTimeout(() => el.classList.remove('pr-show'), 2500);
  }

  // ── UTIL ──────────────────────────────────────────────────────────────────────

  function esc(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── INICIO ────────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
