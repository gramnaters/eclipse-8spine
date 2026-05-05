const ECLIPSE_REGISTRY = "https://eclipsemusic.app/addonstore/registry.json";

function slugify(id) {
  return id
    .replace(/^com\.eclipse\.community\./, "eclipse-")
    .replace(/^cx\.artistgrid\.eclipse\./, "eclipse-artistgrid-")
    .replace(/\./g, "-");
}

function generateCode(addon) {
  const base = (addon.setupUrl || addon.manifestUrl || "").replace(/\/$/, "");
  const slug = slugify(addon.id);
  const varName = "M_" + slug.replace(/-/g, "_").toUpperCase();
  const name = addon.name.toUpperCase();
  const ver = addon.version || "1.0.0";
  const id = addon.id;
  const constName = slug.replace(/-/g, "_").toUpperCase() + "_MODULE_CODE";

  const innerCode = `var BASE=${JSON.stringify(base)};
var ${varName}={
  id:${JSON.stringify(id)},
  name:${JSON.stringify(name)},
  version:${JSON.stringify(ver)},
  labels:["ECLIPSE","STREAM"],
  searchTracks:function(query,limit){
    var self=this;
    return fetch(BASE+"/search?q="+encodeURIComponent(query)+"&limit="+(limit||20),{headers:{Accept:"application/json"}})
    .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
    .then(function(d){
      var raw=d.tracks||[];
      return {
        tracks:raw.map(function(item){
          return {
            id:String(item.id),
            title:item.title||"Unknown",
            artist:item.artist||"Unknown Artist",
            album:item.album||"",
            duration:item.duration||0,
            albumCover:item.artworkURL||""
          };
       }),
        total:raw.length
      };
    })
    .catch(function(){return {tracks:[],total:0};});
  },
  getTrackStreamUrl:function(id,quality){
    return fetch(BASE+"/stream/"+encodeURIComponent(id),{headers:{Accept:"application/json"}})
    .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
    .then(function(d){
      if(!d.url)throw new Error("No URL");
      var q=/flac|lossless|hires/i.test(d.url)?"LOSSLESS":(quality||"HIGH");
      return {streamUrl:d.url,track:{id:id,audioQuality:q}};
    });
  },
  getAlbum:function(id){
    return Promise.resolve({album:{},tracks:[]});
  },
  getArtist:function(id){
    return Promise.resolve({artist:{},tracks:[]});
  }
};
return ${varName};`;

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
    if (!addon.setupUrl && !addon.manifestUrl)
      return res.status(404).send("// No endpoint for: " + file);

    res.status(200).send(generateCode(addon));
  } catch (err) {
    res.status(500).send("// Error: " + err.message);
  }
}
