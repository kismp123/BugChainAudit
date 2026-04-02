---
keywords: uniswap,v4,hook,singleton,flash,poolManager,beforeSwap,afterSwap,delta
---
### Uniswap V4
- Hooks: malicious hook in beforeSwap/afterSwap steals funds or causes DoS
- Singleton: all pools share one contract — cross-pool reentrancy
- Flash accounting: transient storage delta manipulation
- Dynamic fee: hook-controlled fee manipulation per swap
- Pool initialization: hook can brick pool at creation
- ERC-6909 claims: claim token accounting vs actual balances
- Donate: fee injection manipulation
- TickMath: boundary behavior at MIN_TICK/MAX_TICK
