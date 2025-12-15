// Test the API endpoint
async function testAPIEndpoint() {
  console.log("=== Testing API Endpoint ===");

  // Test with Vitalik's address
  const testAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

  try {
    console.log("\nSending request to API...");
    const response = await fetch("http://localhost:3001/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: testAddress,
        forceRefresh: true,
      }),
    });

    console.log("Response status:", response.status);
    const data = await response.json();

    if (response.ok) {
      console.log("✅ API call successful!");
      console.log("\nWallet Info:");
      console.log("  Created At:", data.walletInfo?.createdAt);
      console.log("  TX Count:", data.walletInfo?.txCount);
      console.log("  Age:", data.walletInfo?.age);
      console.log("\nToken Summary:");
      console.log("  Total Launched:", data.tokenLaunchSummary?.totalLaunched);
      console.log("  Succeeded:", data.tokenLaunchSummary?.succeeded);
      console.log("  Rugged:", data.tokenLaunchSummary?.rugged);
      console.log("\nScore:", data.score);
      console.log("Providers Used:", data.metadata?.providersUsed);
    } else {
      console.log("❌ API call failed");
      console.log("Error:", data);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testAPIEndpoint().catch(console.error);
