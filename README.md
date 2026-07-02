# CORE

A searchable visual index of internet culture — and the official home of the communities behind each aesthetic.

**The full platform** (accounts, verified communities, community feeds, onboarding funnels, admin console) runs on a small Node.js server. See **[PLATFORM.md](PLATFORM.md)** for install, deployment, architecture and test results. Quick start:

```bash
npm install
cp .env.example .env      # set ADMIN_EMAIL / ADMIN_PASSWORD
node --env-file=.env server/seed.js
node --env-file=.env server/index.js   # → http://localhost:8000
```

**The wiki alone** can still be served as a static site (galleries, articles, graph, quiz — no accounts or communities):

## Publish with GitHub Pages

1. Open this repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select **main** and **/(root)**.
5. Click **Save**.

The public address will be:

`https://kellz11.github.io/core-search/`

## Image search

Search results are requested live from Openverse and Wikimedia Commons. Images are not downloaded into this repository.
