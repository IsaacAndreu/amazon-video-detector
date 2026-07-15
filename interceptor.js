// ProdRadar ? Interceptor de fetch/XHR para capturar URLs HLS de videos Amazon.
// Corre en MAIN world (document_start), antes de que el player de Amazon arranque.
// Las URLs capturadas se guardan en sessionStorage para que content.js las lea.

(function () {
  const VIDS_KEY = '_pr_vids';
  const HREF_KEY = '_pr_href';
  const IS_LIVE_VIDEO_PAGE = /^\/live\/video\//.test(location.pathname);
  const HLS_REQUEST_RE = /\.m3u8(?:[?#]|$)/i;
  const HLS_TEXT_RE = /https?:\/\/[^"'<>\s\\]+?\.m3u8(?:\?[^"'<>\s\\]*)?/gi;
  const PRODUCT_MASTER_RE = /\/default\.jobtemplate\.hls\.m3u8(?:\?|$)/i;
  const MAX_TEXT_SCAN_BYTES = 2_000_000;

  // Limpiar al navegar a una pagina distinta.
  try {
    if (sessionStorage.getItem(HREF_KEY) !== location.href) {
      sessionStorage.setItem(HREF_KEY, location.href);
      sessionStorage.setItem(VIDS_KEY, '[]');
    }
  } catch (_) {}

  function normalizeUrl(rawUrl) {
    if (!rawUrl) return '';

    const cleaned = String(rawUrl)
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&');

    try {
      return new URL(cleaned, location.href).href;
    } catch (_) {
      return cleaned;
    }
  }

  function shouldCaptureUrl(rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!url) return false;

    // Producto: seguimos capturando solo el master playlist VSE para no llenar
    // la lista con variantes de calidad.
    if (url.includes('vse-vms-transcoding-artifact') && PRODUCT_MASTER_RE.test(url)) {
      return true;
    }

    // Amazon Live: el player puede usar dominios HLS distintos (IVS,
    // CloudFront, media-amazon, etc.). Capturamos cualquier .m3u8 solo en
    // /live/video/ para no contaminar el flujo normal de productos.
    return IS_LIVE_VIDEO_PAGE && HLS_REQUEST_RE.test(url);
  }

  function saveUrl(rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!shouldCaptureUrl(url)) return;

    try {
      const list = JSON.parse(sessionStorage.getItem(VIDS_KEY) || '[]');
      if (!list.includes(url)) {
        list.push(url);
        sessionStorage.setItem(VIDS_KEY, JSON.stringify(list));
      }
    } catch (_) {}
  }

  function scanTextForHls(text) {
    if (!IS_LIVE_VIDEO_PAGE || typeof text !== 'string' || !text) return;

    const decoded = text
      .slice(0, MAX_TEXT_SCAN_BYTES)
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&');

    for (const match of decoded.matchAll(HLS_TEXT_RE)) {
      saveUrl(match[0]);
    }
  }

  function shouldScanResponse(response) {
    if (!IS_LIVE_VIDEO_PAGE || !response?.headers) return false;

    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_TEXT_SCAN_BYTES) return false;

    const type = response.headers.get('content-type') || '';
    return /json|text|javascript|mpegurl|vnd\.apple\.mpegurl/i.test(type);
  }

  // Interceptar fetch.
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    saveUrl(url);

    const promise = _fetch.apply(this, arguments);
    promise.then(response => {
      saveUrl(response?.url);
      if (!shouldScanResponse(response)) return;
      response.clone().text().then(scanTextForHls).catch(() => {});
    }).catch(() => {});

    return promise;
  };

  // Interceptar XHR (Video.js/VHS/players Live usan XHR para manifests).
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__prodradarUrl = typeof url === 'string' ? url : '';
    saveUrl(this.__prodradarUrl);

    this.addEventListener('loadend', function () {
      saveUrl(this.responseURL || this.__prodradarUrl);

      if (!IS_LIVE_VIDEO_PAGE) return;
      try {
        if (this.responseType && this.responseType !== 'text') return;
        scanTextForHls(this.responseText);
      } catch (_) {}
    }, { once: true });

    return _open.apply(this, arguments);
  };
})();
