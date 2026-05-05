const ECLIPSE_REGISTRY = "https://eclipsemusic.app/addonstore/registry.json";

function slugify(id) {
  return id
    .replace(/^com\.eclipse\.community\./, "eclipse-")
    .replace(/^cx\.artistgrid\.eclipse\./, "eclipse-artistgrid-")
    .replace(/\./g, "-");
}

function generateCode(addon) {
  const base    = (addon.setupUrl || addon.manifestUrl || "").replace(/\/$/, "");
  const slug    = slugify(addon.id);
  const varName = "M_" + slug.replace(/-/g, "_").toUpperCase();
  const name    = addon.name.toUpperCase();
  const ver     = addon.version || "1.0.0";
  const id      = addon.id + ".8spine";

  // !! No async/await — 8SPINE sandbox uses new Function() which forbids it.
  // All methods use Promise .then() chains only.
  return `var BASE=${JSON.stringify(base)};
var ${varName}={
  id:${JSON.stringify(id)},
  name:${JSON.stringify(name)},
  version:${JSON.stringify(ver)},
  labels:["ECLIPSE","STREAM"],
  _m:function(item){
    return {
      id:JSON.stringify({nid:String(item.id||item.videoId||item.trackId||""),url:item.streamURL||item.url||null}),
      title:item.title||item.name||"Unknown",
      artist:item.artist||item.artists||item.uploader||"Unknown Artist",
      album:item.album||item.albumName||"",
      duration:item.duration||0,
      albumCover:item.artworkURL||item.artwork||item.thumbnail||""
    };
  },
  searchTracks:function(query,limit){
    var self=this;
    return fetch(BASE+"/search?q="+encodeURIComponent(query)+"&limit="+(limit||20),{headers:{Accept:"application/json"}})
    .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
    .then(function(d){
      var raw=d.tracks||d.results||(Array.isArray(d)?d:[]);
      return {tracks:raw.map(function(i){return self._m(i);}),total:raw.length};
    })
    .catch(function(){return {tracks:[],total:0};});
  },
  getTrackStreamUrl:function(id,quality){
    var p,nid,cu;
    try{p=JSON.parse(id);nid=p.nid;cu=p.url;}catch(e){nid=id;cu=null;}
    if(cu){
      var q=/flac|lossless|hires/i.test(cu)?"LOSSLESS":(quality||"HIGH");
      return Promise.resolve({streamUrl:cu,track:{id:id,audioQuality:q}});
    }
    return fetch(BASE+"/stream/"+encodeURIComponent(nid),{headers:{Accept:"application/json"}})
    .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
    .then(function(d){
      var url=d.streamURL||d.url||d.stream;
      if(!url)throw new Error("No URL");
      var q=/flac|lossless|hires/i.test(url)?"LOSSLESS":(quality||"HIGH");
      return {streamUrl:url,track:{id:id,audioQuality:q}};
    });
  },
  getAlbum:function(id){
    var self=this;
    return fetch(BASE+"/album/"+encodeURIComponent(id),{headers:{Accept:"application/json"}})
    .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
    .then(function(d){
      return {
        album:{id:d.id||id,title:d.title||d.name||"",artist:d.artist||"",cover:d.artworkURL||d.artwork||"",year:d.year||""},
        tracks:(d.tracks||d.songs||[]).map(function(i){return self._m(i);})
      };
    })
    .catch(function(){return {album:{},tracks:[]};});
  },
  getArtist:function(id){
    var self=this;
    return fetch(BASE+"/artist/"+encodeURIComponent(id),{headers:{Accept:"application/json"}})
    .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
    .then(function(d){
      return {
        artist:{id:d.id||id,name:d.name||"",description:d.bio||d.description||"",image:d.artworkURL||d.image||""},
        tracks:(d.tracks||d.topTracks||d.songs||[]).map(function(i){return self._m(i);})
      };
    })
    .catch(function(){return {artist:{},tracks:[]};});
  }
};
return ${varName};`;
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
    const data   = await upstream.json();
    const addons = data.addons || [];
    const addon  = addons.find(a => slugify(a.id) === file);

    if (!addon)               return res.status(404).send("// Not found: " + file);
    if (!addon.setupUrl && !addon.manifestUrl)
                              return res.status(404).send("// No endpoint for: " + file);

    res.status(200).send(generateCode(addon));
  } catch (err) {
    res.status(500).send("// Error: " + err.message);
  }
}
