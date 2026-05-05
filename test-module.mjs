/**
 * Test script to simulate what 8spine's Module Manager does:
 * 1. Download the .8spine module
 * 2. Parse and evaluate it
 * 3. Call searchTracks
 * 4. Call getTrackStreamUrl with a result
 */

const MODULE_URL = "https://eclipse-8spine.vercel.app/modules/eclipse-allinone.8spine";

async function main() {
  console.log("=== 8SPINE MODULE TESTER ===\n");

  // 1. Download the module
  console.log("[1] Fetching module from:", MODULE_URL);
  const resp = await fetch(MODULE_URL);
  if (!resp.ok) {
    console.error("FAIL: HTTP", resp.status);
    process.exit(1);
  }
  let code = await resp.text();
  console.log("[1] Module downloaded, length:", code.length, "chars\n");

  // 2. Parse like Module Manager does
  // Handle export wrapper: export const X = `...`
  const exportMatch = code.match(/export\s+const\s+\w+\s*=\s*`([\s\S]*)`\s*;?\s*$/);
  if (exportMatch) {
    code = exportMatch[1];
    // Unescape backtick escapes
    code = code.replace(/\\`/g, '`');
    console.log("[2] Extracted inner code from export wrapper, length:", code.length, "\n");
  } else {
    console.log("[2] No export wrapper detected, using raw code\n");
  }

  // 3. Instantiate via new Function (like Module Manager)
  let mod;
  try {
    const createModule = new Function(code);
    mod = createModule();
    console.log("[3] Module loaded successfully!");
    console.log("    id:", mod.id);
    console.log("    name:", mod.name);
    console.log("    version:", mod.version);
    console.log("    labels:", mod.labels);
    console.log("    has searchTracks:", typeof mod.searchTracks === 'function');
    console.log("    has getTrackStreamUrl:", typeof mod.getTrackStreamUrl === 'function');
    console.log();
  } catch (e) {
    console.error("FAIL: Module instantiation failed:", e.message);
    process.exit(1);
  }

  // 4. Test searchTracks
  const query = "Linkin Park Numb";
  console.log("[4] Searching for:", JSON.stringify(query));
  try {
    const result = await mod.searchTracks(query, 5);
    console.log("    total:", result.total);
    if (result.tracks && result.tracks.length > 0) {
      console.log("    First 3 tracks:");
      for (const t of result.tracks.slice(0, 3)) {
        console.log(`      - ${t.title} by ${t.artist} (id: ${t.id}, duration: ${t.duration}s)`);
        console.log(`        album: ${t.album}, cover: ${t.albumCover ? 'YES' : 'NO'}`);
      }
      console.log();

      // 5. Test getTrackStreamUrl with first track
      const trackId = result.tracks[0].id;
      console.log("[5] Getting stream URL for track:", trackId);
      try {
        const stream = await mod.getTrackStreamUrl(trackId, "LOSSLESS");
        console.log("    streamUrl:", stream.streamUrl ? stream.streamUrl.substring(0, 80) + "..." : "NONE");
        console.log("    audioQuality:", stream.track?.audioQuality);
        console.log("\n=== ALL TESTS PASSED ===");
      } catch (e) {
        console.error("    STREAM FAILED:", e.message);
        // Try another track
        if (result.tracks.length > 1) {
          const trackId2 = result.tracks[1].id;
          console.log("\n[5b] Retrying with second track:", trackId2);
          try {
            const stream2 = await mod.getTrackStreamUrl(trackId2, "HIGH");
            console.log("    streamUrl:", stream2.streamUrl ? stream2.streamUrl.substring(0, 80) + "..." : "NONE");
            console.log("    audioQuality:", stream2.track?.audioQuality);
            console.log("\n=== STREAM TEST PASSED ON RETRY ===");
          } catch (e2) {
            console.error("    STREAM RETRY FAILED:", e2.message);
          }
        }
      }
    } else {
      console.error("    NO TRACKS RETURNED!");
    }
  } catch (e) {
    console.error("    SEARCH FAILED:", e.message);
  }
}

main().catch(console.error);
