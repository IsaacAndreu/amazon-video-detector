# Changelog

## 1.2.0 - 2026-06-30

### Added
- Cola global para limitar descargas HLS a 2 videos simultaneos.
- Documento offscreen para resolver playlists HLS, descargar segmentos y crear el Blob MP4 fuera del service worker MV3.

### Changed
- El `background.js` ahora solo orquesta la cola de descargas HLS; el trabajo pesado de media vive en `offscreen.js`.
- El content script procesa solo nodos de producto nuevos y debouncea mutaciones a 250ms.

### Fixed
- Se revocan los object URLs tras confirmar la descarga para evitar crecimiento de memoria.
- Se cachean ASIN ya analizados para no reanalizar ni repintar badges en scroll o cambios de filtros.

## 1.1.0 - 2026-04-08

### Added
- Filtros por busqueda y estado de video en el sidebar.
- Orden manual, por fecha, por titulo y por precio.
- Ajustes persistentes para carpeta, tag de afiliado y opciones de descarga.
- Exportaciones en TXT, CSV y JSON.
- Seguimiento de progreso para descargas en bloque.
- Opcion para incluir videos relacionados en la descarga masiva.

### Changed
- Branding unificado a ProdRadar.
- Popup rehecho para mostrar mejor el resumen de videos del producto.
- Compatibilidad ampliada para rutas `/dp/` y `/gp/product/`.
- Compatibilidad del popup con todos los marketplaces declarados en el manifest.

### Fixed
- Se corrigio la deteccion del popup fuera de `amazon.com`, `amazon.es`, `amazon.co.uk` y `amazon.com.mx`.
- Se corrigio la extraccion de ASIN en fichas que usan `/gp/product/`.
- Se limpiaron varios textos visibles que mostraban caracteres rotos.
