# Wallet Scoring API Documentation

## Overview

The Wallet Scoring API provides trust scores for cryptocurrency wallet addresses across multiple blockchains. The system analyzes on-chain data including wallet age, transaction activity, and token launch history to generate a comprehensive trust score.

## Supported Blockchains

- **Ethereum** - EVM-compatible blockchain
- **Solana** - High-performance blockchain

## Base URL

```
https://your-domain.com/api
```

## Endpoints

### POST /api/analyze

Analyzes a wallet address and returns a comprehensive trust score.

#### Request

**Headers:**

```
Content-Type: application/json
```

**Body:**

```json
{
  "address": "string",
  "forceRefresh": boolean (optional, default: false)
}
```

**Parameters:**

| Parameter      | Type    | Required | Description                                                                      |
| -------------- | ------- | -------- | -------------------------------------------------------------------------------- |
| `address`      | string  | Yes      | The wallet address to analyze. Can be Ethereum (0x...) or Solana (base58) format |
| `forceRefresh` | boolean | No       | If true, bypasses cache and fetches fresh data                                   |

**Address Formats:**

- **Ethereum**: Must start with `0x` followed by 40 hexadecimal characters
  - Example: `0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6`
  - Case-insensitive
  - Automatically normalized to lowercase

- **Solana**: Base58-encoded string, typically 32-44 characters
  - Example: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`
  - Case-sensitive
  - No `0x` prefix

#### Response

**Success (200 OK):**

```json
{
  "score": 75,
  "blockchain": "solana",
  "breakdown": {
    "walletAgeScore": 20,
    "activityScore": 25,
    "tokenOutcomeScore": 20,
    "heuristicsScore": 10,
    "final": 75
  },
  "notes": [
    "Wallet age: 365 days (mature wallet)",
    "Transaction count: 1,234 (active wallet)",
    "Token launches: 5 total, 4 successful, 1 rug pull"
  ],
  "reason": "Deterministic score based on on-chain analysis",
  "walletInfo": {
    "createdAt": "2023-01-15T10:30:00Z",
    "firstTxHash": "0x123...",
    "txCount": 1234,
    "age": 365
  },
  "tokenLaunchSummary": {
    "totalLaunched": 5,
    "succeeded": 4,
    "rugged": 1,
    "unknown": 0,
    "tokens": [
      {
        "token": "0xabc...",
        "name": "Example Token",
        "symbol": "EXT",
        "launchAt": "2023-06-01T00:00:00Z",
        "outcome": "success",
        "reason": "Strong liquidity and holder growth",
        "initialLiquidity": 50000,
        "holdersAfter7Days": 250,
        "liquidityLocked": true,
        "devSellRatio": 0.15
      }
    ]
  },
  "metadata": {
    "analyzedAt": "2024-01-15T10:30:00Z",
    "processingTime": 2500,
    "dataFreshness": "fresh",
    "providersUsed": ["helius", "quicknode"],
    "blockchain": "solana"
  },
  "confidence": "high",
  "cached": false,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Response Fields:**

| Field                              | Type         | Description                                    |
| ---------------------------------- | ------------ | ---------------------------------------------- |
| `score`                            | number       | Overall trust score (0-100)                    |
| `blockchain`                       | string       | Detected blockchain (`ethereum` or `solana`)   |
| `breakdown`                        | object       | Score breakdown by component                   |
| `breakdown.walletAgeScore`         | number       | Score based on wallet age (0-25)               |
| `breakdown.activityScore`          | number       | Score based on transaction activity (0-30)     |
| `breakdown.tokenOutcomeScore`      | number       | Score based on token launch success (0-30)     |
| `breakdown.heuristicsScore`        | number       | Score adjustments from heuristics (-15 to +15) |
| `breakdown.final`                  | number       | Final calculated score (0-100)                 |
| `notes`                            | string[]     | Human-readable explanations of score factors   |
| `reason`                           | string       | Overall scoring methodology                    |
| `walletInfo`                       | object       | Wallet metadata                                |
| `walletInfo.createdAt`             | string\|null | ISO timestamp of wallet creation               |
| `walletInfo.firstTxHash`           | string\|null | Hash of first transaction                      |
| `walletInfo.txCount`               | number       | Total transaction count                        |
| `walletInfo.age`                   | number\|null | Wallet age in days                             |
| `tokenLaunchSummary`               | object       | Summary of token launches                      |
| `tokenLaunchSummary.totalLaunched` | number       | Total tokens created                           |
| `tokenLaunchSummary.succeeded`     | number       | Successful token launches                      |
| `tokenLaunchSummary.rugged`        | number       | Rug pull tokens                                |
| `tokenLaunchSummary.unknown`       | number       | Tokens with unknown outcome                    |
| `tokenLaunchSummary.tokens`        | array        | Detailed token information                     |
| `metadata`                         | object       | Analysis metadata                              |
| `metadata.analyzedAt`              | string       | ISO timestamp of analysis                      |
| `metadata.processingTime`          | number       | Processing time in milliseconds                |
| `metadata.dataFreshness`           | string       | `fresh` or `cached`                            |
| `metadata.providersUsed`           | string[]     | Data providers used                            |
| `metadata.blockchain`              | string       | Blockchain analyzed                            |
| `confidence`                       | string       | Confidence level (`low`, `medium`, `high`)     |
| `cached`                           | boolean      | Whether result was served from cache           |
| `timestamp`                        | string       | ISO timestamp of response                      |

**Error Responses:**

**400 Bad Request - Invalid Address:**

```json
{
  "error": "Invalid Ethereum address format",
  "code": "VALIDATION_ERROR"
}
```

**400 Bad Request - Invalid Solana Address:**

```json
{
  "error": "Invalid Solana address format",
  "code": "VALIDATION_ERROR"
}
```

**429 Too Many Requests:**

```json
{
  "error": "Too many requests. Please try again later",
  "retryAfter": 60
}
```

**500 Internal Server Error:**

```json
{
  "error": "An unexpected error occurred",
  "code": "INTERNAL_ERROR",
  "requestId": "req_1234567890_abc123"
}
```

**503 Service Unavailable:**

```json
{
  "error": "All blockchain data providers are currently unavailable",
  "code": "NETWORK_ERROR"
}
```

## Examples

### Analyze Ethereum Wallet

```bash
curl -X POST https://your-domain.com/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
  }'
```

### Analyze Solana Wallet

```bash
curl -X POST https://your-domain.com/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  }'
```

### Force Refresh (Bypass Cache)

```bash
curl -X POST https://your-domain.com/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "forceRefresh": true
  }'
```

### JavaScript/TypeScript Example

```typescript
async function analyzeWallet(address: string, forceRefresh = false) {
  const response = await fetch("https://your-domain.com/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address, forceRefresh }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Analysis failed");
  }

  return response.json();
}

// Analyze Ethereum wallet
const ethResult = await analyzeWallet(
  "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
);
console.log("Ethereum wallet score:", ethResult.score);

// Analyze Solana wallet
const solResult = await analyzeWallet(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
console.log("Solana wallet score:", solResult.score);
```

### Python Example

```python
import requests

def analyze_wallet(address: str, force_refresh: bool = False) -> dict:
    """Analyze a wallet address and return trust score."""
    url = 'https://your-domain.com/api/analyze'
    payload = {
        'address': address,
        'forceRefresh': force_refresh
    }

    response = requests.post(url, json=payload)
    response.raise_for_status()

    return response.json()

# Analyze Ethereum wallet
eth_result = analyze_wallet('0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6')
print(f"Ethereum wallet score: {eth_result['score']}")

# Analyze Solana wallet
sol_result = analyze_wallet('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
print(f"Solana wallet score: {sol_result['score']}")
```

## Scoring Methodology

### Score Components

The trust score (0-100) is calculated from four components:

1. **Wallet Age Score (0-25 points)**
   - Based on how long the wallet has existed
   - Older wallets receive higher scores
   - Scoring tiers:
     - < 30 days: 5 points
     - 30-90 days: 10 points
     - 90-180 days: 15 points
     - 180-365 days: 20 points
     - > 365 days: 25 points

2. **Activity Score (0-30 points)**
   - Based on transaction count
   - More active wallets receive higher scores
   - Scoring tiers:
     - < 10 txs: 5 points
     - 10-50 txs: 10 points
     - 50-100 txs: 15 points
     - 100-500 txs: 20 points
     - 500-1000 txs: 25 points
     - > 1000 txs: 30 points

3. **Token Outcome Score (0-30 points)**
   - Based on success rate of token launches
   - Calculated as: (successful tokens / total tokens) \* 30
   - Only applies if wallet has created tokens

4. **Heuristics Score (-15 to +15 points)**
   - Adjustments based on pattern detection
   - Penalties for:
     - High rug pull rate (> 50%)
     - Multiple rug pulls in short time
     - Suspicious token patterns
   - Bonuses for:
     - Consistent success rate
     - Long-term token performance
     - Locked liquidity

### Confidence Levels

- **High**: Wallet has > 365 days age, > 1000 transactions, and > 10 token launches
- **Medium**: Wallet has > 90 days age, > 100 transactions, or > 3 token launches
- **Low**: Wallet has limited data available

### Blockchain-Specific Considerations

#### Ethereum

- Transaction costs (gas) are higher, so lower transaction counts may still indicate active usage
- Token launches typically involve more complex smart contracts
- ERC-20 token standard is well-established

#### Solana

- Lower transaction costs enable higher transaction volumes
- SPL token standard is used for tokens
- Faster block times mean more frequent transactions
- Token launches may use programs like Pump.fun or Raydium

## Rate Limiting

- **Limit**: 100 requests per minute per IP address
- **Headers**: Rate limit information is included in response headers
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

## Caching

- Results are cached for **5 minutes** by default
- Cache is blockchain-specific (Ethereum and Solana results are cached separately)
- Use `forceRefresh: true` to bypass cache
- Cache status is indicated in the `cached` field of the response

## Error Handling

### Error Codes

| Code                     | Description                      |
| ------------------------ | -------------------------------- |
| `VALIDATION_ERROR`       | Invalid input parameters         |
| `INVALID_ADDRESS_FORMAT` | Address format is invalid        |
| `INVALID_SOLANA_ADDRESS` | Solana address format is invalid |
| `RATE_LIMIT_ERROR`       | Rate limit exceeded              |
| `NETWORK_ERROR`          | Network or provider error        |
| `API_ERROR`              | External API error               |
| `INTERNAL_ERROR`         | Internal server error            |

### Best Practices

1. **Handle Rate Limits**: Implement exponential backoff when receiving 429 responses
2. **Validate Addresses**: Validate address format client-side before making requests
3. **Use Caching**: Don't use `forceRefresh` unless necessary
4. **Error Handling**: Always handle potential errors gracefully
5. **Timeouts**: Set appropriate timeouts (recommend 30 seconds)

## Support

For API support or questions:

- Check this documentation first
- Review error messages and codes
- Contact support with request ID from error responses

## Changelog

### v2.0.0 (Current)

- Added Solana blockchain support
- Multi-chain address detection
- Blockchain-specific caching
- Enhanced error handling
- Improved documentation

### v1.0.0

- Initial release with Ethereum support
- Basic wallet scoring
- Token launch analysis
