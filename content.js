// =====================================================
//  PRODRADAR - Content Script
//  DetecciÃ³n real de vÃ­deo via fetch por producto
// =====================================================

const BADGE_CLASS     = 'amz-vid-badge';
const PROCESSED_CLASS = 'amz-vid-processed';
const ADD_BTN_CLASS   = 'amz-add-btn';

// â”€â”€ COLA DE FETCHES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const videoCache   = new Map();   // asin â†’ true | false | null
const fetchPending = new Map();   // asin â†’ Promise (para no duplicar)
const fetchQueue   = [];          // [{asin, card}] esperando turno
let   activeFetches = 0;
const MAX_CONCURRENT = 3;         // MÃ¡ximo simultÃ¡neo para no sobrecargar

// â”€â”€ COMPROBAR VÃDEO FETCHING LA PÃGINA DE PRODUCTO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function doFetchCheck(asin) {
  try {
    const url = `${location.origin}/dp/${asin}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url, {
      credentials: 'include',
      signal: controller.signal,
      headers: { 'Accept': 'text/html' }
    });
    clearTimeout(timeout);

    if (!res.ok) return false;
    const html = await res.text();
    return detectVideoInHtml(html, asin); // â† pasamos el ASIN

  } catch {
    return null;
  }
}

// detectVideoInHtml â€” busca indicadores de vÃ­deo ANCLADOS al ASIN del producto.
//
// Â¿Por quÃ© anclarse al pageAsin?
//   Las pÃ¡ginas de producto de Amazon incluyen vÃ­deos de reviews, productos
//   patrocinados y brand stores que cargan los mismos componentes VSE.
//   Escanear todo el HTML genera FALSOS POSITIVOS.
//   La soluciÃ³n: buscar totalVideoCount / URL de CDN SOLO dentro del bloque
//   JSON que contiene "pageAsin":"ASIN" â€” esos datos pertenecen al producto.
//
// Indicadores vÃ¡lidos (confirmados en amazon.es):
//   totalVideoCount > 0          â† contador de vÃ­deos del producto
//   vse-vms-transcoding-artifact â† URL del CDN de vÃ­deo transcodificado
//   videoIngressATFSlateThumbURL â† solo si tiene valor de URL (no solo la clave)
function detectVideoInHtml(html, asin) {
  // DIAGNÃ“STICO CONFIRMÃ“ (HTML fetched estÃ¡tico de amazon.es):
  //   - "pageAsin" y "videoAsin" NO existen en el HTML estÃ¡tico
  //     (son datos del DOM dinÃ¡mico, inyectados por JS tras la carga)
  //   - "mediaAsin":"ASIN" SÃ existe en el HTML estÃ¡tico, en el bloque
  //     de configuraciÃ³n del ImageBlock/VSE del producto
  //   - "vse-vms-transcoding-artifact" aparece en el MISMO script que
  //     "mediaAsin" cuando el producto tiene vÃ­deo
  //   Script #189 (22444 chars) tiene ambos confirmados para B06X9NQ8GX

  const mediaAsinRe = new RegExp(`["']mediaAsin["']\\s*:\\s*["']${asin}["']`);
  const m = html.match(mediaAsinRe);
  if (!m) return false;

  // Extraer el <script> completo que contiene este mediaAsin
  const scriptStart = html.lastIndexOf('<script', m.index);
  const scriptEnd   = html.indexOf('</script>', m.index);
  const script = (scriptStart !== -1 && scriptEnd !== -1)
    ? html.slice(scriptStart, scriptEnd)
    : html.slice(Math.max(0, m.index - 5000), m.index + 5000);

  // Indicador primario: CDN de vÃ­deo transcodificado en el mismo script
  if (script.includes('vse-vms-transcoding-artifact')) return true;

  // Indicadores secundarios (por si el CDN no estÃ¡ en este script)
  const cnt = script.match(/["']totalVideoCount["']\s*:\s*["'](\d+)["']/);
  if (cnt && parseInt(cnt[1]) > 0) return true;
  if (/["']videoIngressATFSlateThumbURL["']\s*:\s*["']https?:\/\//.test(script)) return true;

  return false;
}

// detectVideoInCurrentPageDOM â€” inspecciÃ³n directa del DOM en la pÃ¡gina actual.
// Usa el mismo enfoque anclado al ASIN, pero con datos del DOM en vivo.
function detectVideoInCurrentPageDOM() {
  // Extraer el ASIN de la URL actual (ej. /dp/B06X9NQ8GX/ o /gp/product/B06X9NQ8GX/)
  const asin = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1];

  // 1. Buscar en scripts que contengan mediaAsin o pageAsin del producto.
  //    - mediaAsin â†’ scripts estÃ¡ticos del ImageBlock/VSE (HTML inicial)
  //    - pageAsin  â†’ scripts dinÃ¡micos inyectados por JS (solo en DOM vivo)
  if (asin) {
    const patterns = [
      new RegExp(`["']mediaAsin["']\\s*:\\s*["']${asin}["']`),
      new RegExp(`["']pageAsin["']\\s*:\\s*["']${asin}["']`),
    ];
    for (const s of document.querySelectorAll('script:not([src])')) {
      const t = s.textContent;
      if (!patterns.some(re => re.test(t))) continue;

      // Script del producto â†’ buscar indicadores de vÃ­deo en TODO el script
      if (t.includes('vse-vms-transcoding-artifact'))                           return true;
      if (/["']videoAsin["']\s*:\s*["'][a-f0-9]{8,}["']/.test(t))             return true;
      const cnt = t.match(/["']totalVideoCount["']\s*:\s*["'](\d+)["']/);
      if (cnt && parseInt(cnt[1]) > 0)                                          return true;
      if (/["']videoIngressATFSlateThumbURL["']\s*:\s*["']https?:\/\//.test(t)) return true;
    }
  }

  // 2. Elementos del reproductor VSE renderizados en el DOM vivo.
  //    En la pÃ¡gina del producto propio, estos solo aparecen si HAY vÃ­deo del vendedor.
  if (document.querySelector('.vse-vp-container'))    return true;
  if (document.getElementById('videoInsertedWidget')) return true;

  return false;
}

// â”€â”€ GESTIÃ“N DE LA COLA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function emitScanProgress() {
  const values = [...videoCache.values()];
  const checked = values.filter(v => v !== 'queued').length;
  window.dispatchEvent(new CustomEvent('prodradar:scanprogress', {
    detail: { checked, total: values.length }
  }));
}

function queueProduct(asin, card) {
  if (videoCache.has(asin) || fetchPending.has(asin)) return;
  videoCache.set(asin, 'queued');
  fetchQueue.push({ asin, card });
  emitScanProgress();
  processQueue();
}

function processQueue() {
  while (activeFetches < MAX_CONCURRENT && fetchQueue.length > 0) {
    const { asin, card } = fetchQueue.shift();

    // Si ya fue procesado mientras esperaba en la cola, saltar
    if (videoCache.get(asin) !== 'queued') continue;

    activeFetches++;

    const promise = doFetchCheck(asin).then(hasVideo => {
      activeFetches--;
      fetchPending.delete(asin);
      videoCache.set(asin, hasVideo);
      updateCardBadge(card, asin, hasVideo);
      processQueue();
    });

    fetchPending.set(asin, promise);
  }
}

function updateCardBadge(card, asin, hasVideo) {
  document.querySelectorAll(`[data-asin="${asin}"] .${BADGE_CLASS}`).forEach(badge => {
    applyBadgeState(badge, hasVideo);
  });
  emitScanProgress();
}

// â”€â”€ ESTADOS DEL BADGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function applyBadgeState(badge, state) {
  if (state === true) {
    badge.textContent       = 'VIDEO';
    badge.style.background  = '#1a7f37';
    badge.style.border      = '1px solid #2ea84a';
  } else if (state === false) {
    badge.textContent       = 'Sin video';
    badge.style.background  = 'rgba(60,60,60,0.7)';
    badge.style.border      = '1px solid rgba(255,255,255,0.15)';
  } else {
    // null = no se pudo comprobar
    badge.textContent       = '? Sin datos';
    badge.style.background  = 'rgba(80,80,80,0.6)';
    badge.style.border      = '1px solid rgba(255,255,255,0.1)';
  }
}

function createBadge() {
  const badge = document.createElement('div');
  badge.className = BADGE_CLASS;
  Object.assign(badge.style, {
    position:      'absolute',
    top:           '6px',
    left:          '6px',
    zIndex:        '9998',
    padding:       '3px 8px',
    borderRadius:  '12px',
    fontSize:      '11px',
    fontWeight:    'bold',
    fontFamily:    'Arial, sans-serif',
    lineHeight:    '1.4',
    pointerEvents: 'none',
    boxShadow:     '0 1px 4px rgba(0,0,0,0.4)',
    whiteSpace:    'nowrap',
    background:    'rgba(80,80,80,0.6)',
    color:         'white',
    border:        '1px solid rgba(255,255,255,0.15)',
    transition:    'background 0.4s, border 0.4s',
  });
  badge.textContent = '...';
  return badge;
}

// â”€â”€ BOTÃ“N "ï¼‹ RANKING" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function createAddButton(card) {
  const btn = document.createElement('button');
  btn.className = ADD_BTN_CLASS;
  btn.textContent = '+ Ranking';
  Object.assign(btn.style, {
    position:        'absolute',
    bottom:          '6px',
    left:            '6px',
    zIndex:          '9999',
    padding:         '4px 10px',
    borderRadius:    '12px',
    fontSize:        '11px',
    fontWeight:      'bold',
    fontFamily:      'Arial, sans-serif',
    background:      '#131921',
    color:           'white',
    border:          '1px solid rgba(255,255,255,0.25)',
    cursor:          'pointer',
    boxShadow:       '0 1px 4px rgba(0,0,0,0.5)',
    whiteSpace:      'nowrap',
    opacity:         '0',
    transition:      'opacity 0.2s, background 0.2s',
    pointerEvents:   'auto',
    textDecoration:  'none',
    textTransform:   'none',
    letterSpacing:   'normal',
    lineHeight:      '1.4',
  });

  btn.addEventListener('mouseenter', () => { btn.style.background = '#ff6b00'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = '#131921'; });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const data = extractProductData(card);
    window.dispatchEvent(new CustomEvent('prodradar:add', { detail: data }));
    btn.textContent = 'Anadido';
    btn.style.background = '#1a7f37';
    setTimeout(() => {
      btn.textContent = '+ Ranking';
      btn.style.background = '#131921';
    }, 2000);
  });
  return btn;
}

// â”€â”€ EXTRAER DATOS DEL PRODUCTO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function extractRating(card) {
  // aria-label es el más fiable entre idiomas: "4.5 out of 5 stars", "4,5 de 5 estrellas"…
  const el = card.querySelector(
    'span[aria-label*="out of 5"], span[aria-label*="de 5"], ' +
    'span[aria-label*="von 5"], span[aria-label*="su 5"], span[aria-label*="sur 5"]'
  );
  if (el) {
    const m = (el.getAttribute('aria-label') || '').match(/(\d+[.,]\d+)/);
    if (m) return parseFloat(m[1].replace(',', '.'));
  }
  // Fallback: texto del icono de estrellas
  const alt = card.querySelector('.a-icon-alt');
  if (alt) {
    const m = alt.textContent.trim().match(/^(\d+[.,]\d+)/);
    if (m) return parseFloat(m[1].replace(',', '.'));
  }
  return 0;
}

function extractReviewCount(card) {
  // Clase específica de Amazon para el contador de reviews en resultados
  for (const el of card.querySelectorAll('.a-size-base.s-underline-text')) {
    const n = parseInt(el.textContent.replace(/[,.\s]/g, ''), 10);
    if (n > 0) return n;
  }
  // Fallback: aria-label con número + palabra de valoraciones
  for (const el of card.querySelectorAll('[aria-label]')) {
    const label = el.getAttribute('aria-label') || '';
    if (/\d/.test(label) && /(rating|valorac|Bewertung|recensi|avis)/i.test(label)) {
      const m = label.replace(/[,.\s]/g, '').match(/(\d{2,})/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return 0;
}

function extractProductData(card) {
  const asin        = card.dataset.asin || card.getAttribute('data-asin') || '';
  const titleEl     = card.querySelector('h2 a span, .a-text-normal, .a-size-base-plus');
  const title       = titleEl?.textContent?.trim() || 'Sin titulo';
  const imgEl       = card.querySelector('.s-image, img[src*="amazon"]');
  const imageUrl    = imgEl?.src || '';
  const priceEl     = card.querySelector('.a-price .a-offscreen');
  const price       = priceEl?.textContent?.trim() || '';
  const hasVideo    = videoCache.get(asin) === true;
  const rating      = extractRating(card);
  const reviewCount = extractReviewCount(card);
  return { asin, title, imageUrl, price, hasVideo, rating, reviewCount, addedAt: Date.now() };
}

// â”€â”€ WRAPPER DE IMAGEN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function findImageWrapper(card) {
  const selectors = [
    '.s-product-image-container',
    '.s-image-square-aspect-ratio',
    '[data-component-type="s-product-image"]',
    '.a-section.aok-relative',
    '.imgTagWrapper',
  ];
  for (const sel of selectors) {
    const el = card.querySelector(sel);
    if (el) return (el.tagName === 'IMG') ? el.parentElement : el;
  }
  const img = card.querySelector('img.s-image, img[src*="amazon"]');
  return img ? img.parentElement : null;
}

// â”€â”€ INTERSECTION OBSERVER: solo cargamos lo visible â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const visibilityObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const card = entry.target;
      const asin = (card.dataset.asin || '').trim();
      if (asin) {
        queueProduct(asin, card);
        visibilityObserver.unobserve(card);
      }
    });
  },
  { rootMargin: '300px' } // Pre-cargar 300px antes de que sean visibles
);

