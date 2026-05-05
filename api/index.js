const ECLIPSE_REGISTRY = "https://eclipsemusic.app/addonstore/registry.json";

const ADDON_META = {
  "com.eclipse.community.allinone":    { tags: ["LOSSLESS", "MULTI-SOURCE", "FREE"],  featured: true  },
  "com.eclipse.community.ytmusic":     { tags: ["YT MUSIC", "HIGH QUALITY", "FREE"], featured: false },
  "com.eclipse.community.deezertidal": { tags: ["LOSSLESS", "FLAC", "TIDAL"],        featured: false },
  "com.eclipse.community.soundcloud":  { tags: ["SOUNDCLOUD", "MP3", "FREE"],        featured: false },
  "com.eclipse.community.monochrome":  { tags: ["LOSSLESS", "TIDAL", "QOBUZ"],       featured: false },
  "com.eclipse.community.spotiflac":   { tags: ["LOSSLESS", "FLAC", "HIFI"],         featured: false },
  "com.eclipse.community.radio":       { tags: ["RADIO", "LIVE", "FREE"],            featured: false },
  "cx.artistgrid.eclipse.unreleased":  { tags: ["UNRELEASED", "CATALOG"],            featured: false },
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
    const data   = await upstream.json();
    const addons = (data.addons || []).filter(a => a.setupUrl || a.manifestUrl);

    const modules = addons.map(function(addon) {
      const slug = slugify(addon.id);
      const meta = ADDON_META[addon.id] || { tags: ["STREAM"], featured: false };
      return {
        id:          slug,
        name:        addon.name.toUpperCase(),
        pkg:         addon.id + ".8spine",
        file:        slug + ".8spine",
        download:    "modules/" + slug + ".8spine",
        version:     "v" + (addon.version || "1.0.0"),
        code:        100,
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
        sources: [{ name: addon.name.toUpperCase(), lang: "all", id: slug, baseUrl: "." }]
      };
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
