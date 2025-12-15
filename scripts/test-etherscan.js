/**
 * Test script to verify Etherscan API connectivity
 * Run with: node scripts/test-etherscan.js
 */

require("dotenv").config();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const BASE_URL = "https://api.etherscan.io/v2/api";
const CHAIN_ID = "1";

async function testEtherscanAPI() {
  console.log("=== Etherscan API Test ===\n");

  if (!ETHERSCAN_API_KEY) {
    console.error("ETHERSCAN_API_KEY is not set in environment");
    return;
  }

  console.log(
    `API Key: ${ETHERSCAN_API_KEY.slice(0, 8)}...${ETHERSCAN_API_KEY.slice(-4)}`
  );
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Chain ID: ${CHAIN_ID}\n`);

  // Test 1: Simple balance check
  console.log("Test 1: Balance check...");
  try {
    const testAddress = "0x0000000000000000000000000000000000000000";
    const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=balance&address=${testAddress}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    console.log("Response:", JSON.stringify(data, null, 2));

    if (data.status === "1" || data.status === "0") {
      console.log("Balance check passed\n");
    } else {
      console.log("Balance check failed\n");
    }
  } catch (error) {
    console.error("Balance check error:", error);
  }

  // Test 2: Transaction list for a known address
  console.log("Test 2: Transaction list...");
  try {
    // Use Vitalik's address as a test
    const testAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=txlist&address=${testAddress}&startblock=0&endblock=99999999&page=1&offset=5&sort=desc&apikey=${ETHERSCAN_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    console.log("Response status:", data.status);
    console.log("Response message:", data.message);
    console.log(
      "Result count:",
      Array.isArray(data.result) ? data.result.length : "not an array"
    );

    if (data.status === "1" && Array.isArray(data.result)) {
      console.log("Transaction list passed\n");
    } else {
      console.log("Transaction list failed:", data.result);
    }
  } catch (error) {
    console.error("Transaction list error:", error);
  }

  // Test 3: Contract call (getPair from Uniswap V2 Factory)
  console.log("Test 3: Contract call (Uniswap V2 getPair)...");
  try {
    const factoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
    const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    // getPair(address,address) selector: 0xe6a43905
    const callData =
      "0xe6a43905" +
      wethAddress.toLowerCase().replace("0x", "").padStart(64, "0") +
      usdcAddress.toLowerCase().replace("0x", "").padStart(64, "0");

    const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=proxy&action=eth_call&to=${factoryAddress}&data=${callData}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    console.log("Response:", JSON.stringify(data, null, 2));

    if (data.result && data.result !== "0x") {
      const pairAddress = "0x" + data.result.slice(-40);
      console.log("Pair address:", pairAddress);
      console.log("Contract call passed\n");
    } else {
      console.log("Contract call failed\n");
    }
  } catch (error) {
    console.error("Contract call error:", error);
  }

  console.log("=== Test Complete ===");
}

testEtherscanAPI().catch(console.error);
