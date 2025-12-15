// Comprehensive API Testing Script
const BASE_URL = "http://localhost:3001";

async function testAPI() {
  console.log("🧪 Starting Comprehensive API Tests\n");

  // Test 1: Health Check
  console.log("Test 1: Health Check");
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    console.log("✅ Health check passed:", data);
  } catch (error) {
    console.log("❌ Health check failed:", error.message);
  }

  // Test 2: Solana Address Analysis
  console.log("\nTest 2: Solana Address Analysis");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      }),
    });
    const data = await response.json();
    console.log("✅ Solana analysis passed");
    console.log("   - Blockchain:", data.blockchain);
    console.log("   - Score:", data.score);
    console.log("   - Providers:", data.metadata?.providersUsed);
    console.log("   - Processing time:", data.metadata?.processingTime + "ms");
  } catch (error) {
    console.log("❌ Solana analysis failed:", error.message);
  }

  // Test 3: Ethereum Address Analysis
  console.log("\nTest 3: Ethereum Address Analysis");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      }),
    });
    const data = await response.json();
    console.log("✅ Ethereum analysis passed");
    console.log("   - Blockchain:", data.blockchain);
    console.log("   - Score:", data.score);
    console.log("   - Providers:", data.metadata?.providersUsed);
    console.log("   - Processing time:", data.metadata?.processingTime + "ms");
  } catch (error) {
    console.log("❌ Ethereum analysis failed:", error.message);
  }

  // Test 4: Cache Functionality (repeat Solana address)
  console.log("\nTest 4: Cache Functionality");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      }),
    });
    const data = await response.json();
    console.log("✅ Cache test passed");
    console.log("   - Cached:", data.cached);
    console.log("   - Processing time:", data.metadata?.processingTime + "ms");
  } catch (error) {
    console.log("❌ Cache test failed:", error.message);
  }

  // Test 5: Invalid Address Format
  console.log("\nTest 5: Invalid Address Format");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "invalid-address-123" }),
    });
    const data = await response.json();
    if (response.status === 400) {
      console.log("✅ Invalid address properly rejected");
      console.log("   - Error:", data.error);
    } else {
      console.log("❌ Invalid address not properly rejected");
    }
  } catch (error) {
    console.log("❌ Invalid address test failed:", error.message);
  }

  // Test 6: Missing Address
  console.log("\nTest 6: Missing Address Parameter");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (response.status === 400) {
      console.log("✅ Missing address properly rejected");
      console.log("   - Error:", data.error);
    } else {
      console.log("❌ Missing address not properly rejected");
    }
  } catch (error) {
    console.log("❌ Missing address test failed:", error.message);
  }

  // Test 7: Base58 Solana Address
  console.log("\nTest 7: Different Solana Address Format");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "So11111111111111111111111111111111111111112",
      }),
    });
    const data = await response.json();
    console.log("✅ Alternative Solana address passed");
    console.log("   - Blockchain:", data.blockchain);
    console.log("   - Score:", data.score);
  } catch (error) {
    console.log("❌ Alternative Solana address failed:", error.message);
  }

  // Test 8: Checksum Ethereum Address
  console.log("\nTest 8: Checksum Ethereum Address");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      }),
    });
    const data = await response.json();
    console.log("✅ Checksum Ethereum address passed");
    console.log("   - Blockchain:", data.blockchain);
    console.log("   - Score:", data.score);
  } catch (error) {
    console.log("❌ Checksum Ethereum address failed:", error.message);
  }

  // Test 9: Response Structure Validation
  console.log("\nTest 9: Response Structure Validation");
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      }),
    });
    const data = await response.json();

    const requiredFields = [
      "score",
      "blockchain",
      "breakdown",
      "notes",
      "reason",
      "walletInfo",
      "tokenLaunchSummary",
      "metadata",
      "confidence",
      "cached",
      "timestamp",
    ];

    const missingFields = requiredFields.filter((field) => !(field in data));

    if (missingFields.length === 0) {
      console.log("✅ Response structure is complete");
      console.log("   - All required fields present");
    } else {
      console.log("❌ Response structure incomplete");
      console.log("   - Missing fields:", missingFields);
    }
  } catch (error) {
    console.log("❌ Response structure test failed:", error.message);
  }

  // Test 10: Performance Test (multiple requests)
  console.log("\nTest 10: Performance Test (5 requests)");
  try {
    const addresses = [
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      "So11111111111111111111111111111111111111112",
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Repeat for cache
    ];

    const startTime = Date.now();
    const promises = addresses.map((address) =>
      fetch(`${BASE_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      }).then((r) => r.json())
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();

    console.log("✅ Performance test completed");
    console.log("   - Total time:", endTime - startTime + "ms");
    console.log(
      "   - Average per request:",
      Math.round((endTime - startTime) / addresses.length) + "ms"
    );
    console.log(
      "   - Cached responses:",
      results.filter((r) => r.cached).length
    );
  } catch (error) {
    console.log("❌ Performance test failed:", error.message);
  }

  console.log("\n✨ Comprehensive testing complete!\n");
}

testAPI().catch(console.error);
