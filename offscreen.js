function sendProgress(job = {}, status, message, extra = {}) {
  if (!job.jobId) return;

  chrome.runtime.sendMessage({
    action: 'jobProgress',
    jobId: job.jobId,
    itemId: job.itemId || '',
    label: job.label || '',
    status,
    message,
    total: job.total || 0,
    completed: job.completed || 0,
    ...extra
  }, () => void chrome.runtime.lastError);
}

function resolveUrl(path, base) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  try {
    return new URL(path, base).href;
  } catch (_) {
    return null;
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return response.text();
}

async function resolveVariantPlaylist(m3u8Url) {
  const text = await fetchText(m3u8Url);
  if (!text.includes('#EXT-X-STREAM-INF')) {
    return { variantUrl: m3u8Url, text };
  }

  let fallback = null;
  let bestH264 = null;
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#EXT-X-STREAM-INF')) continue;

    const bandwidth = parseInt(lines[index].match(/BANDWIDTH=(\d+)/)?.[1] || '0', 10);
    const codecs = lines[index].match(/CODECS="([^"]+)"/)?.[1] || '';
    const uri = lines.slice(index + 1).find(line => line.trim() && !line.startsWith('#'))?.trim();
    if (!uri) continue;

    const candidate = { bandwidth, uri };
    if (!fallback || candidate.bandwidth > fallback.bandwidth) fallback = candidate;
    if (!/hvc1|hev1/i.test(codecs) && (!bestH264 || candidate.bandwidth > bestH264.bandwidth)) {
      bestH264 = candidate;
    }
  }

  const chosen = bestH264 || fallback;
  if (!chosen) throw new Error('No compatible stream variant was found');

  const variantUrl = resolveUrl(chosen.uri, m3u8Url);
  return { variantUrl, text: await fetchText(variantUrl) };
}

async function downloadHlsSegments(m3u8Url, job) {
  const { variantUrl, text } = await resolveVariantPlaylist(m3u8Url);
  const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const initUrl = mapMatch ? resolveUrl(mapMatch[1], variantUrl) : null;

  const mediaSegments = text.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => resolveUrl(line.trim(), variantUrl))
    .filter(Boolean);

  if (!mediaSegments.length) {
    throw new Error('No downloadable segments were found in the playlist');
  }

  const urls = initUrl ? [initUrl, ...mediaSegments] : mediaSegments;
  const buffers = new Array(urls.length);
  let completedSegments = 0;
  const batchSize = 5;

  sendProgress(job, 'running', `Descargando segmentos 0/${urls.length}`, { percent: 8 });

  try {
    for (let start = 0; start < urls.length; start += batchSize) {
      const batch = urls.slice(start, start + batchSize);
      await Promise.all(batch.map((segmentUrl, offset) => fetch(segmentUrl)
        .then(response => {
          if (!response.ok) throw new Error(`Segment could not be downloaded: ${segmentUrl}`);
          return response.arrayBuffer();
        })
        .then(buffer => {
          buffers[start + offset] = buffer;
          completedSegments += 1;
          const percent = Math.max(10, Math.round((completedSegments / urls.length) * 86));
          sendProgress(job, 'running', `Descargando segmentos ${completedSegments}/${urls.length}`, { percent });
        })));
    }

    const totalBytes = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const merged = new Uint8Array(totalBytes);
    let cursor = 0;

    buffers.forEach(buffer => {
      merged.set(new Uint8Array(buffer), cursor);
      cursor += buffer.byteLength;
    });

    return merged;
  } finally {
    buffers.fill(null);
    buffers.length = 0;
  }
}

async function assembleHlsVideo(url, job) {
  let bytes = null;
  let blob = null;

  try {
    sendProgress(job, 'running', 'Resolviendo stream HLS', { percent: 5 });
    bytes = await downloadHlsSegments(url, job);
    sendProgress(job, 'running', 'Creando Blob de video', { percent: 92 });
    blob = new Blob([bytes], { type: 'video/mp4' });
    const objectUrl = URL.createObjectURL(blob);
    sendProgress(job, 'running', 'Blob listo para descarga', { percent: 94 });
    return { objectUrl, size: blob.size };
  } finally {
    bytes = null;
    blob = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'assembleHlsVideo') {
    (async () => {
      try {
        const result = await assembleHlsVideo(message.url, message.job || {});
        sendResponse({ success: true, ...result });
      } catch (error) {
        sendProgress(message.job || {}, 'failed', error.message, { percent: 100 });
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'revokeObjectUrl') {
    try {
      URL.revokeObjectURL(message.objectUrl);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  return false;
});
