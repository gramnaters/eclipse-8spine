/**
 * /modules/{slug}.js – Dynamic 8SPINE module generator
 *
 * Generates self-configuring module JavaScript for each Eclipse addon.
 * Modules handle their own token generation where needed, matching the
 * pattern used by Ricky's working Monochrome 8spine module.
 */

const ECLIPSE_REGISTRY = "https://eclipsemusic.app/addonstore/registry.json";

// ── Per-addon configuration ──────────────────────────────────────────────────
//
// tokenMode:
//   "generate" – addon supports POST /generate to obtain a /u/{token} prefix
//   "hardcoded" – addon requires a static hash prefix (no generate endpoint)
//   "none" – addon works without any prefix
//
// pathStyle:
//   "u"    – uses /u/{token}/search, /u/{token}/stream/{id}
//   "root" – uses /{hash}/search, /{hash}/stream/{id}
//   "bare" – uses /search, /stream/{id} directly

const ADDON_CONFIG = {
  "com.eclipse.community.allinone": {
    tokenMode: "none",
    pathStyle: "bare",
    labels: ["LOSSLESS", "MULTI-SOURCE", "FREE"],
    settings: {
      quality: {
        type: "selector",
        label: "Audio Quality",
        description: "Select preferred streaming quality for HiFi tracks",
        options: [
          { label: "128kbps", value: "LOW" },
          { label: "320kbps", value: "HIGH" },
          { label: "Lossless (FLAC)", value: "LOSSLESS" },
        ],
        defaultValue: "LOSSLESS",
      },
    },
  },
  "com.eclipse.community.soundcloud": {
    tokenMode: "generate",
    pathStyle: "u",
    labels: ["SOUNDCLOUD", "MP3", "FREE"],
  },
  "com.eclipse.community.monochrome": {
    tokenMode: "generate",
    pathStyle: "u",
    labels: ["LOSSLESS", "TIDAL", "QOBUZ"],
  },
  "com.eclipse.community.radio": {
    tokenMode: "generate",
    pathStyle: "u",
    labels: ["RADIO", "LIVE", "FREE"],
  },
  "com.eclipse.community.spotiflac": {
    tokenMode: "hardcoded",
    pathStyle: "root",
    hardcodedHash: "821d442866587433",
    labels: ["LOSSLESS", "FLAC", "HIFI"],
  },
  "cx.artistgrid.eclipse.unreleased": {
    tokenMode: "none",
    pathStyle: "bare",
    labels: ["UNRELEASED", "CATALOG"],
  },
  // DeezerTidal: broken API (returns 0 tracks), skip
  "com.eclipse.community.deezertidal": { skip: true },
  // YTMusic: requires Google auth, skip
  "com.eclipse.community.ytmusic": { skip: true },
};

function slugify(id) {
  return id
    .replace(/^com\.eclipse\.community\./, "eclipse-")
    .replace(/^cx\.artistgrid\.eclipse\./, "eclipse-artistgrid-")
    .replace(/\./g, "-");
}

