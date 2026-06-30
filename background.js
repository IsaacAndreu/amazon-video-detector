const MAX_CONCURRENT_DOWNLOADS = 2;
const PRODUCT_PATH_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i;


const videoDownloadQueue = [];
let activeVideoDownloads = 0;

function enqueueVideoDownload(task) {
  return new Promise((resolve, reject) => {
    videoDownloadQueue.push({ task, resolve, reject });
    processVideoDownloadQueue();
  });
}

function processVideoDownloadQueue() {
  while (activeVideoDownloads < MAX_CONCURRENT_DOWNLOADS && videoDownloadQueue.length > 0) {
    const item = videoDownloadQueue.shift();
    activeVideoDownloads += 1;

    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        activeVideoDownloads = Math.max(0, activeVideoDownloads - 1);
        processVideoDownloadQueue();
      });
  }
}

function buildError(message, extra = {}) {
  return { success: false, error: message, ...extra };
}

function buildSuccess(extra = {}) {
  return { success: true, ...extra };
}

function createJobReporter(job = {}) {
  return {
    job,
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

let creatingOffscreenDocument = null;

async function hasOffscreenDocument() {
  if (chrome.offscreen?.hasDocument) {
    return chrome.offscreen.hasDocument();
  }

  if (!chrome.runtime.getContexts) return false;

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });

  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreenDocument) return creatingOffscreenDocument;

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Assemble Amazon HLS video segments into downloadable MP4 blobs.'
  }).finally(() => {
    creatingOffscreenDocument = null;
  });

  return creatingOffscreenDocument;
}

function sendOffscreenMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.success) {
        reject(new Error(response?.error || 'Offscreen media worker failed'));
        return;
      }

      resolve(response);
    });
  });
}

async function assembleHlsInOffscreen(url, job) {
  await ensureOffscreenDocument();
  return sendOffscreenMessage({
    action: 'assembleHlsVideo',
    url,
    job
  });
}

async function revokeOffscreenObjectUrl(objectUrl) {
  if (!objectUrl) return;

  try {
    await ensureOffscreenDocument();
    await sendOffscreenMessage({
      action: 'revokeObjectUrl',
      objectUrl
    });
  } catch (_) {
    // Best-effort cleanup. The object URL also disappears when the offscreen
    // document is closed, but explicit revocation avoids memory growth.
  }
}

async function downloadHlsAsMp4(url, filename, reporter) {
  let objectUrl = '';

  try {
    reporter.update('queued', 'Esperando turno de descarga', { percent: 0 });
    reporter.update('running', 'Preparando worker de video', { percent: 5 });

    const assembled = await assembleHlsInOffscreen(url, reporter.job || {});
    objectUrl = assembled.objectUrl;

    reporter.update('running', 'Confirmando descarga en Chrome', { percent: 95 });
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({ url: objectUrl, filename, saveAs: false }, id => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(id);
      });
    });

    reporter.update('completed', 'Video descargado', { percent: 100 });
    return downloadId;
  } finally {
    await revokeOffscreenObjectUrl(objectUrl);
    objectUrl = '';
  }
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

async function getDownloadableVideosForAsin(asin, origin, includeRelated, maxVideos = 0) {
  for (const pageUrl of productPageCandidates(origin, asin)) {
    try {
      const videos = await getAllProductVideos(pageUrl);
      if (!videos.length) continue;

      const filtered = includeRelated ? videos : videos.filter(video => !video.title && !video.creator);
      // maxVideos 0 = sin límite; si hay límite, cortar la lista
      return maxVideos > 0 ? filtered.slice(0, maxVideos) : filtered;
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
          const downloadId = await enqueueVideoDownload(() => downloadHlsAsMp4(message.url, finalName, reporter));
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
          Boolean(message.includeRelated),
          Number(message.maxVideos) || 0
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
          const downloadId = await enqueueVideoDownload(() => downloadHlsAsMp4(videos[index].url, finalName, childReporter));
          downloadIds.push(downloadId);
        }

        const n = downloadIds.length;
        reporter.update('completed', `${n} video${n !== 1 ? 's' : ''} descargado${n !== 1 ? 's' : ''}`, { percent: 100 });
        sendResponse(buildSuccess({ count: n, downloadIds }));
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

  // ── GENIUSLINK ──────────────────────────────────────────────────────────────
  // La llamada se hace desde el service worker (no desde el content script)
  // para evitar restricciones CORS. Necesita host_permissions en manifest.json.

  if (message.action === 'createGeniusLink') {
    (async () => {
      try {
        const { destinationUrl, apiKey, apiSecret, groupId, domain } = message;

        const params = new URLSearchParams({ url: destinationUrl });
        if (groupId !== undefined && groupId !== '') params.set('groupId', String(groupId));
        if (domain)                                  params.set('domain', domain);

        const response = await fetch(
          `https://api.geniuslink.com/v3/shorturls?${params.toString()}`,
          {
            method: 'POST',
            headers: {
              'X-Api-Key':    apiKey,
              'X-Api-Secret': apiSecret,
              'Accept':       'application/json'
            }
          }
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          sendResponse(buildError(body.message || `GeniusLink error ${response.status}`));
          return;
        }

        const data = await response.json();
        const { code, domain: linkDomain, baseDomain } = data.shortUrl || {};
        const host     = linkDomain || baseDomain || 'geni.us';
        const shortUrl = `https://${host}/${code}`;

        sendResponse(buildSuccess({ shortUrl }));
      } catch (error) {
        sendResponse(buildError(error.message));
      }
    })();

    return true;
  }

  return false;
});
