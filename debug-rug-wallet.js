// Debug script to understand why rug wallet isn't finding tokens
const fs = require("fs");

const address = "911jgDyLwiSszYoH2cmntXTX5QeMo37tWB6dSpTmKhTc";

async function debug() {
  console.log("=== DEBUGGING RUG WALLET TOKEN DETECTION ===");
  console.log("Address:", address);
  console.log("");

  // First, let's check the Helius API directly to see what transactions exist
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

  if (!HELIUS_API_KEY) {
    // Read from .env file
    const envContent = fs.readFileSync(".env", "utf8");
    const match = envContent.match(/HELIUS_API_KEY=([^\n\r]+)/);
    if (match) {
      process.env.HELIUS_API_KEY = match[1].trim();
    }
  }

  const apiKey = process.env.HELIUS_API_KEY;
  console.log("API Key present:", !!apiKey);

  if (!apiKey) {
    console.error("No HELIUS_API_KEY found");
    return;
  }

  try {
    // Paginate through ALL transactions to find token creation
    console.log("\n--- Fetching ALL transactions from Helius ---");

    let allTransactions = [];
    let beforeSignature = null;
    let page = 0;
    const MAX_PAGES = 10; // Limit to 1000 transactions

    while (page < MAX_PAGES) {
      const txUrl = beforeSignature
        ? `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=100&before=${beforeSignature}`
        : `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=100`;

      const txResponse = await fetch(txUrl);
      const rawData = await txResponse.json();

      const transactions = Array.isArray(rawData) ? rawData : [];

      if (transactions.length === 0) {
        console.log(`Page ${page}: No more transactions`);
        break;
      }

      allTransactions.push(...transactions);
      console.log(
        `Page ${page}: Fetched ${transactions.length} transactions (total: ${allTransactions.length})`
      );

      // Get last signature for pagination
      beforeSignature = transactions[transactions.length - 1]?.signature;
      page++;

      // Check if we found any non-TRANSFER transactions
      const nonTransfers = transactions.filter((tx) => tx.type !== "TRANSFER");
      if (nonTransfers.length > 0) {
        console.log(
          `  Found ${nonTransfers.length} non-TRANSFER transactions!`
        );
        const types = [...new Set(nonTransfers.map((tx) => tx.type))];
        const sources = [...new Set(nonTransfers.map((tx) => tx.source))];
        console.log(`  Types: ${types.join(", ")}`);
        console.log(`  Sources: ${sources.join(", ")}`);
      }
    }

    const transactions = allTransactions;
    console.log("\nTotal transactions fetched:", transactions.length);

    if (transactions.length === 0) {
      console.log("No transactions found");
      return;
    }

    // Analyze transaction types
    const types = {};
    const sources = {};
    const pumpFunTxs = [];

    for (const tx of transactions) {
      types[tx.type] = (types[tx.type] || 0) + 1;
      sources[tx.source] = (sources[tx.source] || 0) + 1;

      // Check for pump.fun transactions
      if (
        tx.source === "PUMP_FUN" ||
        tx.source === "PUMP.FUN" ||
        tx.source === "PUMP_AMM"
      ) {
        pumpFunTxs.push({
          signature: tx.signature?.slice(0, 20) + "...",
          type: tx.type,
          source: tx.source,
          feePayer: tx.feePayer,
          description: tx.description?.slice(0, 100),
          tokenTransfers: tx.tokenTransfers?.length || 0,
          timestamp: tx.timestamp
            ? new Date(tx.timestamp * 1000).toISOString()
            : "unknown",
        });
      }
    }

    console.log("\nTransaction types:", types);
    console.log("Transaction sources:", sources);
    console.log("\nPump.fun transactions found:", pumpFunTxs.length);

    if (pumpFunTxs.length > 0) {
      console.log("\n--- Pump.fun Transaction Details ---");
      for (const tx of pumpFunTxs.slice(0, 10)) {
        console.log("\nTx:", tx.signature);
        console.log("  Type:", tx.type);
        console.log("  Source:", tx.source);
        console.log("  Fee Payer:", tx.feePayer);
        console.log("  Token Transfers:", tx.tokenTransfers);
        console.log("  Description:", tx.description);
        console.log("  Timestamp:", tx.timestamp);
      }
    }

    // Look for CREATE transactions
    const createTxs = transactions.filter(
      (tx) =>
        tx.type === "CREATE" ||
        tx.description?.toLowerCase().includes("created")
    );

    console.log("\n--- CREATE Transactions ---");
    console.log("Found:", createTxs.length);
    for (const tx of createTxs.slice(0, 5)) {
      console.log("\nTx:", tx.signature?.slice(0, 20) + "...");
      console.log("  Type:", tx.type);
      console.log("  Source:", tx.source);
      console.log("  Description:", tx.description?.slice(0, 150));
    }

    // Check for token transfers where wallet receives large amounts
    console.log("\n--- Large Token Receipts ---");
    for (const tx of transactions) {
      const transfers = tx.tokenTransfers || [];
      for (const t of transfers) {
        if (
          t.toUserAccount === address &&
          parseFloat(t.tokenAmount || "0") > 10000
        ) {
          console.log("\nTx:", tx.signature?.slice(0, 20) + "...");
          console.log("  Type:", tx.type);
          console.log("  Source:", tx.source);
          console.log("  Token Amount:", t.tokenAmount);
          console.log("  Mint:", t.mint);
          console.log("  Description:", tx.description?.slice(0, 100));
        }
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

debug();
