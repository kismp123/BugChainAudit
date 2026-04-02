---
keywords: Initializable,OwnableUpgradeable,UUPSUpgradeable,TransparentUpgradeableProxy,ERC20Upgradeable
---
### OpenZeppelin Upgradeable
- initializer vs onlyInitializing: child contracts must use onlyInitializing
- Storage gaps (__gap) required to prevent slot collision on upgrade
- UUPS: _authorizeUpgrade must have access control
- Transparent proxy: admin cannot call implementation functions
- ERC20Permit: DOMAIN_SEPARATOR must update on chain fork
- ReentrancyGuard: _status slot must be in correct position after upgrade
