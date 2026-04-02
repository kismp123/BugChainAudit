---
keywords: StakingModule,Telcoin,TEL,FeeBuyback,Plugin,TelcoinDistributor,slash
---
### Telcoin / TEL Staking
- Slash frontrun: stakers can monitor mempool and exit before slash() lands
- Flash stake+exit: flashloan TEL → stake → claim rewards → unstake → repay in same block
- Slashing revert: slash fails if one plugin's claim reverts — single plugin failure DoS all slashing
- Native token rescue: FeeBuyback's native tokens (MATIC/ETH) cannot be rescued — no rescue function for native
- msg.value sync: submit() doesn't validate msg.value matches amount parameter — native funds lost
- Unsafe ERC20: transfer/transferFrom return values not checked — silent failure with non-compliant tokens
- Plugin isolation: single plugin failure in claim loop reverts entire distribution transaction
