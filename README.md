# ProdRadar

Chrome extension for Amazon research. It detects products with video, lets you build a ranking board, and downloads images and videos in bulk.

## What it does

- Detects whether a product has video in Amazon search results.
- Shows a badge over each product image.
- Lets you add products to a persistent ranking sidebar.
- Adds search, filters, and sorting to the ranking panel.
- Downloads videos as `.mp4`.
- Downloads images and videos in bulk.
- Lets you include related videos in bulk downloads.
- Exports the ranking as TXT, CSV, or JSON.
- Stores your folder name, affiliate tag, and download preferences.

## Supported marketplaces

- `amazon.com`
- `amazon.es`
- `amazon.co.uk`
- `amazon.com.mx`
- `amazon.de`
- `amazon.fr`
- `amazon.it`

## Requirements

- Google Chrome or another Chromium-based browser.
- Normal access to Amazon in your browser.
- Developer mode enabled in `chrome://extensions`.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable `Developer mode` in the top right corner.
4. Click `Load unpacked`.
5. Select this project folder.
6. Confirm that `ProdRadar` appears in your extensions list.
7. Optionally pin the extension in the browser toolbar.

## Step-by-step usage

### 1. Open Amazon

Go to any supported marketplace and browse products normally.

### 2. Wait for the badges

ProdRadar checks visible products and adds a badge over each image:

- `VIDEO`: video detected
- `Sin video`: no video detected
- `Sin datos`: the product could not be checked correctly

Detection is lazy-loaded, so results can appear progressively while you scroll.

### 3. Add products to the ranking

Hover a product and click `+ Ranking`.

The extension stores:

- ASIN
- title
- image
- price
- whether video was detected

### 4. Open the sidebar

A vertical `PRODRADAR` tab appears on the right side of the page.

Inside the panel you can:

- review all saved products
- search by title or ASIN
- filter products with or without video
- sort manually, by date, by title, or by price
- drag and drop items when manual order is active
- remove individual items
- clear the whole ranking

### 5. Configure the working folder

Use the `Carpeta` field at the bottom of the panel.

That value becomes the root folder for bulk downloads, for example:

```text
my-project/
  01_B0XXXXXXX/
  02_B0YYYYYYY/
```

### 6. Configure your preferences

The sidebar stores these options between sessions:

- download images
- download videos
- include related videos
- auto-open the panel when adding products
- folder name
- affiliate tag

### 7. Configure your affiliate tag

Use the `Tag afiliado` field if you want affiliate-ready links.

This is used to:

- copy affiliate links from saved products
- include affiliate URLs in exports

### 8. Download a single product video

On a product detail page:

1. click the extension icon
2. wait for the popup to scan the page
3. review the detected seller and related videos
4. click `Descargar MP4` on any item

The file is saved to your downloads folder.

### 9. Download all assets from the ranking

With products already added to the ranking:

1. open the sidebar
2. review the order
3. set the folder name
4. choose whether to download images, videos, and related videos
5. click `Descargar assets`

ProdRadar will organize files in a folder structure similar to:

```text
project-name/
  01_ASIN123456/
    image.jpg
    Product name.mp4
  02_ASIN654321/
    image.jpg
  briefing.txt
```

The sidebar also shows progress while the bulk job is running.

### 10. Export the ranking

Use:

- `Export TXT` for a readable briefing
- `Export CSV` for spreadsheets
- `Export JSON` for automation or external tools

Each export includes product order, title, ASIN, price, video status, product URL, affiliate URL, and image URL.

## How it works

Amazon often serves product videos as HLS streams (`.m3u8`).

ProdRadar:

1. detects video clues in the product page HTML
2. locates the playlist URL
3. downloads the stream segments
4. combines them
5. saves the result as `.mp4`

## Project structure

```text
manifest.json   Main extension manifest
interceptor.js  Intercepts fetch/XHR requests on Amazon pages
content.js      Adds badges and extracts product data
sidebar.js      Injects the ranking sidebar into Amazon pages
popup.html      Popup layout
popup.js        Popup logic
background.js   Video and file downloads
icons/          Extension icons
```

## Limitations

- Amazon changes its HTML frequently, so detection may need updates over time.
- The extension is optimized for seller videos and some related videos, but it may not catch every case.
- Bulk video download is based on what can be detected from the product page at that moment.
- Short affiliate links depend on account/session availability in Amazon Associates.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

This project is released under the [MIT License](LICENSE).
