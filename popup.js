const SUPPORTED_HOSTS = new Set([
  'www.amazon.com',
  'www.amazon.es',
  'www.amazon.co.uk',
  'www.amazon.com.mx',
  'www.amazon.de',
  'www.amazon.fr',
  'www.amazon.it'
]);

const VIDEO_CDN_RE = /vse-vms-transcoding-artifact|m\.media-amazon\.com\/[^"']*\.m3u8/i;

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function shortUrl(url) {
  return url.length > 72 ? `${url.slice(0, 69)}...` : url;
}

function normalizeVideos(videos) {
  return (videos || []).filter(video => video?.url && VIDEO_CDN_RE.test(video.url));
}

function renderState(html) {
  document.getElementById('content').innerHTML = `<div class="card">${html}</div>`;
}

async function getActiveAmazonTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrl = tab?.url || '';

  try {
    const url = new URL(pageUrl);
    const isAmazon = SUPPORTED_HOSTS.has(url.hostname);
    const isProductPage = /\/(?:dp|gp\/product)\//.test(url.pathname);
    return { tab, pageUrl, isAmazon, isProductPage, hostname: url.hostname };
  } catch (_) {
    return { tab, pageUrl, isAmazon: false, isProductPage: false, hostname: '' };
  }
}

function renderOutsideAmazon() {
  renderState(`
    <div class="status-box">
      <strong>Abre Amazon primero.</strong><br>
      Los badges y el ranking solo aparecen en los marketplaces compatibles.
    </div>
  `);
}

function renderNonProductPage() {
  renderState(`
    <div class="status-box">
      <strong>Estas en Amazon, pero no en una ficha de producto.</strong><br>
      Entra en un producto para ver sus videos y descargarlos desde aqui.
    </div>
  `);
}

function renderLoading() {
  renderState('<div class="status-box">Buscando videos disponibles...</div>');
}

function renderFetchError() {
  renderState(`
    <div class="status-box">
      <strong>No se pudo leer la pagina.</strong><br>
      Recarga la ficha del producto e intentalo de nuevo.
    </div>
  `);
}

function renderNoVideos(productTitle, marketplace) {
  renderState(`
    <div class="status-box">
      <strong>${escapeHtml(productTitle || 'No se encontraron videos')}</strong><br>
      Este producto no muestra videos detectables en ${escapeHtml(marketplace)}.
    </div>
  `);
}

function renderVideos(productTitle, marketplace, videos) {
  const sellerCount = videos.filter(video => !video.isRelated).length;
  const relatedCount = videos.length - sellerCount;

  const cards = videos.map((video, index) => {
    const filename = video.filename;
    const tagClass = video.isRelated ? 'video-tag related' : 'video-tag';
    const tagLabel = video.isRelated ? 'Relacionado' : 'Vendedor';

    return `
      <div class="video-item">
        <div class="video-head">
          <div>
            <div class="video-title">${escapeHtml(video.title || `Video ${index + 1}`)}</div>
            <div class="video-meta">${escapeHtml(video.creator || marketplace)}</div>
          </div>
          <span class="${tagClass}">${tagLabel}</span>
        </div>
        <div class="video-url">${escapeHtml(shortUrl(video.url))}</div>
        <button class="btn-download" data-index="${index}" data-url="${escapeHtml(video.url)}" data-filename="${escapeHtml(filename)}">
          Descargar MP4
        </button>
        <div class="status-msg" id="status-${index}"></div>
      </div>
    `;
  }).join('');

  renderState(`
    <div class="summary">
      <div class="metric">
        <span class="metric-label">Producto</span>
        <span class="metric-value">${videos.length}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Marketplace</span>
        <span class="metric-value" style="font-size:13px">${escapeHtml(marketplace)}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Videos del vendedor</span>
        <span class="metric-value">${sellerCount}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Relacionados</span>
        <span class="metric-value">${relatedCount}</span>
      </div>
    </div>
    <div class="toolbar">
      <button id="download-seller">Solo vendedor</button>
      <button id="download-all">Descargar todos</button>
    </div>
    <div class="video-meta" style="margin-bottom:12px;font-size:12px;line-height:1.6;">
      <strong style="color:#1e2a32;display:block;margin-bottom:4px;">${escapeHtml(productTitle || 'Producto Amazon')}</strong>
      Revisa cada video o lanza una descarga en lote desde aqui.
    </div>
    ${cards}
  `);

  const queueButtons = (selectedVideos) => {
    selectedVideos.forEach(video => {
      const button = document.querySelector(`button[data-filename="${CSS.escape(video.filename)}"]`);
      if (button) runDownload(button);
    });
  };

  document.getElementById('download-seller').addEventListener('click', () => {
    queueButtons(videos.filter(video => !video.isRelated));
  });

  document.getElementById('download-all').addEventListener('click', () => {
    queueButtons(videos);
  });

  document.querySelectorAll('.btn-download').forEach(button => {
    button.addEventListener('click', () => runDownload(button));
  });
}

