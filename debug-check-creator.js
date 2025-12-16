/**
 * Check if wallet is the creator of the tokens found
 */
require('dotenv').config();

const WALLET = '5zwN9NQei4fctQ8AfEk67PVoH1jSCSYCpfYkeamkpznj';
const TOKENS = [
  'CSrwNk6B1DwWCHRMsaoDVUfD5bBMQCJPY72ZG3Nnpump',
  'A8YFC9X61bz9SCbmLkccitqM7mXqqHKN2hBZx1Y3pump',
  'DWi8EqpTZHsh3DN9jkJ8kBfzv3B4x3ZBZiyWxnCTpump'
];

async function checkCreator() {
  const apiKey = process.env.HELIUS_API_KEY;
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  
  console.log('Checking if wallet is creator of tokens...');
  console.log('Wallet:', WALLET);
  console.log('');
  
  for (const mint of TOKENS) {
    console.log(`\n=== Token: ${mint} ===`);
    
    // Get mint account info
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [mint, { encoding: 'jsonParsed' }]
      })
    });
    
    const data = await response.json();
    const mintInfo = data.result?.value?.data?.parsed?.info;
    
    if (mintInfo) {
      console.log('Mint Authority:', mintInfo.mintAuthority || 'None (revoked)');
      console.log('Freeze Authority:', mintInfo.freezeAuthority || 'None');
      console.log('Supply:', mintInfo.supply);
      console.log('Decimals:', mintInfo.decimals);
      
      // Check if our wallet is the authority
      if (mintInfo.mintAuthority === WALLET) {
        console.log('>>> THIS WALLET IS THE MINT AUTHORITY <<<');
      }
    } else {
      console.log('Could not fetch mint info');
    }
    
    // Also try to get the token's creation transaction
    const txResponse = await fetch(`https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${apiKey}&limit=100`);
    const transactions = await txResponse.json();
    
    if (transactions && transactions.length > 0) {
      // Find the oldest transaction (likely creation)
      const oldest = transactions[transactions.length - 1];
      console.log('\nOldest transaction:');
      console.log('  Signature:', oldest.signature?.slice(0, 30) + '...');
      console.log('  Type:', oldest.type);
      console.log('  Source:', oldest.source);
      console.log('  Fee Payer:', oldest.feePayer);
      console.log('  Timestamp:', oldest.timestamp ? new Date(oldest.timestamp * 1000).toISOString() : 'N/A');
      
      if (oldest.feePayer === WALLET) {
        console.log('>>> THIS WALLET PAID FOR THE OLDEST TX <<<');
      }
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
}

checkCreator().catch(console.error);
