/**
 * Test ALL Eclipse bridge modules end-to-end
 */

const BASE = "https://eclipse-8spine.vercel.app";

async function loadModule(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  let code = await resp.text();
  const m = code.match(/export\s+const\s+\w+\s*=\s*`([\s\S]*)`\s*;?\s*$/);
  if (m) code = m[1].replace(/\\`/g, '`');
  const fn = new Function(code);
  return fn();
}

async function testModule(slug) {
  const url = `${BASE}/modules/${slug}.8spine`;
  console.log(`\n--- Testing: ${slug} ---`);
  
  try {
    const mod = await loadModule(url);
    console.log(`  Loaded: ${mod.name} (${mod.id})`);
    
    // Test search
    const result = await mod.searchTracks("Love", 5);
    const trackCount = result?.tracks?.length || 0;
    console.log(`  Search "Love": ${trackCount} tracks`);
    
    if (trackCount > 0) {
      const t = result.tracks[0];
      console.log(`  First: "${t.title}" by ${t.artist}`);
      
      // Test stream
      try {
        const stream = await mod.getTrackStreamUrl(t.id, "HIGH");
        if (stream?.streamUrl) {
          console.log(`  Stream: ✅ ${stream.streamUrl.substring(0, 60)}...`);
          console.log(`  Quality: ${stream.track?.audioQuality || 'unknown'}`);
          return { slug, status: 'PASS', search: trackCount, stream: true };
        } else {
          console.log(`  Stream: ❌ No URL returned`);
          return { slug, status: 'PARTIAL', search: trackCount, stream: false };
        }
      } catch (e) {
        console.log(`  Stream: ❌ ${e.message}`);
        return { slug, status: 'PARTIAL', search: trackCount, stream: false };
      }
    } else {
      console.log(`  Search: ❌ No tracks`);
      return { slug, status: 'SEARCH_FAIL', search: 0, stream: false };
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    return { slug, status: 'LOAD_FAIL', search: 0, stream: false };
  }
}

async function main() {
  // First get the index to find all modules
  console.log("=== TESTING ALL ECLIPSE 8SPINE MODULES ===\n");
  console.log("Fetching index...");
  
  const resp = await fetch(`${BASE}/index.json`);
  const data = await resp.json();
  const modules = data["category:modules"] || [];
  
  console.log(`Found ${modules.length} modules:`);
  modules.forEach(m => console.log(`  - ${m.id} (${m.name})`));
  
  const results = [];
  for (const m of modules) {
    const r = await testModule(m.id);
    results.push(r);
  }
  
  console.log("\n\n=== SUMMARY ===");
  console.log("Module".padEnd(35), "Search".padEnd(10), "Stream".padEnd(10), "Status");
  console.log("-".repeat(70));
  for (const r of results) {
    console.log(
      r.slug.padEnd(35),
      String(r.search).padEnd(10),
      (r.stream ? "✅" : "❌").padEnd(10),
      r.status
    );
  }
}

main().catch(console.error);
