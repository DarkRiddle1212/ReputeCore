// Test Etherscan API V2 with active address
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

console.log("=== Etherscan V2 API Test (Active Address) ===");

async function testEtherscanV2() {
  // Vitalik's address - known to have transactions
  const testAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

  // Test with V2 endpoint
  console.log("\n--- Test: V2 Transaction List ---");
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${testAddress}&startblock=0&endblock=99999999&page=1&offset=10&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
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
      console.log("First transaction timestamp:", data.result[0].timeStamp);
      console.log("First transaction hash:", data.result[0].hash);
    }
    if (data.status === "0" && data.message !== "No transactions found") {
      console.log("Error result:", data.result);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  // Test transaction receipt
  console.log("\n--- Test: V2 Transaction Receipt ---");
  try {
    const txHash =
      "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Has result:", !!data.result);
    if (data.result) {
      console.log("Contract address:", data.result.contractAddress);
      console.log("Status:", data.result.status);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testEtherscanV2().catch(console.error);
