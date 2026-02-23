# Deploy from GitHub to Cloudflare Workers & Pages

This project runs on **Cloudflare Pages** (static assets + `/functions` API routes). Pages uses **Workers** to run serverless Functions. Connect your GitHub repo for automatic deploys on every push to `main`.

---

## Flow

```
GitHub (push) → Cloudflare build (npm run build) → Pages + Workers deploy
```

Each push to `main` triggers a new build. Cloudflare builds the `public` folder and deploys it to Pages; your `functions/` API routes run on Workers.

---

## 1. GitHub

- Push your code to GitHub (e.g. `alexanderdfox/Wall-of-Sound-and-Images`)
- Default branch: `main`

---

## 2. Cloudflare: Create resources (one-time)

Run locally (requires `npx wrangler login`):

```bash
# D1 database
npx wrangler d1 create tchoff-db
# Copy database_id into wrangler.toml [[d1_databases]]

# KV namespaces
npx wrangler kv namespace create BABEL_IMAGES
npx wrangler kv namespace create BABEL_SOUNDS
# Add ids to wrangler.toml [[kv_namespaces]]
```

Update `wrangler.toml` with the IDs. Use the **production** (not preview) IDs.

---

## 3. Cloudflare: Initialize database

```bash
npm run cf:d1:init
# Or: npx wrangler d1 execute tchoff-db --remote --file=schema.sql
```

Run migrations if needed:

```bash
npm run cf:d1:migrate
npm run cf:d1:migrate-auth
# ... etc.
```

---

## 4. Cloudflare Pages: Connect GitHub

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. **Pages** → **Connect to Git**
3. **GitHub** → authorize
4. Select repo: `alexanderdfox/Wall-of-Sound-and-Images`
5. Branch: `main`
6. **Project name**: `tchoff`

---

## 5. Build configuration

| Setting | Value |
|---------|-------|
| Framework preset | **None** |
| Build command | `npm run build` |
| Build output directory | `public` |
| Root directory | *(empty)* |
| Deploy command | *(empty — leave blank)* |

**Important:** Do not set a deploy command. Cloudflare deploys automatically after the build.

---

## 6. Bindings (D1 + KV)

**Settings** → **Functions** → **Bindings**:

| Type | Variable name | Resource |
|------|---------------|----------|
| D1 | DB | tchoff-db |
| KV | BABEL_IMAGES | *(your namespace)* |
| KV | BABEL_SOUNDS | *(your namespace)* |

The `wrangler.toml` in this repo defines these; attach the same resources in the dashboard.

---

## 7. Environment variables / secrets

**Settings** → **Environment variables**:

| Name | Value | Notes |
|------|-------|-------|
| JWT_SECRET | *(random 64+ char string)* | Required for auth; keep secret |

Generate: `openssl rand -hex 32`

---

## 8. Deploy

1. Click **Save and deploy** in the Cloudflare dashboard (first time), or
2. Push to `main` on GitHub to trigger an automatic build

**URLs:**
- Production: `https://tchoff.pages.dev` (or your custom domain)
- Preview: Each deployment gets a unique URL (e.g. `https://abc123.tchoff.pages.dev`)

**Build logs:** Workers & Pages → your project → **Deployments** → click a deployment to view logs.

---

## Checklist

- [ ] D1 database created and ID in `wrangler.toml`
- [ ] KV namespaces created and IDs in `wrangler.toml`
- [ ] D1 schema applied (`npm run cf:d1:init`)
- [ ] GitHub repo connected to Cloudflare Pages
- [ ] Build command: `npm run build`
- [ ] Build output directory: `public`
- [ ] Deploy command: *(empty)*
- [ ] D1 and KV bindings attached
- [ ] JWT_SECRET set in environment variables
