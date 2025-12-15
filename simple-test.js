async function test() {
  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "5zwN9NQei4fctQ8AfEk67PVoH1jSCSYCpfYkeamkpznj",
        forceRefresh: true,
      }),
    });
    const result = await response.json();
    console.log(
      "Total Launched:",
      result.tokenLaunchSummary?.totalLaunched || 0
    );
    console.log("Score:", result.score);
  } catch (error) {
    console.error("Error:", error.message);
  }
}
test();
