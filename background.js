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
// Si es master playlist, elige la variante de mayor calidad COMPATIBLE:
//   · Prefiere H.264 (avc1) sobre H.265 (hvc1/hev1)
//   · H.265 descarga bien pero Windows/VLC muestran vídeo negro con solo audio
//   · Si no hay H.264, coge el mayor BANDWIDTH disponible como fallback
async function resolveVariantPlaylist(m3u8Url) {
  const text = await fetchText(m3u8Url);

  if (!text.includes('#EXT-X-STREAM-INF')) {
    return { variantUrl: m3u8Url, text };
  }

  let bestBw   = -1, bestUri   = null; // mejor sin importar codec
  let h264Bw   = -1, h264Uri   = null; // mejor H.264

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const bw     = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
    const codecs = lines[i].match(/CODECS="([^"]+)"/)?.[1] || '';
    const uri    = lines.slice(i + 1).find(l => l.trim() && !l.startsWith('#'))?.trim();
    if (!uri) continue;

    // Actualizar mejor global
    if (bw > bestBw) { bestBw = bw; bestUri = uri; }

    // H.265 causa vídeo negro en la mayoría de reproductores → saltar para H.264
    const isH265 = /hvc1|hev1/i.test(codecs);
    if (!isH265 && bw > h264Bw) { h264Bw = bw; h264Uri = uri; }
  }

  // Preferir H.264; solo usar H.265 si no hay alternativa
  const chosenUri = h264Uri || bestUri;
  if (!chosenUri) throw new Error('No se encontró ninguna variante en la playlist master');

  const variantUrl  = resolveUrl(chosenUri, m3u8Url);
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

// Escanea todos los script blocks buscando vídeos relacionados.
// Detecta dos tipos:
//   1. VSE CDN (vse-vms-transcoding-artifact) → filtra por "isVideo":true
//   2. m.media-amazon.com .m3u8 → vídeos de reseñas de clientes
// Devuelve [{url, title, creator}], excluyendo las URLs ya conocidas.
async function fetchRelatedVseVideos(html, excludeUrls) {
  const results = [];
  const seen    = new Set(excludeUrls);

  // Patrón 1: CDN de vídeo transcodificado VSE
  const vseUrlRe   = /"url"\s*:\s*"(https:\/\/[^"]*vse-vms-transcoding-artifact[^"]*\.m3u8)"/g;
  // Patrón 2: Vídeos de reseñas de clientes en m.media-amazon.com
  const reviewUrlRe = /"(?:url|videoUrl|hlsUrl|streamUrl)"\s*:\s*"(https:\/\/m\.media-amazon\.com\/[^"]*\.m3u8)"/g;

  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  for (const scriptMatch of html.matchAll(scriptRe)) {
    const block = scriptMatch[1];

    // ── Vídeos VSE ──────────────────────────────────────────────────────────
    for (const urlMatch of block.matchAll(vseUrlRe)) {
      const url = urlMatch[1];
      if (seen.has(url)) continue;

      // Ventana de contexto ampliada para capturar "isVideo":true aunque esté lejos
      const ctx = block.slice(Math.max(0, urlMatch.index - 2000), urlMatch.index + 1000);

      // Filtro: solo vídeos reales (excluye slates/placeholders)
      if (!/"isVideo"\s*:\s*true/.test(ctx)) continue;

      seen.add(url);
      const titleM   = ctx.match(/"(?:title|videoTitle)"\s*:\s*"([^"]{3,120})"/);
      const creatorM = ctx.match(/"(?:creatorName|channelName|author)"\s*:\s*"([^"]{2,60})"/);
      results.push({ url, title: titleM?.[1] || '', creator: creatorM?.[1] || '' });
    }

    // ── Vídeos de reseñas (m.media-amazon.com) ─────────────────────────────
    for (const urlMatch of block.matchAll(reviewUrlRe)) {
      const url = urlMatch[1];
      if (seen.has(url)) continue;

      seen.add(url);
      const ctx      = block.slice(Math.max(0, urlMatch.index - 600), urlMatch.index + 400);
      const titleM   = ctx.match(/"(?:title|headline|text|reviewTitle)"\s*:\s*"([^"]{3,120})"/);
      const creatorM = ctx.match(/"(?:reviewerName|displayName|name|authorName)"\s*:\s*"([^"]{2,60})"/);
      results.push({ url, title: titleM?.[1] || '', creator: creatorM?.[1] || '' });
    }
  }

  return results;
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

  // ── Obtener TODOS los vídeos de una página de producto (popup) ────────────
  // Estrategia en dos pasos:
  //   1. fetchVideoUrls(asin) → vídeos del vendedor (método probado, ancla a mediaAsin)
  //   2. fetchRelatedVseVideos(html) → VSE relacionados + vídeos de reseñas de clientes
  if (msg.action === 'getAllVideos') {
    const { pageUrl } = msg;
    (async () => {
      try {
        const asin = pageUrl.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
        if (!asin) { sendResponse({ success: true, videos: [] }); return; }

        // Fetch único compartido por ambos pasos
        const res = await fetch(pageUrl, {
          credentials: 'include',
          headers: { 'Accept': 'text/html' }
        });
        if (!res.ok) { sendResponse({ success: true, videos: [] }); return; }
        const html = await res.text();

        // Paso 1: vídeos del vendedor (ancla a mediaAsin — confirmado)
        const sellerUrls = [];
        const mediaAsinRe = new RegExp(`["']mediaAsin["']\\s*:\\s*["']${asin}["']`);
        const mAsin = html.match(mediaAsinRe);
        if (mAsin) {
          const sStart = html.lastIndexOf('<script', mAsin.index);
          const sEnd   = html.indexOf('</script>', mAsin.index);
          if (sStart !== -1 && sEnd !== -1) {
            const block  = html.slice(sStart, sEnd);
            const urlRe  = /"url"\s*:\s*"(https:\/\/[^"]*vse-vms-transcoding-artifact[^"]*\.m3u8)"/g;
            for (const m of block.matchAll(urlRe)) sellerUrls.push(m[1]);
          }
        }

        const videos = sellerUrls.map(url => ({ url, title: '', creator: '' }));

        // Paso 2: vídeos relacionados (isVideo:true, sin duplicar los del vendedor)
        const related = await fetchRelatedVseVideos(html, sellerUrls);
        videos.push(...related);

        sendResponse({ success: true, videos });
      } catch (err) {
        sendResponse({ success: false, error: err.message, videos: [] });
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
