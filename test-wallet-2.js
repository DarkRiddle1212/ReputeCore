async function test() {
  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "5NK2fRbq2TShV1sJ4SUVCosKFLyPxCaq2spHmuzkMnaT",
        forceRefresh: true,
      }),
    });
    const result = await response.json();
    console.log(
      "Total Launched:",
      result.tokenLaunchSummary?.totalLaunched || 0
    );
    console.log("Score:", result.score);
    console.log("Wallet Age:", result.walletInfo?.age);
    console.log("TX Count:", result.walletInfo?.txCount);
    console.log(
      "Tokens:",
      JSON.stringify(result.tokenLaunchSummary?.tokens || [], null, 2)
    );
    console.log("Notes:", result.notes?.slice(0, 8));
  } catch (error) {
    console.error("Error:", error.message);
  }
}
test();
