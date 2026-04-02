---
keywords: compound,cToken,IComptroller,exchangeRateStored,CEther,CToken
---
### Compound (cTokens)
- exchangeRate = (totalCash + totalBorrows - totalReserves) / totalSupply
- Accruing interest changes exchangeRate between calls
- enterMarkets required before borrowing against collateral
- Liquidation incentive is a multiplier (1.08 = 8% bonus)
- CEther uses msg.value; CErc20 uses transferFrom — different interfaces
- healAccount/liquidateAccount must distribute pending rewards before seizure
- blocksPerYear constant differs per chain (Ethereum vs L2)
- _ensureMaxLoops can cause legitimate multi-position operations to revert
- Exiting market doesn't settle all state — post-exit liquidation possible
