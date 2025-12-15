// Debug script to check wallet age calculation
const fs = require("fs");

// Test with a wallet that has more transactions
const address = "5zwN9NQei4fctQ8AfEk67PVoH1jSCSYCpfYkeamkpznj";

async function debug() {
  console.log("=== DEBUGGING WALLET AGE ===");
  console.log("Address:", address);

  // Read API key from .env
  const envContent = fs.readFileSync(".env", "utf8");
  const match = envContent.match(/HELIUS_API_KEY=([^\n\r]+)/);
  const apiKey = match ? match[1].trim() : null;

  if (!apiKey) {
    console.error("No HELIUS_API_KEY found");
    return;
  }

  const rpcUrl = `https://rpc.helius.xyz/?api-key=${apiKey}`;

  try {
    // Get signatures with pagination to find the OLDEST transaction
    console.log("\n--- Fetching ALL signatures to find oldest transaction ---");

    let allSignatures = [];
    let beforeSignature = null;
    let page = 0;

    while (true) {
      const params = beforeSignature
        ? [address, { limit: 1000, before: beforeSignature }]
        : [address, { limit: 1000 }];

      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignaturesForAddress",
          params,
        }),
      });

      const data = await response.json();
      const signatures = data.result || [];

      if (signatures.length === 0) {
        console.log(`Page ${page}: No more signatures`);
        break;
      }

      allSignatures.push(...signatures);
      console.log(
        `Page ${page}: Fetched ${signatures.length} signatures (total: ${allSignatures.length})`
      );

      // Get the last signature for pagination
      beforeSignature = signatures[signatures.length - 1]?.signature;
      page++;

      // Safety limit
      if (page > 20) {
        console.log("Reached page limit");
        break;
      }
    }

    console.log("\nTotal signatures:", allSignatures.length);

    if (allSignatures.length > 0) {
      // First signature (newest)
      const newest = allSignatures[0];
      const newestDate = new Date(newest.blockTime * 1000);
      console.log("\nNewest transaction:");
      console.log("  Signature:", newest.signature.slice(0, 20) + "...");
      console.log("  Date:", newestDate.toISOString());

      // Last signature (oldest)
      const oldest = allSignatures[allSignatures.length - 1];
      const oldestDate = new Date(oldest.blockTime * 1000);
      console.log("\nOldest transaction (wallet creation):");
      console.log("  Signature:", oldest.signature.slice(0, 20) + "...");
      console.log("  Date:", oldestDate.toISOString());

      // Calculate age
      const ageMs = Date.now() - oldestDate.getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      console.log("\nWallet age:", ageDays, "days");

      // Compare with what we'd get with only 1000 signatures
      if (allSignatures.length > 1000) {
        const sig1000 = allSignatures[999];
        const date1000 = new Date(sig1000.blockTime * 1000);
        const age1000Days = Math.floor(
          (Date.now() - date1000.getTime()) / (1000 * 60 * 60 * 24)
        );
        console.log("\nWith only 1000 signatures:");
        console.log("  Date:", date1000.toISOString());
        console.log("  Age would be:", age1000Days, "days (INCORRECT)");
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

debug();
