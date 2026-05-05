# Eclipse → 8SPINE Dynamic Bridge

A Vercel serverless app that **auto-syncs** with the Eclipse Music community addon registry and serves it as a live 8SPINE module source.

## How it works

```
8SPINE requests index.json
       ↓
/api/index.js fetches eclipsemusic.app/addonstore/registry.json live
       ↓
Converts every Eclipse addon → 8SPINE module entry
       ↓
8SPINE taps "Add to 8SPINE" on any addon
       ↓
/api/module.js generates the .8spine code on-the-fly for that addon
```

Every time 8SPINE refreshes the source, it gets the **current** Eclipse addon list — no manual updates needed.

## Deploy to Vercel

### Option A — Vercel CLI (fastest)
```bash
npm i -g vercel
cd eclipse-8spine-dynamic
vercel --prod
```

### Option B — GitHub + Vercel dashboard
1. Push this folder to a **new GitHub repo**
2. Go to [vercel.com/new](https://vercel.com/new) → Import that repo
3. No build settings needed — just deploy
4. Your URL will be: `https://your-project.vercel.app`

## Add to 8SPINE

Once deployed, paste this into **8SPINE → Sources → Add Source**:

```
https://your-project.vercel.app/index.json
```

That's it. Every Eclipse addon appears as a separate installable module, and the list stays in sync automatically.

## File structure

```
vercel.json          ← routes /index.json and /modules/*.8spine to API functions
package.json
api/
  index.js           ← serves dynamic index.json (fetches Eclipse registry live)
  module.js          ← generates .8spine code on-the-fly per addon
```
