// Test Etherscan API directly
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

console.log("=== Etherscan Debug Test ===");
console.log(
  "API Key loaded:",
  ETHERSCAN_API_KEY ? `${ETHERSCAN_API_KEY.substring(0, 10)}...` : "NOT LOADED"
);
console.log("API Key length:", ETHERSCAN_API_KEY?.length || 0);

async function testEtherscan() {
  const testAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb";

  // Test 1: Basic API availability
  console.log("\n--- Test 1: API Availability ---");
  try {
    const url = `https://api.etherscan.io/api?module=stats&action=ethsupply&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response:", data);
  } catch (error) {
    console.error("Error:", error.message);
  }

  // Test 2: Get transaction list
  console.log("\n--- Test 2: Transaction List ---");
  try {
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${testAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response status:", data.status);
    console.log("Response message:", data.message);
    console.log(
      "Number of transactions:",
      Array.isArray(data.result) ? data.result.length : "N/A"
    );
    if (data.status === "0") {
      console.log("Error result:", data.result);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  // Test 3: Get token transactions
  console.log("\n--- Test 3: Token Transactions ---");
  try {
    const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${testAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response status:", data.status);
    console.log("Response message:", data.message);
    console.log(
      "Number of token txs:",
      Array.isArray(data.result) ? data.result.length : "N/A"
    );
    if (data.status === "0") {
      console.log("Error result:", data.result);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testEtherscan().catch(console.error);
