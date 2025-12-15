// Test Etherscan API V2
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

console.log("=== Etherscan V2 API Test ===");
console.log(
  "API Key loaded:",
  ETHERSCAN_API_KEY ? `${ETHERSCAN_API_KEY.substring(0, 10)}...` : "NOT LOADED"
);

async function testEtherscanV2() {
  const testAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb";

  // Test with V2 endpoint
  console.log("\n--- Test: V2 Transaction List ---");
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${testAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    console.log("URL:", url.replace(ETHERSCAN_API_KEY, "API_KEY"));
    const response = await fetch(url);
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response status:", data.status);
    console.log("Response message:", data.message);
    console.log(
      "Number of transactions:",
      Array.isArray(data.result) ? data.result.length : "N/A"
    );
    if (Array.isArray(data.result) && data.result.length > 0) {
      console.log("First transaction:", data.result[0]);
    }
    if (data.status === "0") {
      console.log("Error result:", data.result);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  // Test token transactions
  console.log("\n--- Test: V2 Token Transactions ---");
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${testAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
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

testEtherscanV2().catch(console.error);
