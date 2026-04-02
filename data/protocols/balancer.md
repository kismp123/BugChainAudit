---
keywords: IBalancerVault,IBalancerPool,IWeightedPool,joinPool,exitPool,getPoolTokens,ComposableStable
---
### Balancer
- Read-only reentrancy via getRate() / getActualSupply() during vault operations
- Composable pools: getActualSupply() ≠ totalSupply() (excludes pre-minted BPT)
- joinPool userData encoding differs per pool type (EXACT_TOKENS_IN, TOKEN_IN_FOR_EXACT_BPT_OUT)
- exitPool: EXACT_BPT_IN_FOR_TOKENS_OUT gives proportional exit
- Spot price from pairwise invariant incorrect for multi-token pools
- Flash loans via vault are free (no fee) — can be used for oracle manipulation
- Stable BPT valuation: don't use totalSupply — use getActualSupply (excludes pre-minted BPT)
- WeightedBPTOracle: getPrice must use getActualSupply, not totalSupply
- joinPool/exitPool with single token: high slippage risk, needs minAmountsOut protection
- Reward token swaps in closePositionFarm: fee deduction can be bypassed via lingering approvals
