/**
 * Test ONLY legacy detection for the wallet
 */
require('dotenv').config();

const WALLET = '5zwN9NQei4fctQ8AfEk67PVoH1jSCSYCpfYkeamkpznj';

async function test() {
  const { HeliusProvider } = await import('./lib/providers/helius.ts');
  
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    console.error('HELIUS_API_KEY not found');
    process.exit(1);
  }

  console.log('Testing LEGACY detection for:', WALLET);
  console.log('---');
  
  // Use legacy detection (enhanced = false)
  const provider = new HeliusProvider(apiKey, false);
  
  try {
    const startTime = Date.now();
    const tokens = await provider.getTokensCreated(WALLET);
    console.log(`\nFound ${tokens.length} tokens in ${Date.now() - startTime}ms`);
    
    if (tokens.length > 0) {
      console.log('\nTokens:');
      tokens.slice(0, 10).forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.name || 'Unknown'} (${t.symbol || 'N/A'}) - ${t.token.slice(0, 12)}...`);
      });
      if (tokens.length > 10) {
        console.log(`  ... and ${tokens.length - 10} more`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test().catch(console.error);
