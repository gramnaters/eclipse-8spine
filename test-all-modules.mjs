/**
 * End-to-end test for all Eclipse 8SPINE modules (source format)
 * Tests: module loading → searchTracks → getTrackStreamUrl
 */

const BASE = "https://eclipse-8spine.vercel.app";

async function loadModule(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  let code = await resp.text();
  
  // Handle export wrapper if present (old format)
  const exportMatch = code.match(/export\s+const\s+\w+\s*=\s*`([\s\S]*)`\s*;?\s*$/);
  if (exportMatch) {
    code = exportMatch[1].replace(/\\`/g, '`');
  }
  
  const fn = new Function(code);
  return fn();
}

async function testModule(entry) {
  const url = entry.download;
  console.log(`\n--- Testing: ${entry.id} (${entry.name}) ---`);
  console.log(`    Download: ${url}`);
  
  try {
    const mod = await loadModule(url);
    console.log(`  ✅ Loaded: ${mod.name} (${mod.id}) v${mod.version}`);
    console.log(`     Labels: ${(mod.labels || []).join(', ')}`);
    console.log(`     Settings: ${mod.settings ? Object.keys(mod.settings).join(', ') : 'none'}`);
    
    // Wait a moment for eager token fetch to complete
    await new Promise(r => setTimeout(r, 1500));
    
    // Test search
    const result = await mod.searchTracks("Love", 5);
    const trackCount = result?.tracks?.length || 0;
    console.log(`  Search "Love": ${trackCount} tracks`);
    
    if (trackCount > 0) {
      const t = result.tracks[0];
      console.log(`  First: "${t.title}" by ${t.artist}`);
      console.log(`         ID: ${t.id.substring(0, 50)}${t.id.length > 50 ? '...' : ''}`);
      
      // Test stream
      try {
        const stream = await mod.getTrackStreamUrl(t.id, "HIGH");
        if (stream?.streamUrl) {
          console.log(`  Stream: ✅ ${stream.streamUrl.substring(0, 60)}...`);
          console.log(`  Quality: ${stream.track?.audioQuality || 'unknown'}`);
          return { id: entry.id, status: 'PASS', search: trackCount, stream: true };
        } else {
          console.log(`  Stream: ❌ No URL returned`);
          return { id: entry.id, status: 'PARTIAL', search: trackCount, stream: false };
        }
      } catch (e) {
        console.log(`  Stream: ❌ ${e.message}`);
        return { id: entry.id, status: 'PARTIAL', search: trackCount, stream: false };
      }
    } else {
      console.log(`  Search: ❌ No tracks`);
      return { id: entry.id, status: 'SEARCH_FAIL', search: 0, stream: false };
    }
  } catch (e) {
    console.log(`  ❌ ERROR: ${e.message}`);
    return { id: entry.id, status: 'LOAD_FAIL', search: 0, stream: false };
  }
}

async function main() {
  console.log("=== 8SPINE SOURCE MODULE E2E TEST ===\n");
  console.log("Fetching source index from:", BASE + "/index.json");
  
  const resp = await fetch(BASE + "/index.json");
  const data = await resp.json();
  const modules = data["category:music"] || [];
  
  console.log(`\nFound ${modules.length} modules:`);
  modules.forEach(m => console.log(`  - ${m.id}: ${m.name} by ${m.author} [${m.labels.join(', ')}]`));
  
  const results = [];
  for (const m of modules) {
    const r = await testModule(m);
    results.push(r);
  }
  
  console.log("\n\n═══════════════════ SUMMARY ═══════════════════");
  console.log("Module".padEnd(35), "Search".padEnd(10), "Stream".padEnd(10), "Status");
  console.log("─".repeat(70));
  for (const r of results) {
    console.log(
      r.id.padEnd(35),
      String(r.search).padEnd(10),
      (r.stream ? "✅" : "❌").padEnd(10),
      r.status
    );
  }
  
  const pass = results.filter(r => r.status === 'PASS').length;
  const total = results.length;
  console.log(`\n${pass}/${total} modules fully working`);
}

main().catch(console.error);