// â”€â”€ PROCESAR PRODUCTS DE BÃšSQUEDA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function processProducts() {
  const cards = document.querySelectorAll(`
    [data-asin]:not(.${PROCESSED_CLASS}),
    [data-component-type="s-search-result"]:not(.${PROCESSED_CLASS}),
    li[data-asin]:not(.${PROCESSED_CLASS})
  `);

  cards.forEach(card => {
    const asin = (card.dataset.asin || card.getAttribute('data-asin') || '').trim();
    if (!asin) return;

    card.classList.add(PROCESSED_CLASS);

    const imgWrapper = findImageWrapper(card);
    if (!imgWrapper) return;

    // Evitar getComputedStyle() en el loop (fuerza reflow por cada tarjeta).
    // Con la clase CSS ya tenemos position:relative sin coste de layout.
    if (!imgWrapper.style.position || imgWrapper.style.position === 'static') {
      imgWrapper.style.position = 'relative';
    }
    if (imgWrapper.querySelector('.' + BADGE_CLASS)) return;

    // Badge en estado "cargando"
    imgWrapper.appendChild(createBadge());

    // BotÃ³n + Ranking
    const addBtn = createAddButton(card);
    imgWrapper.appendChild(addBtn);
    imgWrapper.addEventListener('mouseenter', () => { addBtn.style.opacity = '1'; });
    imgWrapper.addEventListener('mouseleave', () => { addBtn.style.opacity = '0'; });

    // Registrar para carga lazy
    visibilityObserver.observe(card);
  });
}

