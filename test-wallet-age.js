// Test wallet age calculation
const fs = require("fs");

const address = "5zwN9NQei4fctQ8AfEk67PVoH1jSCSYCpfYkeamkpznj";

async function test() {
  console.log("Testing wallet age for:", address);

  try {
    const response = await fetch("http://localhost:3001/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, forceRefresh: true }),
    });

    const data = await response.json();

    console.log("\n=== WALLET INFO ===");
    console.log("Address:", data.walletInfo?.address);
    console.log("Created At:", data.walletInfo?.createdAt);
    console.log("Age:", data.walletInfo?.age);
    console.log("TX Count:", data.walletInfo?.txCount);
    console.log("Score:", data.score);

    // Save result
    fs.writeFileSync(
      "wallet-age-result.txt",
      JSON.stringify(
        {
          address: data.walletInfo?.address,
          createdAt: data.walletInfo?.createdAt,
          age: data.walletInfo?.age,
          txCount: data.walletInfo?.txCount,
          score: data.score,
        },
        null,
        2
      )
    );

    console.log("\nDONE");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

test();
