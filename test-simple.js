// Simple Sequential API Testing
const BASE_URL = "http://localhost:3001";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testAPI() {
  console.log("🧪 Testing Multi-Chain Token Analyzer\n");

  // Test 1: Health Check
  console.log("1️⃣ Health Check...");
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    console.log("✅ PASS - Server is healthy\n");
  } catch (error) {
    console.log("❌ FAIL -", error.message, "\n");
    return;
  }

  await sleep(1000);

  // Test 2: Solana Address
  console.log("2️⃣ Solana Address Analysis...");
  try {
    const start = Date.now();
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "So11111111111111111111111111111111111111112",
      }),
    });
    const data = await response.json();
    const time = Date.now() - start;

    console.log("✅ PASS - Solana analysis complete");
    console.log(`   Blockchain: ${data.blockchain}`);
    console.log(`   Score: ${data.score}`);
    console.log(`   Provider: ${data.metadata?.providersUsed?.[0]}`);
    console.log(`   Time: ${time}ms`);
    console.log(`   Cached: ${data.cached}\n`);
  } catch (error) {
    console.log("❌ FAIL -", error.message, "\n");
  }

  await sleep(2000);

  // Test 3: Ethereum Address
  console.log("3️⃣ Ethereum Address Analysis...");
  try {
    const start = Date.now();
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      }),
    });
    const data = await response.json();
    const time = Date.now() - start;

    console.log("✅ PASS - Ethereum analysis complete");
    console.log(`   Blockchain: ${data.blockchain}`);
    console.log(`   Score: ${data.score}`);
    console.log(`   Provider: ${data.metadata?.providersUsed?.[0]}`);
    console.log(`   Time: ${time}ms`);
    console.log(`   Cached: ${data.cached}\n`);
  } catch (error) {
    console.log("❌ FAIL -", error.message, "\n");
  }

  await sleep(2000);

  // Test 4: Cache Test (repeat Solana)
  console.log("4️⃣ Cache Functionality Test...");
  try {
    const start = Date.now();
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "So11111111111111111111111111111111111111112",
      }),
    });
    const data = await response.json();
    const time = Date.now() - start;

    if (data.cached) {
      console.log("✅ PASS - Cache is working");
      console.log(`   Time: ${time}ms (should be faster)\n`);
    } else {
      console.log("⚠️  WARNING - Response not cached\n");
    }
  } catch (error) {
    console.log("❌ FAIL -", error.message, "\n");
  }

  await sleep(1000);

  // Test 5: Invalid Address
  console.log("5️⃣ Invalid Address Handling...");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "invalid-address-123" }),
    });
    const data = await response.json();

    if (response.status === 400) {
      console.log("✅ PASS - Invalid address properly rejected");
      console.log(`   Error: ${data.error}\n`);
    } else {
      console.log("❌ FAIL - Invalid address not rejected\n");
    }
  } catch (error) {
    console.log("❌ FAIL -", error.message, "\n");
  }

  await sleep(1000);

  // Test 6: Missing Address
  console.log("6️⃣ Missing Address Parameter...");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    if (response.status === 400) {
      console.log("✅ PASS - Missing address properly rejected");
      console.log(`   Error: ${data.error}\n`);
    } else {
      console.log("❌ FAIL - Missing address not rejected\n");
    }
  } catch (error) {
    console.log("❌ FAIL -", error.message, "\n");
  }

  console.log("✨ Testing Complete!\n");
}

testAPI().catch(console.error);
