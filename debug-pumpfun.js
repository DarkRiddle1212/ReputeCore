/**
 * Debug Pump.fun detection - paginate through ALL transactions
 */
require('dotenv').config();

const WALLET = '5zwN9NQei4fctQ8AfEk67PVoH1jSCSYCpfYkeamkpznj';

async function debug() {
  const apiKey = process.env.HELIUS_API_KEY;
  const baseUrl = 'https://api.helius.xyz/v0';
  
  console.log('Fetching ALL transactions for:', WALLET);
  
  let allTxs = [];
  let beforeSig = undefined;
  let page = 0;
  
  while (true) {
    const url = beforeSig
      ? `${baseUrl}/addresses/${WALLET}/transactions?api-key=${apiKey}&limit=100&before=${beforeSig}`
      : `${baseUrl}/addresses/${WALLET}/transactions?api-key=${apiKey}&limit=100`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log('Error:', response.status);
      break;
    }
    
    const transactions = await response.json();
    if (transactions.length === 0) break;
    
    allTxs.push(...transactions);
    console.log(`Page ${page}: ${transactions.length} txs (total: ${allTxs.length})`);
    
    beforeSig = transactions[transactions.length - 1]?.signature;
    page++;
    
    if (transactions.length < 100) break;
    
    // Small delay
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('\nTotal transactions:', allTxs.length);
  
  // Find Pump.fun transactions
  const pumpFunTxs = allTxs.filter(tx => tx.source === 'PUMP_FUN');
  console.log('Pump.fun transactions:', pumpFunTxs.length);
  
  // Group by type
  const types = {};
  for (const tx of pumpFunTxs) {
    types[tx.type] = (types[tx.type] || 0) + 1;
  }
  console.log('Types:', types);
  
  // Show CREATE transactions
  const createTxs = pumpFunTxs.filter(tx => tx.type === 'CREATE');
  console.log('\nCREATE transactions:', createTxs.length);
  
  if (createTxs.length > 0) {
    console.log('\nFirst 3 CREATE txs:');
    for (const tx of createTxs.slice(0, 3)) {
      console.log(`- ${tx.signature.slice(0, 20)}... type=${tx.type} feePayer=${tx.feePayer}`);
    }
  }
}

debug().catch(console.error);
