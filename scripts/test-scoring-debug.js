// Quick test to check if the API returns a score

async function testAPI() {
  const testAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0";

  console.log(`Testing API with address: ${testAddress}`);

  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: testAddress }),
    });

    console.log(`Response status: ${response.status}`);

    const data = await response.json();

    console.log("\n=== FULL RESPONSE ===");
    console.log(JSON.stringify(data, null, 2));

    console.log("\n=== SCORE CHECK ===");
    console.log(`Score value: ${data.score}`);
    console.log(`Score type: ${typeof data.score}`);
    console.log(`Is score undefined?: ${data.score === undefined}`);
    console.log(`Is score null?: ${data.score === null}`);
    console.log(`Is score NaN?: ${isNaN(data.score)}`);

    console.log("\n=== BREAKDOWN CHECK ===");
    console.log(`Breakdown:`, data.breakdown);
  } catch (error) {
    console.error("Error:", error);
  }
}

testAPI();
