# ProdRadar

Extensión de Chrome para detectar productos de Amazon con vídeo, crear un ranking visual y descargar assets en bloque.

## Qué hace

- Detecta si un producto tiene vídeo en los resultados de búsqueda.
- Muestra un badge sobre cada producto: `VIDEO` o `Sin vídeo`.
- Permite añadir productos a un ranking lateral.
- Descarga vídeos en formato `.mp4`.
- Descarga imágenes y vídeos de varios productos de una sola vez.
- Exporta un briefing en `.txt` con el ranking.
- Permite copiar enlaces de afiliado si configuras tu tag.

## Marketplaces compatibles

La extensión está preparada para trabajar en:

- `amazon.com`
- `amazon.es`
- `amazon.co.uk`
- `amazon.com.mx`
- `amazon.de`
- `amazon.fr`
- `amazon.it`

## Requisitos

Antes de usarla, necesitas:

- Google Chrome o un navegador basado en Chromium.
- Acceso normal a Amazon desde tu navegador.
- Tener activado el modo desarrollador de extensiones para cargarla manualmente.

## Instalación paso a paso

1. Descarga este repositorio o clónalo en tu ordenador.
2. Abre Chrome y entra en `chrome://extensions`.
3. Activa `Developer mode` en la esquina superior derecha.
4. Pulsa `Load unpacked`.
5. Selecciona la carpeta de este proyecto.
6. Comprueba que aparece la extensión `ProdRadar` en la lista.
7. Si quieres, fíjala en la barra de extensiones para tener el popup más a mano.

## Tutorial de uso

### 1. Entra en Amazon

Abre cualquiera de los marketplaces compatibles y busca productos como harías normalmente.

### 2. Espera a que aparezcan los badges

En los resultados, la extensión analiza cada producto y añade un badge sobre la imagen:

- `VIDEO`: el producto tiene vídeo detectado.
- `Sin vídeo`: no se ha encontrado vídeo.
- `Sin datos`: no se pudo comprobar correctamente.

La detección no siempre es instantánea. La extensión va cargando los productos visibles poco a poco para no saturar la página.

### 3. Añade productos al ranking

Pasa el ratón por encima de un producto y pulsa `+ Ranking`.

Cuando lo hagas:

- el producto se guarda en el panel lateral
- se conserva su posición
- también se guarda si tenía vídeo, su imagen, precio y ASIN

### 4. Abre el panel lateral

En el lado derecho verás una pestaña vertical llamada `RANKING`.

Desde ese panel puedes:

- ver todos los productos guardados
- cambiar el orden manualmente
- moverlos con drag and drop
- eliminar productos individuales
- limpiar todo el ranking

### 5. Configura la carpeta de descarga

En la parte inferior del panel hay un campo `Carpeta`.

Ese nombre se usará como carpeta raíz cuando descargues assets. Por ejemplo:

```text
mi-proyecto/
  01_B0XXXXXXX/
  02_B0YYYYYYY/
```

### 6. Configura tu tag de afiliado opcionalmente

En el campo `Tag afil.` puedes escribir tu tag de Amazon Associates, por ejemplo `mitag-21`.

Sirve para:

- copiar enlaces de afiliado desde cada producto del ranking
- incluir enlaces con tag dentro del briefing exportado

### 7. Descargar un vídeo individual desde una ficha de producto

Si entras en la página de un producto:

1. abre el icono de la extensión
2. espera a que el popup busque los vídeos
3. si encuentra alguno, verás una lista
4. pulsa `Descargar en 1 clic`

El archivo se guardará en tu carpeta de descargas.

### 8. Descargar todos los assets del ranking

Con productos ya añadidos al ranking:

1. abre el panel lateral
2. revisa el orden
3. escribe el nombre de la carpeta
4. pulsa `Descargar todos los assets`

La extensión intentará descargar:

- la imagen principal de cada producto
- el vídeo del vendedor si existe

La estructura habitual será parecida a esta:

```text
nombre-del-proyecto/
  01_ASIN123456/
    imagen.jpg
    Nombre del producto.mp4
  02_ASIN654321/
    imagen.jpg
  briefing.txt
```

### 9. Exportar el briefing

Pulsa `Exportar briefing` para generar un archivo `briefing.txt` con:

- posición del ranking
- título del producto
- ASIN
- precio
- si tiene vídeo o no
- URL del producto
- URL de afiliado si has configurado un tag

## Cómo funciona internamente

Amazon suele servir estos vídeos como streams HLS (`.m3u8`).

La extensión:

1. detecta en el HTML del producto si existe vídeo asociado al ASIN
2. localiza la playlist del vídeo
3. descarga los segmentos del stream
4. los concatena
5. guarda el resultado con extensión `.mp4`

## Estructura del proyecto

```text
manifest.json   Configuración principal de la extensión
interceptor.js  Intercepta peticiones de vídeo en la página
content.js      Añade badges y recoge datos de productos
sidebar.js      Crea el panel lateral de ranking
popup.html      Interfaz del popup
popup.js        Lógica del popup
background.js   Descarga vídeos y archivos
icons/          Iconos de la extensión
```

## Limitaciones y notas importantes

- Amazon cambia su HTML con frecuencia, así que algunas detecciones pueden dejar de funcionar si cambian la estructura de la página.
- La detección está pensada para vídeo del vendedor y algunos vídeos relacionados, pero puede no capturar todos los casos posibles.
- La descarga masiva está enfocada sobre todo al vídeo principal del producto cuando existe.
- Si un vídeo no aparece, a veces basta con recargar la página del producto.
- Para generar enlaces cortos de afiliado, Amazon puede requerir sesión iniciada y que SiteStripe esté disponible en tu cuenta.

## Consejos para compartirla con otra persona

Si la vas a subir a GitHub y compartirla con un amigo, lo más cómodo es indicarle:

1. que descargue el ZIP del repo
2. que lo descomprima
3. que cargue la carpeta desde `chrome://extensions`
4. que use Chrome en uno de los marketplaces soportados

## Estado del proyecto

Proyecto funcional orientado a uso personal o compartido de forma privada. Si vas a seguir evolucionándolo, merece la pena añadir capturas, un changelog y una licencia antes de publicarlo más ampliamente.
