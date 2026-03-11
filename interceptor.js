// ProdRadar — Interceptor de fetch/XHR para capturar URLs HLS de vídeos VSE
// Corre en MAIN world (document_start), antes de que el player de Amazon arranque.
// Las URLs capturadas se guardan en sessionStorage para que content.js las lea.

(function () {
  const VIDS_KEY = '_pr_vids';
  const HREF_KEY = '_pr_href';

  // Limpiar al navegar a una página distinta
  try {
    if (sessionStorage.getItem(HREF_KEY) !== location.href) {
      sessionStorage.setItem(HREF_KEY, location.href);
      sessionStorage.setItem(VIDS_KEY, '[]');
    }
  } catch (_) {}

  function saveUrl(url) {
    if (!url || !url.includes('vse-vms-transcoding-artifact')) return;
    // Solo capturar el master playlist (termina en default.jobtemplate.hls.m3u8)
    // Las variantes de calidad tienen sufijos extra (720p, 480p...) → ignorarlas
    if (!/\/default\.jobtemplate\.hls\.m3u8(\?|$)/.test(url)) return;
    try {
      const list = JSON.parse(sessionStorage.getItem(VIDS_KEY) || '[]');
      if (!list.includes(url)) {
        list.push(url);
        sessionStorage.setItem(VIDS_KEY, JSON.stringify(list));
      }
    } catch (_) {}
  }

  // Interceptar fetch
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    saveUrl(url);
    return _fetch.apply(this, arguments);
  };

  // Interceptar XHR (Video.js/VHS usa XHR para manifests y segmentos)
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (typeof url === 'string') saveUrl(url);
    return _open.apply(this, arguments);
  };
})();
