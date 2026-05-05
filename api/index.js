const ECLIPSE_REGISTRY = "https://eclipsemusic.app/addonstore/registry.json";

/*
 * Addon-specific overrides.
 *
 * configPrefix – path segment(s) injected between the base URL and the
 *                Eclipse REST route (/search, /stream).
 *                Addons built on the "cyrusna29" workers typically need
 *                "/u/{hash}", while SpotiFLAC uses "/{hash}" directly.
 *                Set to "" when the addon works without any config.
 *
 * skip         – true to exclude the addon entirely (e.g. needs user auth).
 */
const ADDON_META = {
  "com.eclipse.community.allinone": {
    tags: ["LOSSLESS", "MULTI-SOURCE", "FREE"],
    featured: true,
    configPrefix: "",
    type: "MODULE",
  },
  "com.eclipse.community.soundcloud": {
    tags: ["SOUNDCLOUD", "MP3", "FREE"],
    featured: false,
    configPrefix: "/u/4080d93d822503c44b444a425c94",
    type: "MODULE",
  },
  "com.eclipse.community.monochrome": {
    tags: ["LOSSLESS", "TIDAL", "QOBUZ"],
    featured: false,
    configPrefix: "/u/4080d93d822503c44b444a425c94",
    type: "MODULE",
  },
  "com.eclipse.community.deezertidal": {
    tags: ["LOSSLESS", "FLAC", "TIDAL"],
    featured: false,
    configPrefix: "",
    type: "MODULE",
  },
  "com.eclipse.community.spotiflac": {
    tags: ["LOSSLESS", "FLAC", "HIFI"],
    featured: false,
    configPrefix: "/821d442866587433",
    type: "MODULE",
  },
  "com.eclipse.community.radio": {
    tags: ["RADIO", "LIVE", "FREE"],
    featured: false,
    configPrefix: "/u/5474abb944e560d5db19366fe650",
    type: "MODULE",
  },
  "cx.artistgrid.eclipse.unreleased": {
    tags: ["UNRELEASED", "CATALOG"],
    featured: false,
    configPrefix: "",
    type: "MODULE",
  },
  // YTMusic requires Google auth token – cannot work without user setup
  "com.eclipse.community.ytmusic": {
    skip: true,
  },
};

function slugify(id) {
  return id
    .replace(/^com\.eclipse\.community\./, "eclipse-")
    .replace(/^cx\.artistgrid\.eclipse\./, "eclipse-artistgrid-")
    .replace(/\./g, "-");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Content-Type", "application/json");

  try {
    const upstream = await fetch(ECLIPSE_REGISTRY);
    if (!upstream.ok) throw new Error("Eclipse registry returned " + upstream.status);
    const data = await upstream.json();
    const addons = (data.addons || []).filter(a => {
      if (!a.setupUrl && !a.manifestUrl) return false;
      const meta = ADDON_META[a.id];
      if (meta && meta.skip) return false;
      return true;
    });

    const modules = addons.map(function (addon) {
      const slug = slugify(addon.id);
      const meta = ADDON_META[addon.id] || { tags: ["STREAM"], featured: false, configPrefix: "", type: "MODULE" };
      return {
        id: slug,
        name: addon.name.toUpperCase(),
        pkg: addon.id,
        file: slug + ".8spine",
        download: "modules/" + slug + ".8spine",
        version: "v" + (addon.version || "1.0.0"),
        code: parseInt((addon.version || "1.0.0").replace(/\./g, ""), 10) || 100,
        type: meta.type || "MODULE",
        author: addon.author || "Eclipse Community",
        description: (addon.description || ("STREAM VIA ECLIPSE · " + addon.name)).toUpperCase(),
        tags: meta.tags || ["STREAM"],
        featured: meta.featured || false,
        trusted: true,
        nsfw: false,
        size: 2800,
        lang: "all",
        folder: "modules",
        sources: [{ name: addon.name.toUpperCase(), lang: "all", id: slug, baseUrl: "." }],
      };
    });

    res.status(200).json({
      "category:modules": modules,
      "category:debrid_modules": [],
      "category:artworks": [],
      "category:testing": [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