// â”€â”€ PÃGINA DE PRODUCTO INDIVIDUAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function processProductPage() {
  if (!/\/(?:dp|gp\/product)\//.test(location.pathname)) return;

  const mainImgWrapper =
    document.querySelector('#imgTagWrapperId') ||
    document.querySelector('#main-image-container') ||
    document.querySelector('.imgTagWrapper');

  if (!mainImgWrapper || mainImgWrapper.querySelector('.' + BADGE_CLASS)) return;

  if (!mainImgWrapper.style.position || mainImgWrapper.style.position === 'static') {
    mainImgWrapper.style.position = 'relative';
  }

  const badge = createBadge();
  mainImgWrapper.appendChild(badge);

  // En la pÃ¡gina de producto ya estamos en ella: usar DOM directo (mÃ¡s preciso)
  const hasVideo = detectVideoInCurrentPageDOM();
  applyBadgeState(badge, hasVideo);
}

// â”€â”€ VIDEOS PARA EL POPUP (pÃ¡gina de producto) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function findVideosOnPage() {
  const videos = [];
  const seen   = new Set();
  const add    = (url, type) => {
    if (url && !seen.has(url) && url.startsWith('http')) {
      seen.add(url); videos.push({ url, type });
    }
  };
  document.querySelectorAll('video').forEach(v => {
    add(v.src, 'direct');
    v.querySelectorAll('source').forEach(s => add(s.src, 'source'));
  });
  document.querySelectorAll('script:not([src])').forEach(s => {
    const m = s.textContent.matchAll(/["'](https:\/\/[^"'\s]*\.(?:mp4|webm|m3u8)[^"'\s]*?)["']/g);
    for (const x of m) add(x[1], 'script');
  });
  return videos;
}

