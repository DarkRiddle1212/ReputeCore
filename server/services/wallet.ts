// server/services/wallet.ts
// returns first tx timestamp and tx count for an address via Etherscan
import { z } from "zod";
import { WalletInfo } from "@/types";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

async function callEtherscan(query: string) {
  if (!ETHERSCAN_API_KEY) return null;
  const url = `https://api.etherscan.io/api${query}&apikey=${ETHERSCAN_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// helper to format age
function formatAge(from: Date): string {
  const now = new Date();
  const diff = now.getTime() - from.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0)
    return `${years} year${years > 1 ? "s" : ""}, ${months % 12} month${months % 12 > 1 ? "s" : ""}`;
  if (months > 0) return `${months} month${months > 1 ? "s" : ""}`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  return `${seconds} seconds`;
}

export async function getWalletCreationInfo(
  address: string
): Promise<WalletInfo> {
  address = address.toLowerCase();

  if (!ETHERSCAN_API_KEY) {
    return { createdAt: null, firstTxHash: null, txCount: 0, age: null };
  }

  try {
    const qAsc = `?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc`;
    const ascJson = await callEtherscan(qAsc);

    const qDesc = `?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc`;
    const descJson = await callEtherscan(qDesc);

    const firstTx =
      Array.isArray(ascJson?.result) && ascJson.result.length > 0
        ? ascJson.result[0]
        : null;

    const txCount = Array.isArray(descJson?.result)
      ? descJson.result.length
      : 0;

    const createdAt = firstTx?.timeStamp
      ? new Date(Number(firstTx.timeStamp) * 1000).toISOString()
      : null;

    const age = createdAt ? formatAge(new Date(createdAt)) : null;

    return {
      createdAt,
      firstTxHash: firstTx?.hash ?? null,
      txCount,
      age,
    };
  } catch (err) {
    console.error("wallet.getWalletCreationInfo error:", err);
    return { createdAt: null, firstTxHash: null, txCount: 0, age: null };
  }
}
