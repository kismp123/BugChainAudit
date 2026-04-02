---
keywords: IUniswapV3,ISwapRouter,INonfungiblePositionManager,slot0,sqrtPriceX96,UniswapV2,IUniswapV2Pair
---
### Uniswap V2/V3
- slot0().sqrtPriceX96 is spot price — trivially manipulable via flash loan
- Use TWAP (observe) instead of slot0 for pricing
- V3 positions are NFTs — each has unique liquidity range
- V2 pair.getReserves() also manipulable in same block
- V3 swap callback must validate caller is the pool contract
- exactInput vs exactOutput: slippage protection differs
- fee-on-transfer tokens break V2 pair accounting