function generateModuleCode(addon) {
  const cfg = ADDON_CONFIG[addon.id] || { tokenMode: "none", pathStyle: "bare", labels: ["STREAM"] };
  const rawBase = (addon.setupUrl || addon.manifestUrl || "").replace(/\/$/, "");

  // For manifestUrl-based addons, strip /manifest.json
  let base = rawBase;
  if (addon.manifestUrl && !addon.setupUrl) {
    base = addon.manifestUrl.replace(/\/manifest\.json$/, "");
  }

  const slug = slugify(addon.id);
  const name = addon.name;
  const ver = addon.version || "1.0.0";
  const id = addon.id;
  const labels = JSON.stringify(cfg.labels || ["STREAM"]);
  let settingsObj = cfg.settings || {};
  if (cfg.tokenMode === "generate" || cfg.tokenMode === "hardcoded") {
    settingsObj.customToken = {
      type: "text",
      label: "Custom Access Token (Optional)",
      description: "Enter a custom hash if the default is rate limited. You can generate one from the addon's setup page.",
      defaultValue: ""
    };
  }

  const settingsBlock = Object.keys(settingsObj).length > 0 ? JSON.stringify(settingsObj) : "undefined";

  // ── Build the module code ──────────────────────────────────────────────────
  let code = "";
  code += `var _BASE = ${JSON.stringify(base)};\n`;
  code += `var _token = null;\n\n`;

  // ── Token generation ───────────────────────────────────────────────────────
  if (cfg.tokenMode === "generate") {
    code += `// Eager pre-fetch: fires the moment 8SPINE loads this module.\n`;
    code += `var _tokenPromise = fetch(_BASE + '/generate', {\n`;
    code += `  method: 'POST',\n`;
    code += `  headers: { 'Content-Type': 'application/json' },\n`;
    code += `  body: JSON.stringify({})\n`;
    code += `}).then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })\n`;
    code += `  .then(function(d) { _token = d.token || null; return _token; })\n`;
    code += `  .catch(function() { return null; });\n\n`;
    code += `function _ensureToken(context) {\n`;
    code += `  if (context && context.settings && context.settings.customToken && context.settings.customToken.value) {\n`;
    code += `    return Promise.resolve(context.settings.customToken.value.trim());\n`;
    code += `  }\n`;
    code += `  if (_token) return Promise.resolve(_token);\n`;
    code += `  return _tokenPromise;\n`;
    code += `}\n\n`;
  } else if (cfg.tokenMode === "hardcoded") {
    code += `_token = ${JSON.stringify(cfg.hardcodedHash)};\n`;
    code += `function _ensureToken(context) {\n`;
    code += `  if (context && context.settings && context.settings.customToken && context.settings.customToken.value) {\n`;
    code += `    return Promise.resolve(context.settings.customToken.value.trim());\n`;
    code += `  }\n`;
    code += `  return Promise.resolve(_token);\n`;
    code += `}\n\n`;
  } else {
    code += `function _ensureToken(context) { return Promise.resolve(null); }\n\n`;
  }

  // ── API path builder ───────────────────────────────────────────────────────
  if (cfg.pathStyle === "u") {
    code += `function _apiPath(token, path) {\n`;
    code += `  return _BASE + '/u/' + token + path;\n`;
    code += `}\n\n`;
  } else if (cfg.pathStyle === "root") {
    code += `function _apiPath(token, path) {\n`;
    code += `  return _BASE + '/' + token + path;\n`;
    code += `}\n\n`;
  } else {
    code += `function _apiPath(token, path) {\n`;
    code += `  return _BASE + path;\n`;
    code += `}\n\n`;
  }

  // ── Fetch helper ───────────────────────────────────────────────────────────
  code += `function _fetch(url) {\n`;
  code += `  return fetch(url, { headers: { 'Accept': 'application/json' } })\n`;
  code += `    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });\n`;
  code += `}\n\n`;

  // ── searchTracks ───────────────────────────────────────────────────────────
  const needsTokenInId = cfg.tokenMode === "generate";
  code += `async function searchTracks(query, limit, context) {\n`;
  code += `  var lim = limit || 20;\n`;
  code += `  var token = await _ensureToken(context);\n`;
  if (cfg.tokenMode === "generate") {
    code += `  if (!token) return { tracks: [], total: 0 };\n`;
  }
  code += `  try {\n`;
  code += `    var url = _apiPath(token, '/search') + '?q=' + encodeURIComponent(query) + '&limit=' + lim;\n`;
  code += `    var data = await _fetch(url);\n`;
  code += `    var raw = data.tracks || (Array.isArray(data) ? data : []);\n`;
  code += `    var tracks = raw.map(function(t) {\n`;
  code += `      return {\n`;
  if (needsTokenInId) {
    code += `        id: token + '__' + t.id,\n`;
  } else {
    code += `        id: String(t.id),\n`;
  }
  code += `        title: t.title || 'Unknown',\n`;
  code += `        artist: t.artist || 'Unknown Artist',\n`;
  code += `        album: t.album || '',\n`;
  code += `        duration: t.duration || 0,\n`;
  code += `        albumCover: t.artworkURL || ''\n`;
  code += `      };\n`;
  code += `    });\n`;
  code += `    return { tracks: tracks, total: tracks.length };\n`;
  code += `  } catch(e) {\n`;
  code += `    console.error('[Eclipse/${slug}] Search error:', e.message);\n`;
  code += `    return { tracks: [], total: 0 };\n`;
  code += `  }\n`;
  code += `}\n\n`;

  // ── getTrackStreamUrl ──────────────────────────────────────────────────────
  code += `async function getTrackStreamUrl(trackId, quality, context) {\n`;
  if (needsTokenInId) {
    code += `  var sep = trackId.indexOf('__');\n`;
    code += `  if (sep === -1) return { streamUrl: null, track: { id: trackId, audioQuality: 'HIGH' } };\n`;
    code += `  var token = trackId.slice(0, sep);\n`;
    code += `  var realId = trackId.slice(sep + 2);\n`;
  } else {
    code += `  var token = await _ensureToken(context);\n`;
    code += `  var realId = trackId;\n`;
  }
  code += `  try {\n`;
  code += `    var url = _apiPath(token, '/stream/' + encodeURIComponent(realId));\n`;
  code += `    var data = await _fetch(url);\n`;
  code += `    var streamUrl = data.url || data.streamUrl || data.streamURL || data.stream_url || null;\n`;
  code += `    if (!streamUrl) throw new Error('No stream URL returned');\n`;
  code += `    var aq = /flac|lossless|hires/i.test(data.format || data.quality || '') ? 'LOSSLESS' : (quality || 'HIGH');\n`;
  code += `    return { streamUrl: streamUrl, track: { id: trackId, audioQuality: aq } };\n`;
  code += `  } catch(e) {\n`;
  code += `    console.error('[Eclipse/${slug}] Stream error:', e.message);\n`;
  code += `    return { streamUrl: null, track: { id: trackId, audioQuality: 'HIGH' } };\n`;
  code += `  }\n`;
  code += `}\n\n`;

  // ── getAlbum ───────────────────────────────────────────────────────────────
  code += `async function getAlbum(albumId, context) {\n`;
  if (needsTokenInId) {
    code += `  var sep = albumId.indexOf('__');\n`;
    code += `  var token = sep !== -1 ? albumId.slice(0, sep) : (await _ensureToken(context));\n`;
    code += `  var realId = sep !== -1 ? albumId.slice(sep + 2) : albumId;\n`;
  } else {
    code += `  var token = await _ensureToken(context);\n`;
    code += `  var realId = albumId;\n`;
  }
  code += `  try {\n`;
  code += `    var url = _apiPath(token, '/album/' + encodeURIComponent(realId));\n`;
  code += `    var data = await _fetch(url);\n`;
  code += `    var tracks = (data.tracks || []).map(function(t) {\n`;
  code += `      return {\n`;
  if (needsTokenInId) {
    code += `        id: token + '__' + t.id,\n`;
  } else {
    code += `        id: String(t.id),\n`;
  }
  code += `        title: t.title || 'Unknown',\n`;
  code += `        artist: t.artist || data.artist || 'Unknown',\n`;
  code += `        album: data.title || '',\n`;
  code += `        duration: t.duration || 0,\n`;
  code += `        albumCover: t.artworkURL || data.artworkURL || ''\n`;
  code += `      };\n`;
  code += `    });\n`;
  code += `    return {\n`;
  code += `      album: { id: albumId, title: data.title || 'Unknown', artist: data.artist || 'Unknown', cover: data.artworkURL || '' },\n`;
  code += `      tracks: tracks\n`;
  code += `    };\n`;
  code += `  } catch(e) { return { album: null, tracks: [] }; }\n`;
  code += `}\n\n`;

  // ── getArtist ──────────────────────────────────────────────────────────────
  code += `async function getArtist(artistId, context) {\n`;
  if (needsTokenInId) {
    code += `  var sep = artistId.indexOf('__');\n`;
    code += `  var token = sep !== -1 ? artistId.slice(0, sep) : (await _ensureToken(context));\n`;
    code += `  var realId = sep !== -1 ? artistId.slice(sep + 2) : artistId;\n`;
  } else {
    code += `  var token = await _ensureToken(context);\n`;
    code += `  var realId = artistId;\n`;
  }
  code += `  try {\n`;
  code += `    var url = _apiPath(token, '/artist/' + encodeURIComponent(realId));\n`;
  code += `    var data = await _fetch(url);\n`;
  code += `    var topTracks = (data.topTracks || []).map(function(t) {\n`;
  code += `      return {\n`;
  if (needsTokenInId) {
    code += `        id: token + '__' + t.id,\n`;
  } else {
    code += `        id: String(t.id),\n`;
  }
  code += `        title: t.title || 'Unknown',\n`;
  code += `        artist: t.artist || data.name || 'Unknown',\n`;
  code += `        album: '',\n`;
  code += `        duration: t.duration || 0,\n`;
  code += `        albumCover: t.artworkURL || data.artworkURL || ''\n`;
  code += `      };\n`;
  code += `    });\n`;
  code += `    return {\n`;
  code += `      artist: { id: artistId, name: data.name || 'Unknown', cover: data.artworkURL || '' },\n`;
  code += `      tracks: topTracks,\n`;
  code += `      albums: (data.albums || []).map(function(a) {\n`;
  code += `        return { id: ` + (needsTokenInId ? `token + '__' + a.id` : `String(a.id)`) + `, title: a.title || 'Unknown', artist: a.artist || data.name || '', albumCover: a.artworkURL || '' };\n`;
  code += `      })\n`;
  code += `    };\n`;
  code += `  } catch(e) { return { artist: null, tracks: [], albums: [] }; }\n`;
  code += `}\n\n`;

  // ── Module return ──────────────────────────────────────────────────────────
  code += `return {\n`;
  code += `  id: ${JSON.stringify(slug)},\n`;
  code += `  name: ${JSON.stringify(name)},\n`;
  code += `  version: ${JSON.stringify(ver)},\n`;
  code += `  labels: ${labels},\n`;
  if (cfg.settings) {
    code += `  settings: ${settingsBlock},\n`;
  }
  code += `  searchTracks: searchTracks,\n`;
  code += `  getTrackStreamUrl: getTrackStreamUrl,\n`;
  code += `  getAlbum: getAlbum,\n`;
  code += `  getArtist: getArtist\n`;
  code += `};\n`;

  return code;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");

  const file = (req.query.file || "").replace(/\.js$/, "").replace(/\.8spine$/, "");
  if (!file) return res.status(400).send("// Missing file param");

  try {
    const upstream = await fetch(ECLIPSE_REGISTRY);
    if (!upstream.ok) throw new Error("Registry " + upstream.status);
    const data = await upstream.json();
    const addons = data.addons || [];
    const addon = addons.find((a) => slugify(a.id) === file);

    if (!addon) return res.status(404).send("// Not found: " + file);

    const cfg = ADDON_CONFIG[addon.id];
    if (cfg && cfg.skip) return res.status(404).send("// Addon not available: " + file);

    if (!addon.setupUrl && !addon.manifestUrl) return res.status(404).send("// No endpoint for: " + file);

    res.status(200).send(generateModuleCode(addon));
  } catch (err) {
    res.status(500).send("// Error: " + err.message);
  }
}
