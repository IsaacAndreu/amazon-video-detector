document.addEventListener('DOMContentLoaded', async () => {
  const content = document.getElementById('content');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const isAmazon = tab.url && (
    tab.url.includes('amazon.com') ||
    tab.url.includes('amazon.es') ||
    tab.url.includes('amazon.co.uk') ||
    tab.url.includes('amazon.com.mx')
  );

  if (!isAmazon) {
    content.innerHTML = `
      <div class="wrong-page">
        <span>🛒</span>
        Navega a Amazon y los badges<br>apareceran sobre cada producto.
      </div>`;
    return;
  }

  const isProductPage = tab.url.includes('/dp/');

  if (!isProductPage) {
    content.innerHTML = `
      <div class="info-box">
        <span>🏷️</span>
        <p>Los badges <strong style="color:#1a7f37">▶ VIDEO</strong> y <strong style="color:#555">✕ Sin video</strong> ya aparecen sobre cada producto en la pagina.</p>
        <p style="margin-top:8px; color:#888; font-size:11px;">Entra en un producto con video para poder descargarlo.</p>
      </div>`;
    return;
  }

  // Pagina de producto: mostrar spinner mientras carga
  content.innerHTML = `<div class="loading">⏳ Buscando vídeos…</div>`;

  // Obtener título + vídeos del DOM en vivo (content script)
  let productTitle = '';
  let domVideos = [];
  try {
    await new Promise(resolve => {
      chrome.tabs.sendMessage(tab.id, { action: 'getVideos' }, (res) => {
        if (!chrome.runtime.lastError && res) {
          if (res.title)  productTitle = res.title;
          // Filtrar solo URLs de CDN de vídeo de Amazon (VSE + reseñas)
          if (res.videos) {
            const cdnRe = /vse-vms-transcoding-artifact|m\.media-amazon\.com\/[^"]*\.m3u8/;
            domVideos = res.videos
              .filter(v => v.url && cdnRe.test(v.url))
              .map(v => ({ url: v.url, title: '', creator: '' }));
          }
        }
        resolve();
      });
    });
  } catch (_) {}

  // Obtener TODOS los vídeos (vendedor + relacionados) via fetch de la página
  chrome.runtime.sendMessage({ action: 'getAllVideos', pageUrl: tab.url }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      content.innerHTML = `
        <div class="no-videos">
          <span>⚠️</span>
          No se pudo leer la pagina.<br>Recargala e intentalo de nuevo.
        </div>`;
      return;
    }

    // Combinar: resultados del fetch de la página + vídeos del DOM en vivo (sin duplicar)
    const seen   = new Set((response.videos || []).map(v => v.url));
    const extra  = domVideos.filter(v => !seen.has(v.url));
    const videos = [...(response.videos || []), ...extra];

    if (!videos.length) {
      content.innerHTML = `
        <div class="no-videos">
          <span>🚫</span>
          Este producto no tiene vídeos.
        </div>`;
      return;
    }

    const safeTitle = productTitle
      ? productTitle.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
      : 'amazon-video';

    content.innerHTML = `<div class="video-count">✅ ${videos.length} vídeo${videos.length > 1 ? 's' : ''} encontrado${videos.length > 1 ? 's' : ''}:</div>`;

    videos.forEach((video, index) => {
      const suffix   = videos.length > 1 ? `-${index + 1}` : '';
      // Usar el título del vídeo si existe, si no el del producto
      const vidSafeTitle = video.title
        ? video.title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
        : safeTitle;
      const filename = `${vidSafeTitle}${suffix}.mp4`;

      const isRelated = !!(video.title || video.creator);
      const label   = video.title   || `Vídeo vendedor ${index + 1}`;
      const creator = video.creator ? `<div class="video-creator">👤 ${escapeHtml(video.creator)}</div>` : '';
      const tag     = isRelated ? `<span class="video-tag related">Relacionado</span>` : `<span class="video-tag seller">Vendedor</span>`;
      const shortUrl = video.url.length > 65 ? video.url.substring(0, 62) + '...' : video.url;

      const item = document.createElement('div');
      item.className = 'video-item';
      item.innerHTML = `
        <div class="video-header">
          <span class="video-icon">🎥</span>
          <div class="video-meta">
            <div class="video-title">${escapeHtml(label)}</div>
            ${creator}
            ${tag}
          </div>
        </div>
        <div class="video-url">${shortUrl}</div>
        <button class="btn-download" id="btn-${index}" data-url="${escapeHtml(video.url)}" data-filename="${escapeHtml(filename)}">
          ⬇️ Descargar en 1 clic
        </button>
        <div class="status-msg" id="status-${index}"></div>
      `;
      content.appendChild(item);
    });

    document.querySelectorAll('.btn-download').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = '⏳ Descargando...';
        const status = document.getElementById(`status-${idx}`);
        status.textContent = '';
        status.className = 'status-msg';

        chrome.runtime.sendMessage(
          { action: 'downloadVideo', url: btn.dataset.url, filename: btn.dataset.filename },
          (res) => {
            if (res?.success) {
              btn.textContent = '✅ Descargado';
              btn.classList.add('success');
              status.textContent = 'Guardado en tu carpeta de Descargas';
            } else {
              btn.textContent = '❌ Reintentar';
              btn.classList.add('error');
              btn.disabled = false;
              status.textContent = res?.error || 'Error. Intenta de nuevo.';
              status.className = 'status-msg error';
            }
          }
        );
      });
    });
  });
});

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
