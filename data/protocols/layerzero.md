---
keywords: LayerZero,ILayerZeroEndpoint,lzSend,lzReceive,_toAddress,OFT,ONFT,LzApp
---
### LayerZero / Cross-chain
- _toAddress must be exactly 20 bytes — oversized causes silent failure
- nonce gaps can block message delivery on destination chain
- adapterParams gasLimit too low causes destination revert with no refund
- Failed messages stored in failedMessages — must retryPayload manually
- OFT: debitFrom on source burns/locks, creditTo on destination mints
- trustedRemoteLookup must match exactly — chain+address pair
