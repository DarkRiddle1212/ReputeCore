# Implementation Plan

- [x] 1. Create core type definitions and interfaces





  - [x] 1.1 Create detection types file with DetectionMethod, DetectedToken, DetectionOptions, DetectionResult, ScanMetadata, and EnrichedTokenSummary interfaces


    - Add to `lib/solana-detection/types.ts`
    - Include all type definitions from design document
    - _Requirements: 3.3, 4.1, 7.4_
  - [ ]* 1.2 Write property test for serialization round trip
    - **Property 13: Serialization Round Trip**
    - **Validates: Requirements 7.4**

- [x] 2. Implement ConfidenceScorer utility





  - [ ] 2.1 Create ConfidenceScorer class with calculateScore and sortByConfidence methods
    - Create `lib/solana-detection/ConfidenceScorer.ts`
    - Implement confidence score mapping per detection method
    - Implement descending sort by confidence
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 2.2 Write property test for confidence score validity
    - **Property 7: Confidence Score Validity**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**





  - [ ]* 2.3 Write property test for confidence-based sorting
    - **Property 8: Confidence-Based Sorting**
    - **Validates: Requirements 4.5**

- [-] 3. Implement DetectionCache with LRU eviction


  - [ ] 3.1 Create DetectionCache class with get, set, invalidate, and eviction logic
    - Create `lib/solana-detection/DetectionCache.ts`
    - Implement LRU eviction when maxEntries exceeded
    - Support configurable TTL
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ]* 3.2 Write property test for cache behavior
    - **Property 9: Cache Behavior**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 4. Implement MintAuthorityVerifier

  - [x] 4.1 Create MintAuthorityVerifier class to verify token creation via on-chain data

    - Create `lib/solana-detection/MintAuthorityVerifier.ts`
    - Query on-chain mint authority data
    - Return verification result with confidence and reason
    - _Requirements: 6.1, 6.3, 6.4_
  - [ ]* 4.2 Write property test for false positive prevention
    - **Property 10: False Positive Prevention**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
  - [ ]* 4.3 Write property test for exclusion logging
    - **Property 11: Exclusion Logging**
    - **Validates: Requirements 6.5**

- [x] 5. Checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.

- [-] 6. Implement detection strategies


  - [x] 6.1 Create DetectionStrategy interface and base implementation

    - Create `lib/solana-detection/strategies/DetectionStrategy.ts`
    - Define interface with name, priority, confidenceBase, and detect method
    - _Requirements: 7.1, 7.2_

  - [x] 6.2 Implement PumpFunDetector strategy

    - Create `lib/solana-detection/strategies/PumpFunDetector.ts`
    - Detect tokens via InitializeMint in Pump.fun transactions
    - Distinguish creation from purchase using verified on-chain data
    - Extract metadata (name, symbol, timestamp)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 6.3 Write property test for Pump.fun creation vs purchase distinction
    - **Property 1: Pump.fun Creation vs Purchase Distinction**
    - **Validates: Requirements 1.1, 1.2, 1.3**
  - [ ]* 6.4 Write property test for token metadata extraction
    - **Property 2: Token Metadata Extraction**
    - **Validates: Requirements 1.4**

  - [x] 6.5 Implement DASAPIDetector strategy

    - Create `lib/solana-detection/strategies/DASAPIDetector.ts`
    - Use Helius DAS API to find tokens by authority
    - Assign confidence score of 95
    - _Requirements: 3.1, 4.3_
  - [x] 6.6 Implement MintAuthorityDetector strategy



    - Create `lib/solana-detection/strategies/MintAuthorityDetector.ts`
    - Scan transactions for InitializeMint/InitializeMint2 instructions
    - Record detection method as "mint_authority_verified"
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ]* 6.7 Write property test for universal InitializeMint detection
    - **Property 4: Universal InitializeMint Detection**
    - **Validates: Requirements 3.1, 3.2**
  - [ ]* 6.8 Write property test for detection method recording
    - **Property 5: Detection Method Recording**
    - **Validates: Requirements 3.3**




- [ ] 7. Implement TokenDetectionOrchestrator
  - [ ] 7.1 Create TokenDetectionOrchestrator class
    - Create `lib/solana-detection/TokenDetectionOrchestrator.ts`
    - Implement strategy registration
    - Execute all strategies and merge results
    - Implement pagination up to 4000 transactions
    - Implement 90 second timeout
    - Return partial results with scan metadata
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.3_
  - [ ]* 7.2 Write property test for transaction scan limits
    - **Property 3: Transaction Scan Limits**



    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  - [ ]* 7.3 Write property test for strategy execution
    - **Property 12: Strategy Execution**
    - **Validates: Requirements 7.3**
  - [x] 7.4 Implement result deduplication with method preference






    - Deduplicate tokens detected by multiple methods
    - Prefer most reliable method (mint_authority_verified > das_api_authority > pump_fun_create > known_program > heuristic)
    - _Requirements: 3.4_
  - [x]* 7.5 Write property test for deduplication with method preference


    - **Property 6: Deduplication with Method Preference**
    - **Validates: Requirements 3.4**

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.






- [ ] 9. Integrate with existing HeliusProvider
  - [ ] 9.1 Update HeliusProvider to use TokenDetectionOrchestrator
    - Modify `lib/providers/helius.ts`
    - Replace existing detection methods with orchestrator
    - Maintain backward compatibility with existing TokenSummary interface
    - Wire up cache integration
    - _Requirements: 5.2, 5.3_
  - [ ] 9.2 Add forceRefresh support to bypass cache
    - Update getTokensCreated to check forceRefresh parameter
    - Bypass cache when forceRefresh is true
    - _Requirements: 5.3_
  - [ ] 9.3 Export new types and classes from lib/solana-detection/index.ts
    - Create index file with all exports
    - _Requirements: 7.1_

- [ ] 10. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
