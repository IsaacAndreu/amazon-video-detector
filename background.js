// ── HLS → MP4 (descarga real, no playlist) ───────────────────────────────────
//
// Amazon VSE sirve los vídeos como HLS (.m3u8 + segmentos .ts).
// Este downloader:
//   1. Descarga la playlist master → elige la variante de mayor calidad
//   2. Descarga todos los segmentos .ts en paralelo (lotes de 5)
//   3. Los concatena en un único ArrayBuffer
//   4. Crea un Blob video/mp4 y lo descarga como .mp4
//
// El resultado es un MPEG-2 Transport Stream con extensión .mp4.
// Se reproduce en VLC, Chrome, Windows Media Player y la mayoría de editores.

function resolveUrl(path, base) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  try { return new URL(path, base).href; } catch { return null; }
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al obtener ${url}`);
  return res.text();
}

// Parsea una playlist HLS y devuelve { variantUrl, playlistText }
// Si es master playlist, elige la variante de mayor BANDWIDTH.
async function resolveVariantPlaylist(m3u8Url) {
  const text = await fetchText(m3u8Url);

  if (!text.includes('#EXT-X-STREAM-INF')) {
    return { variantUrl: m3u8Url, text };
  }

  // Master playlist → buscar la variante con mayor BANDWIDTH
  let bestBw = -1, bestUri = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const bw = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
    const uri = lines.slice(i + 1).find(l => l.trim() && !l.startsWith('#'))?.trim();
    if (uri && bw > bestBw) { bestBw = bw; bestUri = uri; }
  }

  if (!bestUri) throw new Error('No se encontró ninguna variante en la playlist master');
  const variantUrl = resolveUrl(bestUri, m3u8Url);
  const variantText = await fetchText(variantUrl);
  return { variantUrl, text: variantText };
}

// Descarga todos los segmentos HLS y los concatena en un Uint8Array
async function downloadHLSsegments(m3u8Url) {
  const { variantUrl, text } = await resolveVariantPlaylist(m3u8Url);

  // Segmento de inicialización fMP4 (si existe)
  const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const initUrl  = mapMatch ? resolveUrl(mapMatch[1], variantUrl) : null;

  // URLs de los segmentos de media
  const segUrls = text.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => resolveUrl(l.trim(), variantUrl))
    .filter(Boolean);

  if (!segUrls.length) throw new Error('No se encontraron segmentos en la playlist');

  // Descargar init + segmentos en lotes de 5
  const allUrls   = initUrl ? [initUrl, ...segUrls] : segUrls;
  const BATCH     = 5;
  const buffers   = [];

  for (let i = 0; i < allUrls.length; i += BATCH) {
    const batch = await Promise.all(
      allUrls.slice(i, i + BATCH).map(u => fetch(u).then(r => {
        if (!r.ok) throw new Error(`Segmento no descargable: ${u}`);
        return r.arrayBuffer();
      }))
    );
    buffers.push(...batch);
  }

  // Concatenar todos los ArrayBuffers en uno
  const totalBytes = buffers.reduce((s, b) => s + b.byteLength, 0);
  const combined   = new Uint8Array(totalBytes);
  let offset = 0;
  for (const buf of buffers) {
    combined.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  return combined;
}

// Convierte Uint8Array a base64 en trozos para evitar stack overflow
function toBase64(bytes) {
  const CHUNK = 0x8000; // 32 KB por trozo
  let binary  = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Descarga completa: HLS → base64 data URL → archivo .mp4
// (URL.createObjectURL no está disponible en service workers MV3)
async function downloadHLSasMp4(url, filename) {
  const data    = await downloadHLSsegments(url);
  const dataUrl = 'data:video/mp4;base64,' + toBase64(data);

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url: dataUrl, filename, saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(downloadId);
      }
    );
  });
}

// Obtiene TODAS las URLs HLS del producto desde su página HTML estática
// Devuelve un array (puede estar vacío si no hay vídeos)
async function fetchVideoUrls(asin, pageUrl) {
  const res = await fetch(pageUrl, {
    credentials: 'include',
    headers: { 'Accept': 'text/html' }
  });
  if (!res.ok) return [];
  const html = await res.text();

  // Buscar el script que contiene mediaAsin:"ASIN" (confirmado en diagnóstico)
  const mediaAsinRe = new RegExp(`["']mediaAsin["']\\s*:\\s*["']${asin}["']`);
  const m = html.match(mediaAsinRe);
  if (!m) return [];

  const scriptStart = html.lastIndexOf('<script', m.index);
  const scriptEnd   = html.indexOf('</script>', m.index);
  if (scriptStart === -1 || scriptEnd === -1) return [];

  const script = html.slice(scriptStart, scriptEnd);

  // Extraer TODAS las URLs HLS del CDN de vídeo transcodificado
  const urlRe   = /"url"\s*:\s*"(https:\/\/[^"]*vse-vms-transcoding-artifact[^"]*\.m3u8)"/g;
  const matches = [...script.matchAll(urlRe)];
  return matches.map(match => match[1]);
}

// ── LISTENER DE MENSAJES ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Descargar vídeo (desde popup) ──────────────────────────────────────────
  if (msg.action === 'downloadVideo') {
    const { url, filename } = msg;
    const finalName = (filename || 'amazon-video').replace(/\.\w+$/, '') + '.mp4';

    const task = url.includes('.m3u8')
      ? downloadHLSasMp4(url, finalName)
      : new Promise((resolve, reject) => {
          chrome.downloads.download({ url, filename: finalName, saveAs: false }, (id) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(id);
          });
        });

    task
      .then(downloadId => sendResponse({ success: true, downloadId }))
      .catch(err    => sendResponse({ success: false, error: err.message }));

    return true; // respuesta asíncrona
  }

  // ── Descarga masiva: fetch página → extrae URLs → descarga TODOS como MP4 ────
  if (msg.action === 'fetchAndDownloadVideo') {
    const { asin, origin, filename } = msg;

    (async () => {
      try {
        const pageUrl   = `${origin || 'https://www.amazon.es'}/dp/${asin}`;
        const videoUrls = await fetchVideoUrls(asin, pageUrl);
        if (!videoUrls.length) {
          sendResponse({ success: false, error: 'No se encontró URL de vídeo' });
          return;
        }

        // Nombre base sin extensión
        const baseName = (filename || 'amazon-video').replace(/\.\w+$/, '');

        // Descargar todos los vídeos secuencialmente
        // (uno a uno para no saturar el disco con muchos HLS en paralelo)
        const downloadIds = [];
        for (let i = 0; i < videoUrls.length; i++) {
          const suffix     = videoUrls.length > 1 ? `-${i + 1}` : '';
          const finalName  = `${baseName}${suffix}.mp4`;
          const downloadId = await downloadHLSasMp4(videoUrls[i], finalName);
          downloadIds.push(downloadId);
        }

        sendResponse({ success: true, count: downloadIds.length, downloadIds });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ── Descargar archivo genérico (imágenes, briefings) ──────────────────────
  if (msg.action === 'downloadFile') {
    const { url, filename } = msg;
    chrome.downloads.download(
      { url, filename: filename || 'asset', saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      }
    );
    return true;
  }

});
