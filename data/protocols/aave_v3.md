---
keywords: aave,v3,pool,aToken,variableDebt,stableDebt,flashloan,liquidation,eMode
---
### Aave V3
- eMode: category misconfiguration allows excessive borrowing
- Isolation mode: debt ceiling bypass via collateral swap
- Supply/borrow caps: atomic deposit+borrow in same tx exceeds cap
- Siloed borrowing: cross-asset borrowing restrictions bypassable
- Flash loan: premium calculation precision, re-entrancy via onFlashLoan
- Liquidation: close factor manipulation, bonus calculation at boundary
- Price oracle: Chainlink aggregator switch, sequencer downtime on L2
- Variable rate: jump rate model manipulation via large borrow/repay
- aToken transfer: interest accrual during transfer window
