// Tests for database operations

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  checkDatabaseConnection,
  saveTokenLaunch,
  getTokenLaunchesByCreator,
  getCreatorStats,
  saveWalletAnalysis,
  getWalletAnalysis,
} from "../lib/db/repositories";
import { prisma, disconnectPrisma } from "../lib/db/prisma";

describe("Database Operations", () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  describe("Connection", () => {
    it("should connect to database", async () => {
      const isConnected = await checkDatabaseConnection();
      expect(typeof isConnected).toBe("boolean");
    });
  });

  describe("Token Launch Repository", () => {
    const testCreator = "0xtest" + Date.now();
    const testToken = "0xtoken" + Date.now();

    it("should save a token launch", async () => {
      await saveTokenLaunch({
        token: testToken,
        name: "Test Token",
        symbol: "TEST",
        creator: testCreator,
        launchAt: new Date(),
        outcome: "success",
        reason: "Test token",
        initialLiquidity: 1000,
        holdersAfter7Days: 250,
        liquidityLocked: true,
        devSellRatio: 0.1,
      });

      const tokens = await getTokenLaunchesByCreator(testCreator);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].token).toBe(testToken);
    });

    it("should update existing token launch", async () => {
      await saveTokenLaunch({
        token: testToken,
        name: "Test Token Updated",
        symbol: "TEST",
        creator: testCreator,
        launchAt: new Date(),
        outcome: "rug",
        reason: "Updated to rug",
      });

      const tokens = await getTokenLaunchesByCreator(testCreator);
      const updated = tokens.find((t) => t.token === testToken);
      expect(updated?.outcome).toBe("rug");
      expect(updated?.name).toBe("Test Token Updated");
    });

    it("should get creator statistics", async () => {
      const stats = await getCreatorStats(testCreator);
      expect(stats.total).toBeGreaterThan(0);
      expect(typeof stats.successRate).toBe("number");
      expect(typeof stats.rugRate).toBe("number");
    });
  });

  describe("Wallet Analysis Repository", () => {
    const testAddress = "0xwallet" + Date.now();

    it("should save wallet analysis", async () => {
      await saveWalletAnalysis({
        address: testAddress,
        score: 75,
        breakdown: {
          age: 80,
          activity: 70,
          tokens: 75,
          heuristics: 75,
        },
        notes: ["Test note 1", "Test note 2"],
      });

      const analysis = await getWalletAnalysis(testAddress);
      expect(analysis).not.toBeNull();
      expect(analysis?.score).toBe(75);
    });

    it("should update existing wallet analysis", async () => {
      await saveWalletAnalysis({
        address: testAddress,
        score: 85,
        breakdown: {
          age: 90,
          activity: 80,
          tokens: 85,
          heuristics: 85,
        },
        notes: ["Updated note"],
      });

      const analysis = await getWalletAnalysis(testAddress);
      expect(analysis?.score).toBe(85);
      expect(analysis?.analysisCount).toBeGreaterThan(1);
    });

    it("should normalize addresses to lowercase", async () => {
      const upperAddress = "0xABCDEF" + Date.now();
      await saveWalletAnalysis({
        address: upperAddress,
        score: 50,
        breakdown: {},
        notes: [],
      });

      const analysis = await getWalletAnalysis(upperAddress.toLowerCase());
      expect(analysis).not.toBeNull();
    });
  });

  describe("Data Types", () => {
    it("should handle optional fields", async () => {
      const token = "0xoptional" + Date.now();
      const creator = "0xcreator" + Date.now();

      await saveTokenLaunch({
        token,
        creator,
        launchAt: new Date(),
        outcome: "unknown",
      });

      const tokens = await getTokenLaunchesByCreator(creator);
      const saved = tokens.find((t) => t.token === token);
      expect(saved).toBeDefined();
      expect(saved?.name).toBeNull();
      expect(saved?.symbol).toBeNull();
    });

    it("should handle JSON breakdown field", async () => {
      const address = "0xjson" + Date.now();
      const complexBreakdown = {
        age: 100,
        activity: 80,
        tokens: 60,
        heuristics: 70,
        metadata: {
          confidence: "HIGH",
          dataQuality: "GOOD",
        },
      };

      await saveWalletAnalysis({
        address,
        score: 77,
        breakdown: complexBreakdown,
        notes: ["Complex breakdown test"],
      });

      const analysis = await getWalletAnalysis(address);
      expect(analysis?.breakdown).toEqual(complexBreakdown);
    });
  });
});
