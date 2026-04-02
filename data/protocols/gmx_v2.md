---
keywords: gmx,v2,datastore,market,position,order,keeper,callback,price
---
### GMX V2
- Keeper execution: MEV extraction via order execution timing
- Price impact: pool imbalance manipulation for favorable execution
- Position: max leverage boundary — liquidation at exact threshold
- Funding rate: rate manipulation via large position open/close
- Market: disabled market still processes pending orders
- Callback: malicious callback in afterOrderExecution reverts keeper
- Oracle: block.timestamp price staleness on L2
- Swap: price impact pool vs oracle price divergence
- ADL: auto-deleverage ordering fairness
