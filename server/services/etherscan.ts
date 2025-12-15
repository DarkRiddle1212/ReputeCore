// server/services/etherscan.ts
// Hardened Etherscan helpers: address validation, contract-creation detection (to + input),
// rate-limit spacing, retry/backoff with jitter, bounded in-memory LRU cache,
// and caps on receipt checks. Uses global fetch (Next.js runtime).

import type { TokenSummary } from "@/types";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

if (!ETHERSCAN_API_KEY) {
  console.warn(
    "ETHERSCAN_API_KEY is not set. Please check your environment variables."
  );
} else {
  console.log("ETHERSCAN_API_KEY loaded successfully.");
}

// ---------- Config ----------
const DEFAULT_TTL_MS = 1000 * 60 * 2; // 2 minutes
const CREATED_CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes for created contracts
const MAX_RECEIPT_CHECKS = 20; // max tx receipts to request per address
const RATE_LIMIT_DELAY_MS = 250; // minimum delay between Etherscan calls
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300; // exponential backoff base
const MAX_CACHE_ENTRIES = 500; // LRU limit

// ---------- Simple bounded LRU cache using Map (insertion-ordered) ----------
type CacheValue = { value: any; expiresAt: number };
const CACHE = new Map<string, CacheValue>();

function cacheGet(key: string) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    CACHE.delete(key);
    return null;
  }
  // mark as recently used: re-insert
  CACHE.delete(key);
  CACHE.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: any, ttlMs = DEFAULT_TTL_MS) {
  // evict oldest if over limit
  while (CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = CACHE.keys().next().value;
    if (!oldestKey) break;
    CACHE.delete(oldestKey);
  }
  CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ---------- Utilities ----------
function isValidEthereumAddress(address?: string): boolean {
  if (!address || typeof address !== "string") return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ---------- Rate-limit + retry wrapper ----------
let lastCallTime = 0;

async function callEtherscanRawWithRetry(url: string) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // respect spacing between calls
    const now = Date.now();
    const since = now - lastCallTime;
    if (since < RATE_LIMIT_DELAY_MS) {
      await sleep(RATE_LIMIT_DELAY_MS - since);
    }

    lastCallTime = Date.now();

    try {
      const res = await fetch(url);
      if (!res.ok) {
        // retry on 429 or server errors
        if (res.status === 429 || res.status >= 500) {
          const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          const jitter = Math.floor(Math.random() * 100);
          await sleep(backoff + jitter);
          continue;
        }
        console.warn("Etherscan non-OK status:", res.status, url);
        return null;
      }
      const json = await res.json();
      return json;
    } catch (err) {
      const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 100);
      console.warn("Etherscan fetch error, attempt", attempt, err);
      await sleep(backoff + jitter);
      continue;
    }
  }
  console.warn("Etherscan: exhausted retries for url:", url);
  return null;
}

async function callEtherscan(query: string, useCache = true) {
  if (!ETHERSCAN_API_KEY) {
    console.warn("callEtherscan: missing ETHERSCAN_API_KEY");
    return null;
  }
  // Use V2 API with chainid parameter
  const url = `https://api.etherscan.io/v2/api?chainid=1${query}&apikey=${ETHERSCAN_API_KEY}`;
  if (useCache) {
    const c = cacheGet(url);
    if (c) return c;
  }
  const json = await callEtherscanRawWithRetry(url);
  if (json && useCache) cacheSet(url, json);
  return json;
}

// ---------- Etherscan helpers ----------
async function fetchTokenTxs(addr: string) {
  const q = `&module=account&action=tokentx&address=${addr}&startblock=0&endblock=99999999&sort=asc`;
  const json = await callEtherscan(q);
  if (!json || json.status !== "1" || !Array.isArray(json.result)) return [];
  return json.result as any[];
}

async function fetchTxList(addr: string) {
  const q = `&module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&sort=asc`;
  const json = await callEtherscan(q);
  if (!json || json.status !== "1" || !Array.isArray(json.result)) return [];
  return json.result as any[];
}

async function fetchTxReceipt(txHash: string) {
  if (!txHash) return null;
  const q = `&module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}`;
  const json = await callEtherscan(q);
  if (!json || !json.result) return null;
  return json.result as any;
}

/**
 * Find contracts created by an address:
 * - Candidate txs: to is empty/null AND input exists (bytecode)
 * - Limit number of receipts checked to avoid heavy rate usage
 */
