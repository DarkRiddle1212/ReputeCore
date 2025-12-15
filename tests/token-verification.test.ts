// Unit tests for token verification functionality

import { EtherscanProvider } from "@/lib/providers/etherscan";

// Mock the makeRequest method to avoid actual API calls
jest.mock("@/lib/providers/etherscan");

describe("Token Verification", () => {
  let provider: EtherscanProvider;

  beforeEach(() => {
    // Create a real instance but we'll spy on methods
    provider = new EtherscanProvider(
      process.env.ETHERSCAN_API_KEY || "test-key"
    );
  });

  describe("verifyTokenCreator", () => {
    it("should verify when wallet is the creator", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const walletAddress = "0xabcdef1234567890123456789012345678901234";

      // Mock the makeRequest to return creator data
      const makeRequestSpy = jest
        .spyOn(provider as any, "makeRequest")
        .mockResolvedValue({
          status: "1",
          message: "OK",
          result: [
            {
              contractAddress: tokenAddress,
              contractCreator: walletAddress,
              txHash: "0xtxhash123",
            },
          ],
        });

      const result = await provider.verifyTokenCreator(
        tokenAddress,
        walletAddress
      );

      expect(result.isCreator).toBe(true);
      expect(result.creationTx).toBe("0xtxhash123");
      expect(result.error).toBeUndefined();

      makeRequestSpy.mockRestore();
    });

    it("should not verify when wallet is not the creator", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const walletAddress = "0xabcdef1234567890123456789012345678901234";
      const differentCreator = "0xdifferent1234567890123456789012345678901";

      const makeRequestSpy = jest
        .spyOn(provider as any, "makeRequest")
        .mockResolvedValue({
          status: "1",
          message: "OK",
          result: [
            {
              contractAddress: tokenAddress,
              contractCreator: differentCreator,
              txHash: "0xtxhash123",
            },
          ],
        });

      const result = await provider.verifyTokenCreator(
        tokenAddress,
        walletAddress
      );

      expect(result.isCreator).toBe(false);
      expect(result.creationTx).toBe("0xtxhash123");
      expect(result.error).toBeUndefined();

      makeRequestSpy.mockRestore();
    });

    it("should handle case-insensitive address comparison", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const walletAddress = "0xABCDEF1234567890123456789012345678901234"; // Mixed case
      const creatorLowercase = "0xabcdef1234567890123456789012345678901234"; // Lowercase

      const makeRequestSpy = jest
        .spyOn(provider as any, "makeRequest")
        .mockResolvedValue({
          status: "1",
          message: "OK",
          result: [
            {
              contractAddress: tokenAddress,
              contractCreator: creatorLowercase,
              txHash: "0xtxhash123",
            },
          ],
        });

      const result = await provider.verifyTokenCreator(
        tokenAddress,
        walletAddress
      );

      expect(result.isCreator).toBe(true);

      makeRequestSpy.mockRestore();
    });

    it("should handle missing contract creation data", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const walletAddress = "0xabcdef1234567890123456789012345678901234";

      const makeRequestSpy = jest
        .spyOn(provider as any, "makeRequest")
        .mockResolvedValue({
          status: "1",
          message: "OK",
          result: [],
        });

      const result = await provider.verifyTokenCreator(
        tokenAddress,
        walletAddress
      );

      expect(result.isCreator).toBe(false);
      expect(result.error).toContain(
        "Could not find contract creation transaction"
      );

      makeRequestSpy.mockRestore();
    });

    it("should handle API errors gracefully", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const walletAddress = "0xabcdef1234567890123456789012345678901234";

      const makeRequestSpy = jest
        .spyOn(provider as any, "makeRequest")
        .mockRejectedValue(new Error("API rate limit exceeded"));

      const result = await provider.verifyTokenCreator(
        tokenAddress,
        walletAddress
      );

      expect(result.isCreator).toBe(false);
      expect(result.error).toContain("Verification failed");
      expect(result.error).toContain("API rate limit exceeded");

      makeRequestSpy.mockRestore();
    });

    it("should handle missing creator address in response", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const walletAddress = "0xabcdef1234567890123456789012345678901234";

      const makeRequestSpy = jest
        .spyOn(provider as any, "makeRequest")
        .mockResolvedValue({
          status: "1",
          message: "OK",
          result: [
            {
              contractAddress: tokenAddress,
              // contractCreator is missing
              txHash: "0xtxhash123",
            },
          ],
        });

      const result = await provider.verifyTokenCreator(
        tokenAddress,
        walletAddress
      );

      expect(result.isCreator).toBe(false);
      expect(result.error).toContain("Could not determine contract creator");

      makeRequestSpy.mockRestore();
    });
  });
});
