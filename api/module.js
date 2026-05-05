const ECLIPSE_REGISTRY = "https://eclipsemusic.app/addonstore/registry.json";

/*
 * Per-addon config.  configPrefix is the path segment injected between the
 * addon's base URL and the Eclipse REST endpoint (/search, /stream).
 */
const ADDON_CONFIG = {
  "com.eclipse.community.allinone":    { configPrefix: "" },
  "com.eclipse.community.soundcloud":  { configPrefix: "/u/4080d93d822503c44b444a425c94" },
  "com.eclipse.community.monochrome":  { configPrefix: "/u/4080d93d822503c44b444a425c94" },
  "com.eclipse.community.deezertidal": { configPrefix: "" },
  "com.eclipse.community.spotiflac":   { configPrefix: "/821d442866587433" },
  "com.eclipse.community.radio":       { configPrefix: "/u/5474abb944e560d5db19366fe650" },
  "cx.artistgrid.eclipse.unreleased":  { configPrefix: "" },
  "com.eclipse.community.ytmusic":     { skip: true },
};

function slugify(id) {
  return id
    .replace(/^com\.eclipse\.community\./, "eclipse-")
    .replace(/^cx\.artistgrid\.eclipse\./, "eclipse-artistgrid-")
    .replace(/\./g, "-");
}

function generateCode(addon) {
  const rawBase = (addon.setupUrl || addon.manifestUrl || "").replace(/\/$/, "");
  const cfg = ADDON_CONFIG[addon.id] || { configPrefix: "" };
  const configPrefix = cfg.configPrefix || "";

  // For manifestUrl-based addons (ArtistGrid), strip /manifest.json
  let base = rawBase;
  if (addon.manifestUrl && !addon.setupUrl) {
    base = addon.manifestUrl.replace(/\/manifest\.json$/, "");
  }

  // The final API base = base + configPrefix
  const apiBase = base + configPrefix;

  const slug = slugify(addon.id);
  const varName = "M_" + slug.replace(/-/g, "_").toUpperCase();
  const name = addon.name.toUpperCase();
  const ver = addon.version || "1.0.0";
  const id = addon.id;
  const constName = slug.replace(/-/g, "_").toUpperCase() + "_MODULE_CODE";

  const innerCode = `var BASE=${JSON.stringify(apiBase)};

async function fetchJson(url) {
  var r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

var ${varName} = {
  id: ${JSON.stringify(id)},
  name: ${JSON.stringify(name)},
  version: ${JSON.stringify(ver)},
  labels: ["ECLIPSE", "STREAM"],

  searchTracks: async function(query, limit) {
    try {
      var url = BASE + "/search?q=" + encodeURIComponent(query) + "&limit=" + (limit || 20);
      var d = await fetchJson(url);
      var raw = d.tracks || [];
      return {
        tracks: raw.map(function(item) {
          return {
            id: String(item.id),
            title: item.title || "Unknown",
            artist: item.artist || "Unknown Artist",
            album: item.album || "",
            duration: item.duration || 0,
            albumCover: item.artworkURL || ""
          };
        }),
        total: raw.length
      };
    } catch(e) {
      console.error("[Eclipse/${slug}] Search error:", e.message);
      return { tracks: [], total: 0 };
    }
  },

  getTrackStreamUrl: async function(id, quality) {
    var url = BASE + "/stream/" + encodeURIComponent(id);
    var d = await fetchJson(url);
    if (!d.url) throw new Error("No stream URL returned");
    var q = /flac|lossless|hires/i.test(d.format || d.quality || d.url) ? "LOSSLESS" : (quality || "HIGH");
    return {
      streamUrl: d.url,
      track: { id: id, audioQuality: q }
    };
  },

  getAlbum: async function(id) {
    try {
      var url = BASE + "/album/" + encodeURIComponent(id);
      var d = await fetchJson(url);
      var tracks = (d.tracks || []).map(function(item) {
        return {
          id: String(item.id),
          title: item.title || "Unknown",
          artist: item.artist || "Unknown Artist",
          album: item.album || "",
          duration: item.duration || 0,
          albumCover: item.artworkURL || ""
        };
      });
      return { album: d.album || {}, tracks: tracks };
    } catch(e) {
      return { album: {}, tracks: [] };
    }
  },

  getArtist: async function(id) {
    try {
      var url = BASE + "/artist/" + encodeURIComponent(id);
      var d = await fetchJson(url);
      var tracks = (d.tracks || []).map(function(item) {
        return {
          id: String(item.id),
          title: item.title || "Unknown",
          artist: item.artist || "Unknown Artist",
          album: item.album || "",
          duration: item.duration || 0,
          albumCover: item.artworkURL || ""
        };
      });
      return { artist: d.artist || {}, tracks: tracks };
    } catch(e) {
      return { artist: {}, tracks: [] };
    }
  }
};
return ${varName};`;

  // Wrap in export const for 8spine module format
  return "export const " + constName + " = `" + innerCode.replace(/`/g, "\\`") + "`;";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  const file = (req.query.file || "").replace(/\.8spine$/, "");
  if (!file) return res.status(400).send("// Missing file param");

  try {
    const upstream = await fetch(ECLIPSE_REGISTRY);
    if (!upstream.ok) throw new Error("Registry " + upstream.status);
    const data = await upstream.json();
    const addons = data.addons || [];
    const addon = addons.find(a => slugify(a.id) === file);

    if (!addon) return res.status(404).send("// Not found: " + file);

    const cfg = ADDON_CONFIG[addon.id];
    if (cfg && cfg.skip)
      return res.status(404).send("// Addon requires user auth: " + file);

    if (!addon.setupUrl && !addon.manifestUrl)
      return res.status(404).send("// No endpoint for: " + file);

    res.status(200).send(generateCode(addon));
  } catch (err) {
    res.status(500).send("// Error: " + err.message);
  }
}
