/**
 * Compare legacy vs enhanced detection for a Pump.fun wallet
 */

require('dotenv').config();

const WALLET = '5zwN9NQei4fctQ8AfEk67PVoH1jSCSYCpfYkeamkpznj';

async function testBothMethods() {
  console.log('Comparing detection methods for wallet:', WALLET);
  console.log('---');

  const { HeliusProvider } = await import('./lib/providers/helius.ts');
  
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    console.error('HELIUS_API_KEY not found');
    process.exit(1);
  }

  // Test LEGACY detection (disabled enhanced)
  console.log('\n=== LEGACY Detection ===');
  const legacyProvider = new HeliusProvider(apiKey, false);
  
  try {
    const startTime = Date.now();
    const tokens = await legacyProvider.getTokensCreated(WALLET);
    console.log(`Found ${tokens.length} tokens in ${Date.now() - startTime}ms`);
    tokens.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} (${t.symbol}) - ${t.token}`);
    });
  } catch (error) {
    console.error('Legacy error:', error.message);
  }

  // Wait a bit to avoid rate limits
  console.log('\nWaiting 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));

  // Test ENHANCED detection
  console.log('\n=== ENHANCED Detection ===');
  const enhancedProvider = new HeliusProvider(apiKey, true);
  
  try {
    const startTime = Date.now();
    const tokens = await enhancedProvider.getTokensCreated(WALLET);
    console.log(`Found ${tokens.length} tokens in ${Date.now() - startTime}ms`);
    tokens.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} (${t.symbol}) - ${t.token}`);
    });
  } catch (error) {
    console.error('Enhanced error:', error.message);
  }
}

testBothMethods().catch(console.error);
