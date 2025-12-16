# Requirements Document

## Introduction

This feature enhances Solana wallet token detection capabilities to improve accuracy from the current ~85-90% to ~95%+ reliability. The system currently uses multiple detection methods (DAS API, Pump.fun heuristics, transaction scanning, known program detection) but still struggles with custom programs, very old tokens, and complex factory patterns. This improvement focuses on reducing false positives/negatives and expanding detection coverage.

## Glossary

- **DAS API**: Digital Asset Standard API provided by Helius for querying Solana token metadata and ownership
- **Pump.fun**: A popular Solana token launchpad platform that uses factory contracts for token creation
- **Mint Authority**: The Solana account authorized to mint new tokens for a given token mint
- **SPL Token**: Solana Program Library Token - the standard token program on Solana
- **Token Mint**: The unique address identifying a token on Solana
- **Factory Contract**: A smart contract that creates other contracts/tokens on behalf of users
- **InitializeMint**: The SPL Token instruction that creates a new token mint
- **Base58**: The encoding format used for Solana addresses (32-44 characters)
- **Token Detection System**: The component responsible for identifying tokens created by a wallet address

## Requirements

### Requirement 1

**User Story:** As a user analyzing a Solana wallet, I want the system to accurately detect tokens created through Pump.fun, so that I can see all tokens launched by the wallet without false positives.

#### Acceptance Criteria

1. WHEN the Token Detection System analyzes a wallet's Pump.fun transactions THEN the Token Detection System SHALL distinguish token creation from token purchases using verified on-chain data rather than heuristics alone
2. WHEN a Pump.fun transaction contains an InitializeMint instruction with the wallet as mint authority THEN the Token Detection System SHALL classify the token as created by the wallet
3. WHEN a Pump.fun transaction shows only token transfers without mint authority assignment THEN the Token Detection System SHALL NOT classify the token as created by the wallet
4. WHEN the Token Detection System detects a Pump.fun token THEN the Token Detection System SHALL extract and return the token's metadata including name, symbol, and creation timestamp

### Requirement 2

**User Story:** As a user analyzing an older Solana wallet, I want the system to find tokens created beyond the recent transaction limit, so that I can see the complete history of token launches.

#### Acceptance Criteria

1. WHEN a wallet has transactions THEN the Token Detection System SHALL scan up to 4000 transactions using pagination
2. WHEN scanning transaction history THEN the Token Detection System SHALL limit total scan time to 90 seconds to maintain responsiveness
3. WHEN the Token Detection System reaches the scan time limit or 4000 transaction limit THEN the Token Detection System SHALL return partial results with a flag indicating incomplete scan
4. WHEN partial results are returned THEN the Token Detection System SHALL include the count of transactions scanned and total transactions available

### Requirement 3

**User Story:** As a user, I want the system to detect tokens created through custom or lesser-known token creation programs, so that I can see tokens beyond major platforms.

#### Acceptance Criteria

1. WHEN scanning transactions THEN the Token Detection System SHALL detect InitializeMint and InitializeMint2 instructions regardless of the invoking program
2. WHEN an InitializeMint instruction lists the wallet as mint authority THEN the Token Detection System SHALL classify the token as created by the wallet
3. WHEN a token is detected via InitializeMint THEN the Token Detection System SHALL record the detection method as "mint_authority_verified"
4. WHEN multiple detection methods identify the same token THEN the Token Detection System SHALL deduplicate results and prefer the most reliable detection method

### Requirement 4

**User Story:** As a user, I want to understand the confidence level of token detection results, so that I can make informed decisions about the data accuracy.

#### Acceptance Criteria

1. WHEN the Token Detection System returns detected tokens THEN the Token Detection System SHALL include a confidence score between 0 and 100 for each token
2. WHEN a token is detected via verified mint authority THEN the Token Detection System SHALL assign a confidence score of 100
3. WHEN a token is detected via DAS API authority lookup THEN the Token Detection System SHALL assign a confidence score of 95
4. WHEN a token is detected via heuristic methods THEN the Token Detection System SHALL assign a confidence score between 60 and 80 based on the number of matching signals
5. WHEN displaying results THEN the Token Detection System SHALL sort tokens by confidence score in descending order

### Requirement 5

**User Story:** As a user, I want the system to cache detection results efficiently, so that repeated analyses of the same wallet are fast.

#### Acceptance Criteria

1. WHEN the Token Detection System completes a wallet analysis THEN the Token Detection System SHALL cache the results with a configurable TTL
2. WHEN a cached result exists and is within TTL THEN the Token Detection System SHALL return cached results without re-scanning
3. WHEN a user requests a force refresh THEN the Token Detection System SHALL bypass the cache and perform a fresh scan
4. WHEN cache entries exceed the configured maximum THEN the Token Detection System SHALL evict the least recently used entries

### Requirement 6

**User Story:** As a user, I want the system to only show tokens I actually created, so that I do not see tokens I merely purchased or received.

#### Acceptance Criteria

1. WHEN detecting tokens THEN the Token Detection System SHALL require verified mint authority evidence before classifying a token as created
2. WHEN a wallet receives tokens via transfer without being mint authority THEN the Token Detection System SHALL NOT classify the token as created by the wallet
3. WHEN heuristic detection suggests a token creation THEN the Token Detection System SHALL verify the suggestion against on-chain mint authority data before including the token
4. WHEN verification fails or is inconclusive THEN the Token Detection System SHALL exclude the token from results rather than include a false positive
5. WHEN a token is excluded due to failed verification THEN the Token Detection System SHALL log the exclusion reason for debugging purposes

### Requirement 7

**User Story:** As a developer, I want the token detection logic to be testable and maintainable, so that I can verify correctness and add new detection methods.

#### Acceptance Criteria

1. WHEN implementing token detection THEN the Token Detection System SHALL separate detection logic from API communication
2. WHEN a new detection method is added THEN the Token Detection System SHALL allow registration without modifying existing detection code
3. WHEN running detection THEN the Token Detection System SHALL execute all registered detection methods and merge results
4. WHEN serializing detection results THEN the Token Detection System SHALL produce valid JSON that can be deserialized back to equivalent objects

