// /api/index.js
// Fetches the Eclipse addon registry live and converts it to 8SPINE's
// index.json format (category:modules structure) on every request.

const ECLIPSE_REGISTRY = "https://eclipsemusic.app/addonstore/registry.json";

// Maps Eclipse addon IDs to quality tags for 8SPINE UI
const ADDON_META = {
  "com.eclipse.community.allinone":    { tags: ["LOSSLESS", "MULTI-SOURCE", "FREE"],    featured: true  },
  "com.eclipse.community.ytmusic":     { tags: ["YT MUSIC", "HIGH QUALITY", "FREE"],    featured: false },
  "com.eclipse.community.deezertidal": { tags: ["LOSSLESS", "FLAC", "TIDAL"],           featured: false },
  "com.eclipse.community.soundcloud":  { tags: ["SOUNDCLOUD", "MP3", "FREE"],           featured: false },
  "com.eclipse.community.monochrome":  { tags: ["LOSSLESS", "TIDAL", "QOBUZ"],          featured: false },
  "com.eclipse.community.spotiflac":   { tags: ["LOSSLESS", "FLAC", "HIFI"],            featured: false },
  "com.eclipse.community.radio":       { tags: ["RADIO", "LIVE", "FREE"],               featured: false },
  "cx.artistgrid.eclipse.unreleased":  { tags: ["UNRELEASED", "CATALOG"],               featured: false },
};

function slugify(id) {
  // "com.eclipse.community.allinone" → "eclipse-allinone"
  return id
    .replace(/^com\.eclipse\.community\./, "eclipse-")
    .replace(/^cx\.artistgrid\.eclipse\./, "eclipse-artistgrid-")
    .replace(/\./g, "-");
}

function addonToModule(addon, baseUrl) {
  const slug = slugify(addon.id);
  const meta = ADDON_META[addon.id] || { tags: ["STREAM"], featured: false };
  const setupBase = (addon.setupUrl || addon.manifestUrl || "").replace(/\/$/, "");

  return {
    id:          slug,
    name:        addon.name.toUpperCase(),
    pkg:         addon.id + ".8spine",
    file:        slug + ".8spine",
    download:    "modules/" + slug + ".8spine",
    version:     "v" + (addon.version || "1.0.0"),
    code:        parseInt((addon.version || "1.0.0").replace(/\./g, "")) || 100,
    type:        "STREAM",
    author:      addon.author || "Eclipse Community",
    description: addon.description || ("STREAM VIA ECLIPSE · " + addon.name.toUpperCase()),
    tags:        meta.tags,
    featured:    meta.featured,
    trusted:     true,
    nsfw:        false,
    size:        2800,
    lang:        "all",
    folder:      "modules",
    _setupBase:  setupBase,   // used by /api/module to generate the .8spine
    sources: [{
      name:    addon.name.toUpperCase(),
      lang:    "all",
      id:      slug,
      baseUrl: "."
    }]
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  try {
    const upstream = await fetch(ECLIPSE_REGISTRY);
    if (!upstream.ok) throw new Error("Eclipse registry returned " + upstream.status);
    const data = await upstream.json();
    const addons = data.addons || [];

    const baseUrl = "https://" + req.headers.host;
    const modules = addons
      .filter(a => a.setupUrl || a.manifestUrl)  // skip addons with no endpoint
      .map(a => {
        const mod = addonToModule(a, baseUrl);
        delete mod._setupBase;  // don't expose internal field in index
        return mod;
      });

    res.status(200).json({
      "category:modules":        modules,
      "category:debrid_modules": [],
      "category:artworks":       [],
      "category:testing":        []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
