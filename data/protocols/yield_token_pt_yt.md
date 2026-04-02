---
keywords: Tranche,YieldToken,Principal,PT,YT,Napier,NapierPool,Pendle,SFrxETH,Adapter,maturity,prefundedDeposit
---
### Yield Token / PT+YT Protocols (Napier, Pendle, Sense)
- PT+YT split: anyone can convert someone's unclaimed yield to PT+YT without authorization
- LP token always valued at fixed PT ratio (e.g., 3 PTs) — incorrect during/after maturity
- swapUnderlyingForYt rounding: small amounts revert due to pyIssued < pyDesired
- Adapter deposit conditions: _stake returning 0 not handled, blocking deposits
- SFrxETH redemption queue: only one pending request allowed, creates DoS
- Pool verification: NapierRouter pool verification prone to CREATE2 collision attacks
- YT holder claim: interest claim fails if adapter.scale() stale or yield accrual not synced before transfer
- Protocol fees: pool owner can unfairly increase fees, totalUnderlying includes uncollected fees
- Slippage on issue: no slippage control in prefundedDeposit/issue — sandwich vulnerable
- First depositor: donation/inflation attack on prefundedDeposit share calculation
- ERC5095 non-compliance: withdraw/redeem don't match ERC5095 spec
- Paused tranche: users unable to collect yield when tranche is paused
- External admin: FRAX/Lido admin can adjust fee rates harming integrators
- Permissioned rebalancing: targetBufferPercentage change takes effect immediately, destabilizes buffer
