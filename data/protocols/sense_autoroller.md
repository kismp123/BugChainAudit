---
keywords: AutoRoller,Divider,Sense,RollerPeriphery,Space,RollerUtils,Crop
---
### Sense Protocol / AutoRoller
- AutoRoller brick: adversary creates another AutoRoller on same adapter, blocking operations
- RollerUtils hardcoded address: divider address hardcoded in RollerUtils — incorrect on some deployments
- eject() drains YT yield: entire contract balance transferred to single receiver, stealing yield from other holders
- roll revert: if lastSettle is zero, ERC4626 deposit reverts because previewDeposit returns 0
- ERC4626 non-compliance: previewWithdraw doesn't round up per spec
- fillQuote uses transfer(): ETH transfer via .transfer() with 2300 gas limit — fails for contract wallets
- RollerPeriphery.approve(): permissionless — anyone can approve arbitrary spender for contract's tokens
- Crop.setRewardToken: orphans unclaimed rewards when changing reward token
- Solidity optimizer bug: memory side effects of inline assembly can cause incorrect behavior
- sponsorSeries: fails when user wants to swap underlying for stake token
- Protocol fee refund: refund sent to wrong user (msg.sender vs original payer)
