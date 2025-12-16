/**
 * Test script for enhanced Solana token detection
 */

require('dotenv').config();

const WALLET = '5zwN9NQei4fctQ8AfEk67PVoH1jSCSYCpfYkeamkpznj';

async function testDetection() {
  console.log('Testing enhanced Solana token detection...');
  console.log('Wallet:', WALLET);
  console.log('---');

  // Dynamic import for ES modules
  const { HeliusProvider } = await import('./lib/providers/helius.ts');
  
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    console.error('HELIUS_API_KEY not found in environment');
    process.exit(1);
  }

  // Test with enhanced detection enabled (default)
  console.log('\n=== Testing Enhanced Detection ===');
  const provider = new HeliusProvider(apiKey, true);
  
  try {
    const startTime = Date.now();
    const tokens = await provider.getTokensCreated(WALLET);
    const duration = Date.now() - startTime;
    
    console.log(`\nFound ${tokens.length} tokens in ${duration}ms`);
    
    if (tokens.length > 0) {
      console.log('\nTokens detected:');
      tokens.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.name || 'Unknown'} (${t.symbol || 'N/A'})`);
        console.log(`     Address: ${t.token}`);
        console.log(`     Launch: ${t.launchAt || 'Unknown'}`);
        if (t.holdersAfter7Days) console.log(`     Holders: ${t.holdersAfter7Days}`);
        if (t.devSellRatio !== undefined) console.log(`     Dev Sell Ratio: ${(t.devSellRatio * 100).toFixed(1)}%`);
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testDetection().catch(console.error);