async function findContractsCreatedBy(addr: string) {
  const cacheKey = `created:${addr}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached as any[];

  const txs = await fetchTxList(addr);
  if (!txs || txs.length === 0) {
    cacheSet(cacheKey, [], CREATED_CACHE_TTL_MS);
    return [];
  }

  // Candidates: empty 'to' AND non-empty input (contract creation has bytecode)
  const candidates = txs.filter((t) => {
    const toEmpty =
      !t.to || t.to === "0x0000000000000000000000000000000000000000";
    const hasInput =
      !!t.input && typeof t.input === "string" && t.input.length > 2;
    return toEmpty && hasInput;
  });

  const limited = candidates.slice(0, MAX_RECEIPT_CHECKS);

  const created: { contractAddress: string; timeStamp?: string }[] = [];

  for (const tx of limited) {
    try {
      const hash = (tx.hash || tx.transactionHash) as string | undefined;
      const receipt = await fetchTxReceipt(hash as string);
      const contractAddress = receipt?.contractAddress || null;
      if (
        contractAddress &&
        contractAddress !== "0x0000000000000000000000000000000000000000"
      ) {
        created.push({
          contractAddress: contractAddress.toLowerCase(),
          timeStamp: tx.timeStamp,
        });
      }
    } catch (err) {
      console.warn("receipt check error:", tx.hash ?? tx.transactionHash, err);
      // continue on single receipt failure
    }
  }

  cacheSet(cacheKey, created, CREATED_CACHE_TTL_MS);
  return created;
}

// ---------- Public functions (with input validation) ----------
export async function getTokensCreatedByAddress(
  address: string
): Promise<TokenSummary[]> {
  if (!address || !isValidEthereumAddress(address)) {
    console.warn("getTokensCreatedByAddress: invalid address:", address);
    return [];
  }

  const addr = address.toLowerCase();
  if (!ETHERSCAN_API_KEY) {
    console.warn("getTokensCreatedByAddress: no ETHERSCAN_API_KEY");
    return [];
  }

  try {
    const tokenTxs = await fetchTokenTxs(addr);

    const map = new Map<string, any>();
    for (const tx of tokenTxs) {
      const contract = (tx.contractAddress || "").toLowerCase();
      if (!contract) continue;
      if (!map.has(contract)) map.set(contract, tx);
    }

    const created = await findContractsCreatedBy(addr);
    for (const c of created) {
      const contract = (c.contractAddress || "").toLowerCase();
      if (!map.has(contract)) {
        map.set(contract, {
          tokenName: null,
          tokenSymbol: null,
          timeStamp: c.timeStamp ?? null,
          _createdByReceipt: true,
        });
      }
    }

    const tokens: TokenSummary[] = [];
    for (const [contract, meta] of map) {
      tokens.push({
        token: contract,
        name: meta?.tokenName ?? null,
        symbol: meta?.tokenSymbol ?? null,
        launchAt: meta?.timeStamp
          ? new Date(Number(meta.timeStamp) * 1000).toISOString()
          : null,
        initialLiquidity: null,
        holdersAfter7Days: null,
        liquidityLocked: null,
        devSellRatio: null,
      });
    }

    return tokens;
  } catch (err) {
    console.error("getTokensCreatedByAddress error:", err);
    return [];
  }
}

export async function getWalletFirstSeen(address: string): Promise<{
  firstSeenIso: string | null;
  txCount: number;
}> {
  if (!address || !isValidEthereumAddress(address)) {
    console.warn("getWalletFirstSeen: invalid address:", address);
    return { firstSeenIso: null, txCount: 0 };
  }

  const addr = address.toLowerCase();
  if (!ETHERSCAN_API_KEY) {
    return { firstSeenIso: null, txCount: 0 };
  }

  try {
    const txs = await fetchTxList(addr);
    if (!txs || txs.length === 0) return { firstSeenIso: null, txCount: 0 };
    const firstTx = txs[0];
    const firstSeenIso = firstTx.timeStamp
      ? new Date(Number(firstTx.timeStamp) * 1000).toISOString()
      : null;
    return { firstSeenIso, txCount: txs.length };
  } catch (err) {
    console.error("getWalletFirstSeen error:", err);
    return { firstSeenIso: null, txCount: 0 };
  }
}
