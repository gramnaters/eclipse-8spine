/**
 * /index.json – 8SPINE Source JSON
 *
 * Serves the Eclipse addon catalog in the 8SPINE "source" format.
 * Each module entry points to /modules/{slug}.js which returns
 * self-configuring module code that handles its own token generation.
 */

const ECLIPSE_REGISTRY = "https://eclipsemusic.app/addonstore/registry.json";

const ADDON_META = {
  "com.eclipse.community.allinone": {
    tags: ["LOSSLESS", "MULTI-SOURCE", "FREE"],
    featured: true,
    description: "Multi-source: HiFi FLAC, SoundCloud, Internet Archive, Podcasts, Audiobooks, and Live Radio.",
  },
  "com.eclipse.community.soundcloud": {
    tags: ["SOUNDCLOUD", "MP3", "FREE"],
    featured: false,
    description: "Search and stream tracks from SoundCloud via HiFi proxy.",
  },
  "com.eclipse.community.monochrome": {
    tags: ["LOSSLESS", "TIDAL", "QOBUZ"],
    featured: false,
    description: "TIDAL full catalog search + Qobuz Hi-Res 24-bit streams. No account required.",
  },
  "com.eclipse.community.deezertidal": {
    tags: ["LOSSLESS", "FLAC", "TIDAL"],
    featured: false,
    description: "Deezer search + TIDAL FLAC streaming via Claudochrome.",
  },
  "com.eclipse.community.spotiflac": {
    tags: ["LOSSLESS", "FLAC", "HIFI"],
    featured: false,
    description: "Qobuz FLAC streaming with Spotify-style search.",
  },
  "com.eclipse.community.radio": {
    tags: ["RADIO", "LIVE", "FREE"],
    featured: false,
    description: "Listen to live radio stations from around the world.",
  },
  "cx.artistgrid.eclipse.unreleased": {
    tags: ["UNRELEASED", "CATALOG"],
    featured: false,
    description: "Streams unreleased tracks and era catalogs from ArtistGrid.",
  },
  // YTMusic requires Google auth — skip
  "com.eclipse.community.ytmusic": { skip: true },
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
    const addons = (data.addons || []).filter((a) => {
      if (!a.setupUrl && !a.manifestUrl) return false;
      const meta = ADDON_META[a.id];
      if (meta && meta.skip) return false;
      return true;
    });

    // Determine our own origin for download URLs
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const origin = proto + "://" + host;

    const modules = addons.map(function (addon) {
      const slug = slugify(addon.id);
      const meta = ADDON_META[addon.id] || { tags: ["STREAM"], featured: false };
      return {
        id: slug,
        name: addon.name,
        author: addon.author || "Eclipse Community",
        version: addon.version || "1.0.0",
        description: (meta.description || addon.description || "Stream via Eclipse · " + addon.name).toUpperCase(),
        labels: meta.tags || ["STREAM"],
        download: origin + "/modules/" + slug + ".js",
      };
    });

    res.status(200).json({
      "category:music": modules,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
