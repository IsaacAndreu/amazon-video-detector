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
    // Pagina de busqueda / listado
    content.innerHTML = `
      <div class="info-box">
        <span>🏷️</span>
        <p>Los badges <strong style="color:#1a7f37">▶ VIDEO</strong> y <strong style="color:#555">✕ Sin video</strong> ya aparecen sobre cada producto en la pagina.</p>
        <p style="margin-top:8px; color:#888; font-size:11px;">Entra en un producto con video para poder descargarlo.</p>
      </div>`;
    return;
  }

  // Pagina de producto individual: ofrecer descarga
  chrome.tabs.sendMessage(tab.id, { action: 'getVideos' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      content.innerHTML = `
        <div class="no-videos">
          <span>⚠️</span>
          No se pudo leer la pagina.<br>Recargala e intentalo de nuevo.
        </div>`;
      return;
    }

    if (!response.hasVideos || response.videos.length === 0) {
      content.innerHTML = `
        <div class="no-videos">
          <span>🚫</span>
          Este producto no tiene videos.
        </div>`;
      return;
    }

    const { videos, title } = response;
    content.innerHTML = `<div class="video-count">✅ ${videos.length} video${videos.length > 1 ? 's' : ''} encontrado${videos.length > 1 ? 's' : ''}:</div>`;

    // Nombre base desde el título del producto (sin caracteres ilegales en nombres de archivo)
    const safeTitle = title
      ? title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
      : 'amazon-video';

    videos.forEach((video, index) => {
      const suffix   = videos.length > 1 ? `-${index + 1}` : '';
      const filename = `${safeTitle}${suffix}.mp4`;
      const shortUrl = video.url.length > 65 ? video.url.substring(0, 62) + '...' : video.url;

      const item = document.createElement('div');
      item.className = 'video-item';
      item.innerHTML = `
        <div class="video-header">
          <span class="video-icon">🎥</span>
          <div class="video-meta">
            <div class="video-title">Video ${index + 1}</div>
            <div class="video-type">Fuente: ${video.type}</div>
          </div>
        </div>
        <div class="video-url">${shortUrl}</div>
        <button class="btn-download" id="btn-${index}" data-url="${escapeHtml(video.url)}" data-filename="${filename}">
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
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
