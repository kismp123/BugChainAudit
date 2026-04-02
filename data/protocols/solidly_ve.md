---
keywords: Solidly,BaseV1,veNFT,Canto,CSR,turnstile,BaseV1Pair,BaseV1Router,BaseV1Factory,Velocimeter,Velodrome
---
### Solidly / ve(3,3) DEX
- BaseV1Pair: period size must be initialized on pair creation — default 0 breaks TWAP
- Token impersonation: anyone can deploy token with same name/symbol as existing stable
- token0TVL calculation: can be zero if reserves imbalanced, causing division errors
- Hardcoded USD pegs (1e18) break when stablecoin depegs
- unbounded loop in _claimFees/distribute can DoS with many gauges
- getUnderlyingPrice should return 0 on error, not revert — callers may not handle revert
- ve voting power doesn't decay if user doesn't vote again — stale voting weight persists
- Killed gauges: voting for killed gauge makes veNFT unpokeable
- Merge veNFT: merging loses unclaimed rewards from source NFT
- MAX_DELEGATES limit: can cause DoS on chains with lower gas limits
- First LP of stable pair: k formula with small amounts causes DoS/loss
- replaceFactory/addFactory: broken when gauge already exists for pair
