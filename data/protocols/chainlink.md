---
keywords: AggregatorV3Interface,latestRoundData,priceFeed,chainlink,IOracle,roundId
---
### Chainlink Oracle
- latestRoundData can return stale price — check updatedAt vs heartbeat
- answeredInRound < roundId means round incomplete
- Price can be 0 or negative — must validate > 0
- Different feeds have different heartbeats (1h, 24h, etc.)
- Decimals vary per feed (8 for USD pairs, 18 for ETH pairs)
- L2 sequencer uptime feed should be checked before using prices
- WBTC/BTC ≠ BTC/USD — must account for depeg risk
