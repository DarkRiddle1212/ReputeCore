// Test simpler availability check endpoints
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

async function testSimpleAvailability() {
  const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
  console.log("=== Testing Simple Availability Checks ===");

  // Test 1: Try balance check (usually fast)
  console.log("\n--- Test 1: Balance check ---");
  try {
    const testAddr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=${testAddr}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
    console.log("Making request...");

    const start = Date.now();
    const response = await fetch(url);
    const elapsed = Date.now() - start;

    console.log("Response time:", elapsed, "ms");
    console.log("Response status:", response.status);
    console.log("Response OK:", response.ok);

    const data = await response.json();
    console.log("Response:", data);

    if (response.ok && data.status === "1") {
      console.log("✅ Balance check works!");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }

  // Test 2: Try txlist with limit
  console.log("\n--- Test 2: Transaction list (limited) ---");
  try {
    const testAddr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${testAddr}&startblock=0&endblock=99999999&page=1&offset=1&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    console.log("Making request...");

    const start = Date.now();
    const response = await fetch(url);
    const elapsed = Date.now() - start;

    console.log("Response time:", elapsed, "ms");
    console.log("Response status:", response.status);
    console.log("Response OK:", response.ok);

    const data = await response.json();
    console.log("Response status:", data.status);
    console.log("Response message:", data.message);

    if (
      response.ok &&
      (data.status === "1" || data.message === "No transactions found")
    ) {
      console.log("✅ Transaction list check works!");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testSimpleAvailability().catch(console.error);