function setButtonState(button, mode, statusText) {
  const index = button.dataset.index;
  const status = document.getElementById(`status-${index}`);
  button.classList.remove('success', 'error');

  if (mode === 'idle') {
    button.disabled = false;
    button.textContent = 'Descargar MP4';
    status.textContent = statusText || '';
    status.className = 'status-msg';
    return;
  }

  if (mode === 'progress') {
    button.disabled = true;
    button.textContent = 'Descargando...';
    status.textContent = statusText || 'Preparando descarga';
    status.className = 'status-msg';
    return;
  }

  if (mode === 'success') {
    button.disabled = true;
    button.classList.add('success');
    button.textContent = 'Descargado';
    status.textContent = statusText || 'Guardado en tu carpeta de descargas';
    status.className = 'status-msg';
    return;
  }

  button.disabled = false;
  button.classList.add('error');
  button.textContent = 'Reintentar';
  status.textContent = statusText || 'No se pudo descargar';
  status.className = 'status-msg error';
}

function runDownload(button) {
  setButtonState(button, 'progress', 'Preparando descarga');
  chrome.runtime.sendMessage(
    {
      action: 'downloadVideo',
      url: button.dataset.url,
      filename: button.dataset.filename
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        setButtonState(button, 'error', response?.error || 'No se pudo descargar este video');
        return;
      }

      setButtonState(button, 'success', response.message || 'Guardado en tu carpeta de descargas');
    }
  );
}

function createFilename(baseTitle, video, index, totalVideos) {
  const safeBase = (video.title || baseTitle || 'amazon-video')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'amazon-video';

  const suffix = totalVideos > 1 ? `-${index + 1}` : '';
  return `${safeBase}${suffix}.mp4`;
}

async function collectVideoData(tabId, pageUrl) {
  let productTitle = '';
  let domVideos = [];

  try {
    const domResponse = await new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, { action: 'getVideos' }, res => resolve(res || null));
    });

    if (domResponse?.title) productTitle = domResponse.title;
    domVideos = normalizeVideos(domResponse?.videos).map(video => ({ url: video.url, title: '', creator: '' }));
  } catch (_) {}

  const pageResponse = await new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getAllVideos', pageUrl }, res => resolve(res || null));
  });

  if (!pageResponse?.success) {
    throw new Error(pageResponse?.error || 'No se pudo leer la pagina');
  }

  const merged = [];
  const seen = new Set();

  [...(pageResponse.videos || []), ...domVideos].forEach(video => {
    if (!video?.url || seen.has(video.url)) return;
    seen.add(video.url);
    merged.push(video);
  });

  const normalized = merged.map((video, index) => ({
    ...video,
    isRelated: Boolean(video.title || video.creator),
    filename: createFilename(productTitle, video, index, merged.length)
  }));

  return { productTitle, videos: normalized };
}

async function init() {
  const { tab, pageUrl, isAmazon, isProductPage, hostname } = await getActiveAmazonTab();

  if (!isAmazon) {
    renderOutsideAmazon();
    return;
  }

  if (!isProductPage || !tab?.id) {
    renderNonProductPage();
    return;
  }

  renderLoading();

  try {
    const { productTitle, videos } = await collectVideoData(tab.id, pageUrl);
    if (!videos.length) {
      renderNoVideos(productTitle, hostname);
      return;
    }

    renderVideos(productTitle, hostname, videos);
  } catch (_) {
    renderFetchError();
  }
}

document.addEventListener('DOMContentLoaded', init);
