// Test the availability check endpoint
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

async function testAvailabilityCheck() {
  const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
  console.log("=== Testing Availability Check ===");

  // Test the stats endpoint used for availability check
  console.log("\n--- Testing stats/ethsupply endpoint ---");
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=stats&action=ethsupply&apikey=${ETHERSCAN_API_KEY}`;
    console.log("Making request...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("Aborting after 5 seconds...");
      controller.abort();
    }, 5000);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log("Response status:", response.status);
    console.log("Response OK:", response.ok);

    const data = await response.json();
    console.log("Response data:", data);

    if (response.ok) {
      console.log("✅ Availability check endpoint works!");
    } else {
      console.log("❌ Availability check endpoint failed");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Error name:", error.name);
  }
}

testAvailabilityCheck().catch(console.error);
