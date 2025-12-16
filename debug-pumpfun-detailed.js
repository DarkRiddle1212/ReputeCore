/**
 * Debug Pump.fun detection - detailed transaction analysis
 */
require('dotenv').config();

const WALLET = '5zwN9NQei4fctQ8AfEk67PVoH1jSCSYCpfYkeamkpznj';

async function debug() {
  const apiKey = process.env.HELIUS_API_KEY;
  const baseUrl = 'https://api.helius.xyz/v0';
  
  console.log('=== DETAILED ANALYSIS FOR WALLET ===');
  console.log('Wallet:', WALLET);
  console.log('');
  
  // 1. Get all transactions with full details
  console.log('1. Fetching all transactions...');
  const url = `${baseUrl}/addresses/${WALLET}/transactions?api-key=${apiKey}&limit=100`;
  const response = await fetch(url);
  const transactions = await response.json();
  
  console.log(`Total transactions: ${transactions.length}`);
  console.log('');
  
  // 2. Show all unique sources and types
  const sources = {};
  const types = {};
  for (const tx of transactions) {
    sources[tx.source] = (sources[tx.source] || 0) + 1;
    types[tx.type] = (types[tx.type] || 0) + 1;
  }
  console.log('2. Transaction sources:', sources);
  console.log('3. Transaction types:', types);
  console.log('');
  
  // 3. Show details of each Pump.fun transaction
  const pumpFunTxs = transactions.filter(tx => tx.source === 'PUMP_FUN');
  console.log(`4. Pump.fun transactions (${pumpFunTxs.length}):`);
  for (const tx of pumpFunTxs) {
    console.log(`\n--- Transaction: ${tx.signature.slice(0, 30)}...`);
    console.log(`  Type: ${tx.type}`);
    console.log(`  Fee Payer: ${tx.feePayer}`);
    console.log(`  Timestamp: ${tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : 'N/A'}`);
    
    if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
      console.log(`  Token Transfers:`);
      for (const transfer of tx.tokenTransfers) {
        console.log(`    - Mint: ${transfer.mint}`);
        console.log(`      From: ${transfer.fromUserAccount || 'N/A'}`);
        console.log(`      To: ${transfer.toUserAccount || 'N/A'}`);
        console.log(`      Amount: ${transfer.tokenAmount}`);
      }
    }
    
    if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
      console.log(`  Native Transfers: ${tx.nativeTransfers.length}`);
    }
  }
  
  // 4. Check for any token mints in ALL transactions
  console.log('\n\n5. All unique token mints in transactions:');
  const mints = new Set();
  for (const tx of transactions) {
    if (tx.tokenTransfers) {
      for (const transfer of tx.tokenTransfers) {
        if (transfer.mint && transfer.mint !== 'So11111111111111111111111111111111111111112') {
          mints.add(transfer.mint);
        }
      }
    }
  }
  console.log(`Found ${mints.size} unique token mints:`);
  for (const mint of mints) {
    console.log(`  - ${mint}`);
  }
  
  // 5. Try to get token metadata for any mints found
  if (mints.size > 0) {
    console.log('\n6. Token metadata for found mints:');
    const mintArray = Array.from(mints);
    const metaResponse = await fetch(`${baseUrl}/token-metadata?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: mintArray.slice(0, 10) })
    });
    
    if (metaResponse.ok) {
      const metadata = await metaResponse.json();
      for (const token of metadata) {
        if (token) {
          const name = token.onChainMetadata?.metadata?.name || token.legacyMetadata?.name || 'Unknown';
          const symbol = token.onChainMetadata?.metadata?.symbol || token.legacyMetadata?.symbol || 'N/A';
          console.log(`  - ${token.account}: ${name} (${symbol})`);
        }
      }
    }
  }
  
  // 6. Try DAS API to find tokens by authority
  console.log('\n\n7. Checking DAS API for tokens by authority...');
  const dasUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  
  const dasResponse = await fetch(dasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'das-search',
      method: 'searchAssets',
      params: {
        ownerAddress: WALLET,
        tokenType: 'fungible',
        displayOptions: { showFungible: true }
      }
    })
  });
  
  if (dasResponse.ok) {
    const dasData = await dasResponse.json();
    const assets = dasData.result?.items || [];
    console.log(`DAS API found ${assets.length} assets owned by wallet`);
    
    for (const asset of assets.slice(0, 10)) {
      console.log(`  - ${asset.id}: ${asset.content?.metadata?.name || 'Unknown'}`);
    }
  }
}

debug().catch(console.error);
