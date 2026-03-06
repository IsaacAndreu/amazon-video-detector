# Amazon Video Detector — Chrome Extension

Chrome extension (Manifest V3) that detects Amazon products with seller videos and lets you download them.

## Features

- **Video badge** on search results — instantly see which products have seller videos (▶ VIDEO / ✕ Sin video)
- **Download videos as MP4** — converts HLS streams to proper .mp4 files
- **Product ranking sidebar** — add products to a ranked list, reorder via drag & drop
- **Bulk download** — download all images + videos from your ranking into organized folders
- **Custom folder name** — set the output folder name before downloading
- **Briefing export** — export a .txt summary of your ranking

## Installation

1. Clone or download this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the extension folder

## How it works

Amazon serves seller videos via their VSE (Video Service Engine) as HLS streams (`.m3u8`).
The extension detects them by finding `mediaAsin` + `vse-vms-transcoding-artifact` in the product page's static HTML, then downloads all HLS segments and concatenates them into a single `.mp4`.

## File structure

```
manifest.json       — Extension manifest (MV3)
content.js          — Injected into Amazon pages (detection + badges)
background.js       — Service worker (HLS downloader, file downloads)
sidebar.js          — Ranking sidebar injected into Amazon pages
popup.html/js       — Extension popup (current product video player)
icons/              — Extension icons
```

## Folder structure on download

```
your-folder-name/
  01_ASIN123/
    imagen.jpg
    Product Title-1.mp4
    Product Title-2.mp4
  02_ASIN456/
    imagen.jpg
    Product Title.mp4
  briefing.txt
```
