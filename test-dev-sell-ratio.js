// Test dev sell ratio penalties
const { determineOutcome } = require("./lib/tokenHeuristics.ts");

// Test cases
const testCases = [
  {
    name: "Very high sell ratio (>80%)",
    token: {
      token: "test1",
      name: "Test Token 1",
      devSellRatio: 85,
      initialLiquidity: 10,
      currentLiquidity: 8,
    },
    expected: "rug",
  },
  {
    name: "High sell ratio (50-80%)",
    token: {
      token: "test2",
      name: "Test Token 2",
      devSellRatio: 65,
      initialLiquidity: 10,
      currentLiquidity: 8,
    },
    expected: "unknown",
  },
  {
    name: "Moderate sell ratio (25-50%)",
    token: {
      token: "test3",
      name: "Test Token 3",
      devSellRatio: 35,
      initialLiquidity: 10,
      currentLiquidity: 8,
    },
    expected: "success",
  },
  {
    name: "Low sell ratio (<10%)",
    token: {
      token: "test4",
      name: "Test Token 4",
      devSellRatio: 5,
      initialLiquidity: 10,
      currentLiquidity: 8,
    },
    expected: "success",
  },
];

console.log("Testing dev sell ratio penalties:\n");

for (const testCase of testCases) {
  const result = determineOutcome(testCase.token);
  const pass = result.outcome === testCase.expected ? "✓" : "✗";
  console.log(`${pass} ${testCase.name}`);
  console.log(`  Expected: ${testCase.expected}, Got: ${result.outcome}`);
  console.log(`  Reason: ${result.reason}\n`);
}
