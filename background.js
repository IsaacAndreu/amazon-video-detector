const PRODUCT_PATH_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i;

function buildError(message, extra = {}) {
  return { success: false, error: message, ...extra };
}

function buildSuccess(extra = {}) {
  return { success: true, ...extra };
}

function createJobReporter(job = {}) {
  return {
    update(status, message, extra = {}) {
      if (!job.jobId) return;
      chrome.runtime.sendMessage({
        action: 'jobProgress',
        jobId: job.jobId,
        itemId: job.itemId || '',
        label: job.label || '',
        status,
        message,
        completed: job.completed || 0,
        total: job.total || 0,
        ...extra
      }, () => void chrome.runtime.lastError);
    }
  };
}

function sanitizeFileBase(name, fallback = 'amazon-video') {
  const safe = (name || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

  return safe || fallback;
}

function sanitizeDownloadPath(filename, fallback = 'amazon-video') {
  const normalized = (filename || fallback).replace(/\\+/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length) return sanitizeFileBase(fallback, fallback);

  const basename = parts.pop();
  const safeParts = parts.map(part => sanitizeFileBase(part, 'folder'));
  const safeBase = sanitizeFileBase(basename, fallback);
  return [...safeParts, safeBase].join('/');
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
  if (!chosen) {
    throw new Error('No compatible stream variant was found');
  }

  const variantUrl = resolveUrl(chosen.uri, m3u8Url);
  return { variantUrl, text: await fetchText(variantUrl) };
}

async function downloadHlsSegments(m3u8Url, onProgress) {
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

  onProgress?.({ stage: 'segments', completedSegments, totalSegments: urls.length });

  const batchSize = 5;
  for (let start = 0; start < urls.length; start += batchSize) {
    const batch = urls.slice(start, start + batchSize);
    await Promise.all(batch.map((segmentUrl, offset) => fetch(segmentUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Segment could not be downloaded: ${segmentUrl}`);
        }
        return response.arrayBuffer();
      })
      .then(buffer => {
        buffers[start + offset] = buffer;
        completedSegments += 1;
        onProgress?.({ stage: 'segments', completedSegments, totalSegments: urls.length });
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
}

function toBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

async function downloadHlsAsMp4(url, filename, reporter) {
  reporter.update('running', 'Resolviendo stream');

  const bytes = await downloadHlsSegments(url, progress => {
    if (progress.stage !== 'segments') return;
    const { completedSegments, totalSegments } = progress;
    const percent = Math.max(5, Math.round((completedSegments / totalSegments) * 85));
    reporter.update(
      'running',
      `Descargando segmentos ${completedSegments}/${totalSegments}`,
      { percent }
    );
  });

  reporter.update('running', 'Preparando archivo final', { percent: 92 });
  const dataUrl = `data:video/mp4;base64,${toBase64(bytes)}`;

  const downloadId = await new Promise((resolve, reject) => {
    chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, id => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(id);
    });
  });

  reporter.update('completed', 'Video descargado', { percent: 100 });
  return downloadId;
}

async function fetchProductHtml(pageUrl) {
  const response = await fetch(pageUrl, {
    credentials: 'include',
    headers: { Accept: 'text/html' }
  });

  if (!response.ok) {
    throw new Error(`Could not read the product page (${response.status})`);
  }

  return response.text();
}

function extractSellerVideoUrls(html, asin) {
  const mediaAsinRe = new RegExp(`["']mediaAsin["']\\s*:\\s*["']${asin}["']`);
  const match = html.match(mediaAsinRe);
  if (!match) return [];

  const scriptStart = html.lastIndexOf('<script', match.index);
  const scriptEnd = html.indexOf('</script>', match.index);
  if (scriptStart === -1 || scriptEnd === -1) return [];

  const block = html.slice(scriptStart, scriptEnd);
  const urlRe = /"url"\s*:\s*"(https:\/\/[^\"]*vse-vms-transcoding-artifact[^\"]*\.m3u8)"/g;
  return [...block.matchAll(urlRe)].map(item => item[1]);
}

function extractRelatedVideos(html, excludeUrls) {
  const seen = new Set(excludeUrls);
  const videos = [];
  const vseUrlRe = /"url"\s*:\s*"(https:\/\/[^\"]*vse-vms-transcoding-artifact[^\"]*\.m3u8)"/g;
  const reviewUrlRe = /"(?:url|videoUrl|hlsUrl|streamUrl)"\s*:\s*"(https:\/\/m\.media-amazon\.com\/[^\"]*\.m3u8)"/g;
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;

  for (const scriptMatch of html.matchAll(scriptRe)) {
    const block = scriptMatch[1];

    for (const urlMatch of block.matchAll(vseUrlRe)) {
      const url = urlMatch[1];
      if (seen.has(url)) continue;

      const context = block.slice(Math.max(0, urlMatch.index - 2000), urlMatch.index + 1000);
      if (!/"isVideo"\s*:\s*true/.test(context)) continue;

      seen.add(url);
      videos.push({
        url,
        title: context.match(/"(?:title|videoTitle)"\s*:\s*"([^\"]{3,120})"/)?.[1] || '',
        creator: context.match(/"(?:creatorName|channelName|author)"\s*:\s*"([^\"]{2,60})"/)?.[1] || ''
      });
    }

    for (const urlMatch of block.matchAll(reviewUrlRe)) {
      const url = urlMatch[1];
      if (seen.has(url)) continue;

      seen.add(url);
      const context = block.slice(Math.max(0, urlMatch.index - 600), urlMatch.index + 400);
      videos.push({
        url,
        title: context.match(/"(?:title|headline|text|reviewTitle)"\s*:\s*"([^\"]{3,120})"/)?.[1] || '',
        creator: context.match(/"(?:reviewerName|displayName|name|authorName)"\s*:\s*"([^\"]{2,60})"/)?.[1] || ''
      });
    }
  }

  return videos;
}

async function getAllProductVideos(pageUrl) {
  const asin = pageUrl.match(PRODUCT_PATH_RE)?.[1];
  if (!asin) return [];

  const html = await fetchProductHtml(pageUrl);
  const sellerUrls = extractSellerVideoUrls(html, asin);
  const sellerVideos = sellerUrls.map(url => ({ url, title: '', creator: '' }));
  return [...sellerVideos, ...extractRelatedVideos(html, sellerUrls)];
}

function productPageCandidates(origin, asin) {
  return [
    `${origin || 'https://www.amazon.es'}/dp/${asin}`,
    `${origin || 'https://www.amazon.es'}/gp/product/${asin}`
  ];
}

async function getDownloadableVideosForAsin(asin, origin, includeRelated) {
  for (const pageUrl of productPageCandidates(origin, asin)) {
    try {
      const videos = await getAllProductVideos(pageUrl);
      if (!videos.length) continue;
      return includeRelated ? videos : videos.filter(video => !video.title && !video.creator);
    } catch (_) {
      continue;
    }
  }

  return [];
}

async function saveRemoteFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, downloadId => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(downloadId);
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'downloadVideo') {
    const reporter = createJobReporter(message.job);
    const finalName = `${sanitizeDownloadPath(message.filename, 'amazon-video').replace(/\.mp4$/i, '')}.mp4`;

    (async () => {
      try {
        if (message.url.includes('.m3u8')) {
          const downloadId = await downloadHlsAsMp4(message.url, finalName, reporter);
          sendResponse(buildSuccess({ downloadId, message: 'Guardado en tu carpeta de descargas' }));
          return;
        }

        reporter.update('running', 'Solicitando descarga', { percent: 30 });
        const downloadId = await saveRemoteFile(message.url, finalName);
        reporter.update('completed', 'Archivo descargado', { percent: 100 });
        sendResponse(buildSuccess({ downloadId, message: 'Guardado en tu carpeta de descargas' }));
      } catch (error) {
        reporter.update('failed', error.message, { percent: 100 });
        sendResponse(buildError(error.message));
      }
    })();

    return true;
  }

  if (message.action === 'fetchAndDownloadVideo') {
    const reporter = createJobReporter(message.job);

    (async () => {
      try {
        reporter.update('running', 'Buscando videos del producto', { percent: 10 });
        const videos = await getDownloadableVideosForAsin(
          message.asin,
          message.origin,
          Boolean(message.includeRelated)
        );

        if (!videos.length) {
          throw new Error('No se encontro ningun video descargable para este producto');
        }

        const baseName = sanitizeDownloadPath(message.filename, 'amazon-video').replace(/\.mp4$/i, '');
        const downloadIds = [];

        for (let index = 0; index < videos.length; index += 1) {
          const suffix = videos.length > 1 ? `-${index + 1}` : '';
          const finalName = `${baseName}${suffix}.mp4`;
          const childReporter = createJobReporter({
            ...message.job,
            label: `${message.job?.label || 'Video'} ${index + 1}/${videos.length}`
          });
          const downloadId = await downloadHlsAsMp4(videos[index].url, finalName, childReporter);
          downloadIds.push(downloadId);
        }

        reporter.update('completed', `Descargados ${downloadIds.length} videos`, { percent: 100 });
        sendResponse(buildSuccess({ count: downloadIds.length, downloadIds }));
      } catch (error) {
        reporter.update('failed', error.message, { percent: 100 });
        sendResponse(buildError(error.message));
      }
    })();

    return true;
  }

  if (message.action === 'getAllVideos') {
    (async () => {
      try {
        const videos = await getAllProductVideos(message.pageUrl);
        sendResponse(buildSuccess({ videos }));
      } catch (error) {
        sendResponse(buildError(error.message, { videos: [] }));
      }
    })();

    return true;
  }

  if (message.action === 'downloadFile') {
    const reporter = createJobReporter(message.job);

    (async () => {
      try {
        reporter.update('running', 'Solicitando descarga', { percent: 30 });
        const downloadId = await saveRemoteFile(message.url, message.filename || 'asset');
        reporter.update('completed', 'Archivo descargado', { percent: 100 });
        sendResponse(buildSuccess({ downloadId }));
      } catch (error) {
        reporter.update('failed', error.message, { percent: 100 });
        sendResponse(buildError(error.message));
      }
    })();

    return true;
  }

  return false;
});
