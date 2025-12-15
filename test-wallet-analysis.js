// Test the analyze API with a Solana wallet
const TEST_WALLET = '6UHFE7hAidEPXvJe5ZbHph7bQSHp1jv1FWUFFCwBkbuU';

async function testAnalyze() {
  console.log('=== Testing Analyze API with Solana Wallet ===\n');
  console.log(`Wallet: ${TEST_WALLET}\n`);

  try {
    const response = await fetch('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: TEST_WALLET,
        forceRefresh: true,
      }),
    });

    console.log('Status:', response.status);

    const data = await response.json();
    console.log('\n=== Response ===');
    console.log(JSON.stringify(data, null, 2));

    if (data.score !== undefined) {
      console.log('\n✅ Success!');
      console.log('Trust Score:', data.score);
      console.log('Tokens Launched:', data.tokenLaunchSummary?.totalLaunched);
      console.log('Rugged:', data.tokenLaunchSummary?.rugged);
      
      if (data.tokenLaunchSummary?.totalLaunched === 0) {
        console.log('\n✅ FIX VERIFIED: Wallet correctly shows 0 tokens created!');
      } else {
        console.log('\n⚠️ Wallet shows tokens created - check if this is correct');
      }
    } else {
      console.log('\n❌ Error:', data.error);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nMake sure the dev server is running: npm run dev');
  }
}

testAnalyze();
