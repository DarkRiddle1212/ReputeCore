// Simple test to check Etherscan API connection
const testAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // Vitalik's address

fetch("http://localhost:3000/api/analyze", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ address: testAddress }),
})
  .then((response) => response.json())
  .then((data) => {
    console.log("✅ API Response:", JSON.stringify(data, null, 2));
  })
  .catch((error) => {
    console.error("❌ API Error:", error);
  });
