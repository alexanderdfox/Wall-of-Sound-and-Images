# Tchoff — Hash-Based Image Gallery

Store images once. Each size (100, 200, 400, 800, 1600) gets a unique hash that matches the JavaScript equivalent (raw RGBA → SHA-256).

## How it works

- **Upload**: Image normalized to 1600×1600, stored by content hash. Variants at each size get unique hashes.
- **Retrieve**: `/i/:hash` or `/i/:baseHash?size=400`. Client can hash image data and find matches.
- **JS-compatible**: Same algorithm server (sharp) and client (canvas + crypto.subtle).

## Run (Node.js)

```bash
npm install
npm start
```

Open http://localhost:3000

## Deploy on Cloudflare

Runs on **Cloudflare Pages** with **D1** (SQLite) and **R2** (object storage). All image hashing and Babelia computation happens in the browser.

### Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up)
2. Log in: `npx wrangler login`

### Setup

```bash
npm install
npm run cf:d1:create   # creates D1 — copy database_id into wrangler.toml
npm run cf:r2:create   # creates R2 bucket
```

Edit `wrangler.toml` and replace `database_id = "00000000-0000-0000-0000-000000000000"` with the ID from D1 create.

```bash
npm run cf:d1:init     # apply schema to D1
npm run cf:deploy      # deploy to Cloudflare Pages
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /i/n/:num` | Generate image on fly. `?format=json` for `{ num, hash }` |
| `GET /i/:hash` | Generate image on fly. `?format=json` for `{ num, hash }` |
| `POST /api/upload` | Upload image; pixel-per-pixel match, assign number, discard file |
| `GET /api/catalog` | List every unique 1600×1600 image (num, hash) |
| `GET /api/feed` | List all posts with variants |
| `GET /api/post/n/:num` | Get post by number |
| `GET /api/post/:hash` | Get post by hash |
| `GET /api/exists/:hash` | Check if image exists |
| `GET /api/hashes` | List all hashes in database |

## Storage

**Database text storage only.** No image files. Based on [babelia.libraryofbabel.info](https://babelia.libraryofbabel.info).

```
storage/
  tchoff.db   # SQLite — num, babelia_location, caption, username, exif
```

- **Babelia format**: 640×416 pixels, 4096 colors (12-bit RGB) — same space as the Babel Image Archives
- Upload → compute location (SHA-256 of quantized pixels), assign num. Original discarded.
- Match → return existing num. New → assign next num.
- **`GET /i/n/:num`** or **`GET /i/:location`** → generate image on fly from DB
- **`?format=json`** → `{ num, babeliaLocation }`
