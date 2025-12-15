const bs58 = require("bs58");

const address = "Azw1V43ekNWwiTRMeLfBq6Mz9HHuD21PnSFNQnBLWk2s";

console.log("Testing address:", address);
console.log("Length:", address.length);
console.log("bs58 object:", Object.keys(bs58));

try {
  // Try different ways to access decode
  const decode = bs58.decode || bs58.default?.decode || bs58.default;
  console.log("Decode function:", typeof decode);

  if (typeof decode === "function") {
    const decoded = decode(address);
    console.log("✅ Valid base58");
    console.log("Decoded length:", decoded.length, "bytes");
    console.log("Is valid Solana address:", decoded.length === 32);
  } else {
    console.log("❌ Could not find decode function");
  }
} catch (e) {
  console.log("❌ Error:", e.message);
}
