---
keywords: GLP,GMX,Glp,Gmx,GlpManager,RewardRouter,plvGLP,Taurus,TauDeFi
---
### GMX / GLP Integration
- GLP price: dependent on pool composition — large deposit/withdraw changes price
- GLP cooldown: 15-minute transfer cooldown after mint — can block vault operations
- GMX reward router: claimForAccount can be abused by anyone to claim rewards to wrong recipient
- GLP vault wrappers: assume 18 decimals for all collateral — breaks with non-18 decimal tokens
- Liquidation with GLP: GLP cannot be partially redeemed — must handle full position liquidation
- Swap in GLP vault: swap path with more than 2 tokens can revert
- GLP price oracle: uses AUM/supply which includes pending PnL — stale during high volatility
- Admin collateral theft: keeper/admin with swap privileges can redirect collateral via arbitrary swap path
- Liquidation frontrun: user can slightly increase collateral to prevent liquidation frontrunning the keeper
