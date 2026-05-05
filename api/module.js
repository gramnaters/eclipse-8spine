// /api/module.js
// Called as GET /modules/{slug}.8spine
// Looks up the slug in the live Eclipse registry, finds the addon's setupUrl,
// and generates a valid 8SPINE module (no async/await — Promise chains only,
// because 8SPINE's sandbox runs via `new Function()` which forbids async).

const ECLIPSE_REGISTRY = "https://eclipsemusic.app/addonstore/registry.json";

function slugify(id) {
  return id
    .replace(/^com\.eclipse\.community\./, "eclipse-")
    .replace(/^cx\.artistgrid\.eclipse\./, "eclipse-artistgrid-")
    .replace(/\./g, "-");
}

function generateModuleCode(addon) {
  const slug      = slugify(addon.id);
  const base      = (addon.setupUrl || addon.manifestUrl || "").replace(/\/$/, "");
  const name      = addon.name.toUpperCase();
  const version   = addon.version || "1.0.0";
  const varName   = "ECLIPSE_" + slug.replace(/-/g, "_").toUpperCase();

  // IMPORTANT: No async/await — 8SPINE's new Function() sandbox does not
  // support them. All network calls use fetch().then() chains.
  return `
var BASE = ${JSON.stringify(base)};

var ${varName} = {
  id: ${JSON.stringify(addon.id + ".8spine")},
  name: ${JSON.stringify(name)},
  version: ${JSON.stringify(version)},
  labels: ["ECLIPSE", "STREAM"],

  _mapTrack: function(item) {
    return {
      id: JSON.stringify({ nid: String(item.id || item.videoId || item.trackId || ""), url: item.streamURL || item.url || null }),
      title:      item.title      || item.name      || "Unknown",
      artist:     item.artist     || item.artists   || item.uploader || "Unknown Artist",
      album:      item.album      || item.albumName  || "",
      duration:   item.duration   || 0,
      albumCover: item.artworkURL || item.artwork    || item.thumbnail || ""
    };
  },

  searchTracks: function(query, limit) {
    var self = this;
    return fetch(BASE + "/search?q=" + encodeURIComponent(query) + "&limit=" + (limit || 20), {
      headers: { Accept: "application/json" }
    })
    .then(function(res) {
      if (!res.ok) throw new Error("Search failed: " + res.status);
      return res.json();
    })
    .then(function(data) {
      var raw = data.tracks || data.results || (Array.isArray(data) ? data : []);
      var tracks = raw.map(function(item) { return self._mapTrack(item); });
      return { tracks: tracks, total: tracks.length };
    })
    .catch(function(e) {
      console.error("[${name}] search error:", e.message);
      return { tracks: [], total: 0 };
    });
  },

  getTrackStreamUrl: function(id, quality) {
    var parsed, nid, cachedUrl;
    try {
      parsed    = JSON.parse(id);
      nid       = parsed.nid;
      cachedUrl = parsed.url;
    } catch(e) {
      nid       = id;
      cachedUrl = null;
    }

    if (cachedUrl) {
      var q = /flac|lossless|hires/i.test(cachedUrl) ? "LOSSLESS" : (quality || "HIGH");
      return Promise.resolve({ streamUrl: cachedUrl, track: { id: id, audioQuality: q } });
    }

    return fetch(BASE + "/stream/" + encodeURIComponent(nid), {
      headers: { Accept: "application/json" }
    })
    .then(function(res) {
      if (!res.ok) throw new Error("Stream failed: " + res.status);
      return res.json();
    })
    .then(function(data) {
      var url = data.streamURL || data.url || data.stream || null;
      if (!url) throw new Error("No stream URL in response");
      var q = /flac|lossless|hires/i.test(url) ? "LOSSLESS" : (quality || "HIGH");
      return { streamUrl: url, track: { id: id, audioQuality: q } };
    });
  },

  getAlbum: function(id) {
    var self = this;
    return fetch(BASE + "/album/" + encodeURIComponent(id), {
      headers: { Accept: "application/json" }
    })
    .then(function(res) {
      if (!res.ok) throw new Error("Album failed: " + res.status);
      return res.json();
    })
    .then(function(data) {
      var raw = data.tracks || data.songs || [];
      return {
        album: {
          id:     data.id    || id,
          title:  data.title || data.name || "",
          artist: data.artist || "",
          cover:  data.artworkURL || data.artwork || "",
          year:   data.year || ""
        },
        tracks: raw.map(function(item) { return self._mapTrack(item); })
      };
    })
    .catch(function() { return { album: {}, tracks: [] }; });
  },

  getArtist: function(id) {
    var self = this;
    return fetch(BASE + "/artist/" + encodeURIComponent(id), {
      headers: { Accept: "application/json" }
    })
    .then(function(res) {
      if (!res.ok) throw new Error("Artist failed: " + res.status);
      return res.json();
    })
    .then(function(data) {
      var raw = data.tracks || data.topTracks || data.songs || [];
      return {
        artist: {
          id:          data.id   || id,
          name:        data.name || "",
          description: data.bio  || data.description || "",
          image:       data.artworkURL || data.image || ""
        },
        tracks: raw.map(function(item) { return self._mapTrack(item); })
      };
    })
    .catch(function() { return { artist: {}, tracks: [] }; });
  }
};

return ${varName};
`.trim();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  const file = req.query.file || "";           // e.g. "eclipse-allinone.8spine"
  const slug = file.replace(/\.8spine$/, "");  // e.g. "eclipse-allinone"

  if (!slug) {
    return res.status(400).send("// Missing file parameter");
  }

  try {
    // Fetch live registry to find the addon that matches this slug
    const upstream = await fetch(ECLIPSE_REGISTRY);
    if (!upstream.ok) throw new Error("Eclipse registry returned " + upstream.status);
    const data   = await upstream.json();
    const addons = data.addons || [];

    function slugify(id) {
      return id
        .replace(/^com\.eclipse\.community\./, "eclipse-")
        .replace(/^cx\.artistgrid\.eclipse\./, "eclipse-artistgrid-")
        .replace(/\./g, "-");
    }

    const addon = addons.find(a => slugify(a.id) === slug);
    if (!addon) {
      return res.status(404).send("// Addon not found for slug: " + slug);
    }
    if (!addon.setupUrl && !addon.manifestUrl) {
      return res.status(404).send("// Addon has no setupUrl");
    }

    const code = generateModuleCode(addon);
    res.status(200).send(code);
  } catch (err) {
    res.status(500).send("// Error: " + err.message);
  }
}
