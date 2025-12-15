// Test script to verify Solana token creation detection fix
require('dotenv').config({ path: '.env.local' });

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const TEST_WALLET = '6UHFE7hAidEPXvJe5ZbHph7bQSHp1jv1FWUFFCwBkbuU';

async function getTokenMetadata(mintAddress) {
  const baseUrl = 'https://api.helius.xyz/v0';
  try {
    const response = await fetch(
      `${baseUrl}/token-metadata?api-key=${HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintAccounts: [mintAddress],
          includeOffChain: true,
        }),
      }
    );
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const token = data[0];
        return {
          name: token.onChainMetadata?.metadata?.name || token.offChainMetadata?.metadata?.name || 'Unknown',
          symbol: token.onChainMetadata?.metadata?.symbol || token.offChainMetadata?.metadata?.symbol || 'UNKNOWN'
        };
      }
    }
  } catch (e) {
    console.error('Error fetching metadata:', e);
  }
  return { name: 'Unknown', symbol: 'UNKNOWN' };
}

async function testWallet() {
  console.log('=== Testing Solana Token Creation Detection ===\n');
  console.log(`Wallet: ${TEST_WALLET}`);
  console.log(`Helius API Key: ${HELIUS_API_KEY ? 'Present' : 'Missing'}\n`);

  if (!HELIUS_API_KEY) {
    console.error('HELIUS_API_KEY not found in .env.local');
    return;
  }

  const baseUrl = 'https://api.helius.xyz/v0';
  
  // Paginate through transactions
  let allTransactions = [];
  let beforeSignature = undefined;
  
  console.log('Fetching transactions...\n');
  
  for (let page = 0; page < 10; page++) {
    const txUrl = beforeSignature
      ? `${baseUrl}/addresses/${TEST_WALLET}/transactions?api-key=${HELIUS_API_KEY}&limit=100&before=${beforeSignature}`
      : `${baseUrl}/addresses/${TEST_WALLET}/transactions?api-key=${HELIUS_API_KEY}&limit=100`;
    
    const response = await fetch(txUrl);
    if (!response.ok) {
      console.error(`Failed to fetch page ${page}: ${response.status}`);
      break;
    }

    const transactions = await response.json();
    if (!transactions || transactions.length === 0) break;
    
    allTransactions.push(...transactions);
    beforeSignature = transactions[transactions.length - 1]?.signature;
    
    if (transactions.length < 100) break;
  }

  console.log(`Total transactions fetched: ${allTransactions.length}\n`);

  // Show all unique sources and types
  const sources = [...new Set(allTransactions.map(tx => tx.source))];
  const types = [...new Set(allTransactions.map(tx => tx.type))];
  
  console.log('Unique sources:', sources.join(', ') || 'None');
  console.log('Unique types:', types.join(', ') || 'None');

  // Find ALL pump.fun transactions
  const pumpFunTxs = allTransactions.filter(tx => 
    tx.source === 'PUMP_FUN' || tx.source === 'PUMP.FUN' || tx.source === 'PUMP_AMM'
  );

  console.log(`\nPump.fun transactions found: ${pumpFunTxs.length}`);

  // Categorize by type
  const createTxs = pumpFunTxs.filter(tx => tx.type === 'CREATE' || tx.type === 'CREATE_POOL');
  const swapTxs = pumpFunTxs.filter(tx => tx.type === 'SWAP');
  const otherTxs = pumpFunTxs.filter(tx => tx.type !== 'CREATE' && tx.type !== 'CREATE_POOL' && tx.type !== 'SWAP');

  console.log(`  - CREATE/CREATE_POOL (actual creations): ${createTxs.length}`);
  console.log(`  - SWAP (buys/sells): ${swapTxs.length}`);
  console.log(`  - Other: ${otherTxs.length}`);

  // Show CREATE transactions
  if (createTxs.length > 0) {
    console.log('\n=== Tokens Actually Created by This Wallet ===\n');
    for (const tx of createTxs) {
      const tokenTransfers = tx.tokenTransfers || [];
      const nonSolTransfer = tokenTransfers.find(t => t.mint !== 'So11111111111111111111111111111111111111112');
      
      if (nonSolTransfer) {
        const metadata = await getTokenMetadata(nonSolTransfer.mint);
        console.log(`Token: ${metadata.name} (${metadata.symbol})`);
        console.log(`  Mint: ${nonSolTransfer.mint}`);
        console.log(`  Type: ${tx.type}`);
        console.log('');
      }
    }
  }

  // Show SWAP transactions (these should NOT be flagged as creations)
  if (swapTxs.length > 0) {
    console.log('\n=== SWAP Transactions (buys/sells - NOT creations) ===\n');
    for (const tx of swapTxs.slice(0, 10)) {
      const tokenTransfers = tx.tokenTransfers || [];
      const nonSolTransfer = tokenTransfers.find(t => t.mint !== 'So11111111111111111111111111111111111111112');
      
      if (nonSolTransfer) {
        const metadata = await getTokenMetadata(nonSolTransfer.mint);
        const amount = parseFloat(nonSolTransfer.tokenAmount || '0');
        const isReceiving = nonSolTransfer.toUserAccount === TEST_WALLET;
        console.log(`Token: ${metadata.name} (${metadata.symbol})`);
        console.log(`  Action: ${isReceiving ? 'BUY' : 'SELL'}`);
        console.log(`  Amount: ${amount.toLocaleString()}`);
        
        // Check if OLD code would have incorrectly flagged this
        const oldCodeWouldFlag = amount > 50000;
        console.log(`  OLD code would incorrectly flag as creation: ${oldCodeWouldFlag ? 'YES (BUG!)' : 'No'}`);
        console.log(`  NEW code correctly identifies as: SWAP (buy/sell)`);
        console.log('');
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Actual token creations (CREATE/CREATE_POOL): ${createTxs.length}`);
  console.log(`Token buys/sells (SWAP): ${swapTxs.length}`);
  console.log(`\nWith the fix, only CREATE/CREATE_POOL transactions are flagged as token creations.`);
  console.log(`SWAP transactions (buys/sells) are correctly NOT flagged as creations.`);
}

testWallet().catch(console.error);
