/**
 * Utility script to verify IGDB service configuration
 * Run with: node src/utils/igdbHealthCheck.js
 */

require("dotenv").config();
const igdbService = require("../services/igdbService");

async function checkIGDBHealth() {
  console.log("Checking IGDB service configuration...\n");

  const health = await igdbService.healthCheck();

  if (health.status === "ok") {
    console.log("✓ IGDB service is properly configured and working!");
    console.log(`  Message: ${health.message}\n`);

    // Try a simple search to verify it works
    try {
      console.log("Testing IGDB API with a sample search...");
      const games = await igdbService.searchGames("Mario", 1, 0);
      console.log(`✓ Successfully retrieved ${games.length} game(s) from IGDB`);
      if (games.length > 0) {
        console.log(`  Sample game: ${games[0].name || "N/A"}`);
      }
    } catch (error) {
      console.error("✗ IGDB API test failed:", error.message);
      process.exit(1);
    }
  } else if (health.status === "not_configured") {
    console.error("✗ IGDB service is not configured");
    console.error(`  Message: ${health.message}`);
    console.error("\nPlease set the following environment variables:");
    console.error("  - IGDB_CLIENT_ID");
    console.error("  - IGDB_CLIENT_SECRET");
    console.error("\nGet your credentials from: https://dev.twitch.tv/console/apps");
    process.exit(1);
  } else {
    console.error("✗ IGDB service error");
    console.error(`  Message: ${health.message}`);
    process.exit(1);
  }

  console.log("\n✓ All checks passed!");
}

checkIGDBHealth().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});



