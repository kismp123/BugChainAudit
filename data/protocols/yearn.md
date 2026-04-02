---
keywords: yearn,yVault,pricePerShare,yvToken,IYearnVault
---
### Yearn Vaults
- shares = deposit * totalShares / totalAssets (NOT 1:1 with tokens)
- pricePerShare can have different decimals than underlying
- emergencyWithdraw may not handle ETH vs ERC20 correctly
- Strategy loss reduces pricePerShare, affecting all depositors
- Vault can have withdrawal queue — withdraw may partially fill
- totalAssets includes unreported strategy gains (stale until harvest)