// â”€â”€ MUTATION OBSERVER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Guardamos la referencia para poder desconectar el observer cuando ya no haga falta.
//
// En páginas de búsqueda/listado se mantiene activo (necesario para scroll infinito).
// En páginas de producto (/dp/) se desconecta en cuanto el badge está colocado:
// el JS propio de Amazon dispara cientos de mutaciones pero ya no tenemos nada que
// procesar, así que observar el DOM entero con subtree:true es trabajo inútil.
let debounce = null;
const domObserver = new MutationObserver(() => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    processProducts();
    processProductPage();

    if (
      /\/(?:dp|gp\/product)\//.test(location.pathname) &&
      document.querySelector('.' + BADGE_CLASS)
    ) {
      domObserver.disconnect();
    }
  }, 600);
});
domObserver.observe(document.body, { childList: true, subtree: true });

// â”€â”€ MENSAJES DEL POPUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Obtiene el tÃ­tulo del producto de la pÃ¡gina actual
function getProductTitle() {
  const selectors = [
    '#productTitle',
    '#title span',
    'h1.a-size-large',
    'h1[data-automation-id="title"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return '';
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getVideos') {
    const v     = findVideosOnPage();
    const title = getProductTitle();

    // AÃ±adir URLs capturadas por el interceptor de fetch/XHR (interceptor.js, MAIN world)
    try {
      const intercepted = JSON.parse(sessionStorage.getItem('_pr_vids') || '[]');
      intercepted.forEach(url => {
        if (!v.some(x => x.url === url)) v.push({ url, type: 'intercepted' });
      });
    } catch (_) {}

    sendResponse({ videos: v, hasVideos: v.length > 0, title });
  }
  return true;
});

// â”€â”€ INICIO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Sidebar pide añadir al ranking todos los productos con vídeo ya detectados
window.addEventListener('prodradar:requestAddAll', () => {
  let added = 0;
  videoCache.forEach((hasVideo, asin) => {
    if (hasVideo !== true) return;
    const card = document.querySelector(`[data-asin="${asin}"]`);
    if (!card) return;
    window.dispatchEvent(new CustomEvent('prodradar:add', { detail: extractProductData(card) }));
    added++;
  });
  window.dispatchEvent(new CustomEvent('prodradar:addallresult', { detail: { added } }));
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { processProducts(); processProductPage(); });
} else {
  processProducts();
  processProductPage();
}
