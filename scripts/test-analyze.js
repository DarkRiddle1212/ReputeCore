// Simple test script for the analyze API
const testAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"; // Vitalik's address

async function testAnalyze() {
  console.log("Testing analyze API...");
  console.log("Address:", testAddress);

  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: testAddress,
        forceRefresh: true,
      }),
    });

    console.log("Status:", response.status);

    const data = await response.json();
    console.log("\n=== Response ===");
    console.log(JSON.stringify(data, null, 2));

    if (data.score !== undefined) {
      console.log("\n✅ Success!");
      console.log("Trust Score:", data.score);
      console.log("Processing Time:", data.metadata?.processingTime + "ms");
      console.log("Tokens Launched:", data.tokenLaunchSummary?.totalLaunched);
    } else {
      console.log("\n❌ Error:", data.error);
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testAnalyze();
