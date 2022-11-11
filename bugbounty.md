<h1>Ease</h1>

Live since: 07.04.2022</br>
KYC Required: No</br>
Max Bounty: USD 100 000</br>

<h2>Program overview</h2>

Ease wants to make DeFi as easy and safe as possible. We aim to cover every dollar in DeFi so that users can finally feel at ease. The core members of the ease team have been around for a long time. Some of us already worked with David Chaum on DigiCash/eCash many eons ago. Others made the first NFT derivatives. All of us have been interested in blockchain technology and its societal impact for many years.
For more information about Ease, please visit https://ease.org/.

<h2>Rewards by threat level</h2>
Rewards are distributed according to the impact of the vulnerability based on the Immunefi Vulnerability Severity Classification System V2. This is a simplified 5-level scale, with separate scales for websites/apps, smart contracts, and blockchains/DLTs, focusing on the impact of the vulnerability reported.

<h2>Smart Contracts</h2>

Critical: USD 100 000</br>
High: USD 15 000</br>
Medium: USD 5 000</br>
Low: USD 1 000</br>

All High and Critical Smart Contract bug reports require a PoC to be eligible for a reward. Explanations and statements are not accepted as PoC and code is required.

The following vulnerabilities are not eligible for a reward:

- All vulnerabilities marked in the security reviews are not eligible for a reward
- Reports about losses from governance attacks/off-chain exploits
- Griefing regarding capacity or capacity going over the limit

Payouts are handled by the Ease team directly and are denominated in USD. However, payouts are done in USDC.

<h2>Assets in Scope</h2>

Target | Type</br></br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/core/adapters/RcaShieldAave.sol | Smart Contract - RcaShieldAave</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/core/adapters/RcaShieldCompound.sol | Smart Contract - RcaShieldCompound</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/core/adapters/RcaShieldConvex.sol | Smart Contract - RcaShieldConvex</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/core/adapters/RcaShieldOnsen.sol | Smart Contract - RcaShieldOnsen</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/core/RcaController.sol | Smart Contract - RcaController</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/core/RcaShield.sol | Smart Contract - RcaShield</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/core/RcaShieldBase.sol | Smart Contract - RcaShieldBase</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/core/RcaShieldNormalized.sol | Smart Contract - RcaShieldNormalized</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/core/RcaTreasury.sol | Smart Contract - RcaTreasury</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/external/Aave.sol | Smart Contract - Aave</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/external/Compound.sol | Smart Contract - Compound</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/external/Convex.sol | Smart Contract - Convex</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/external/NexusMutual.sol | Smart Contract - NexusMutual</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/external/Sushiswap.sol | Smart Contract - Sushiswap</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/general/Governable.sol | Smart Contract - Governable</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/general/RcaGovernable.sol | Smart Contract - RcaGovernable</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/interfaces/IRcaController.sol | Smart Contract - RcaController</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/interfaces/IRcaShield.sol | Smart Contract - RcaShield</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/interfaces/IRouter.sol | Smart Contract - IRouter</br>
https://github.com/EaseDeFi/ease-rca/blob/master/contracts/library/MerkleProof.sol | Smart Contract - MerkleProof</br>

If an impact can be caused to any other asset managed by Ease that isn’t on this table but for which the impact is in the Impacts in Scope section below, you are encouraged to submit it for the consideration by the project. This only applies to Critical impacts.

<h2>Impacts in Scope</h2>

Only the following impacts are accepted within this bug bounty program. All other impacts are not considered as in-scope, even if they affect something in the assets in scope table.

<h2>Smart Contracts</h2>

<b>Critical</b>

Theft or irredeemable freezing of user funds of more than 50% of the assets in any vault.

<b>High</b>

Theft of funds or unsold yield of more than 1%, but less than 50% assets in any vault.
Permanent freezing of unsold yield.
Adapter for a protocol being broken to the point where it will not receive rewards that should be given.

<b>Medium</b>

Theft or freezing of funds of less than 1% assets, but greater than a negligible amount.
Non-privileged griefing (e.g. no profit motive for an attacker, but damage to the users or the protocol).
Adapters lacking the ability to get full normal rewards that the protocol returns (i.e. if the protocol gives 2 rewards tokens but the vault can only withdraw 1).

<b>Low</b>

Smart contract fails to deliver promised returns, but doesn’t lose more than a negligible amount of funds.

<b>In case of discrepancy between Immunefi Vulnerability Severity Classification System V2 and Ease’s classification above, Ease’s classification will be followed.</b>

<h2>Particularly Vulnerable Areas:</h2>

- Decimal problems. We’re starting with Compound and a few USDC contracts that require normalization so we must prevent any problems as this would likely lead to a critical.
- Protocol composability problems. Each shield adapter functions differently and there could be high or critical severity problems here.
- Conversion rates. On mint/redeem if our calculations are off this could easily lead to criticals.
- Merkle trees for pricing or liquidation amounts being able to be manipulated in some way.

<h2>Out of Scope & Rules</h2>

The following vulnerabilities are excluded from the rewards for this bug bounty program:

- Attacks that the reporter has already exploited themselves, leading to damage
- Attacks requiring access to leaked keys/credentials
- Attacks requiring access to privileged addresses (governance, strategist)
- Smart Contracts and Blockchain
- Incorrect data supplied by third party oracles
- Not to exclude oracle manipulation/flash loan attacks
- Basic economic governance attacks (e.g. 51% attack)
- Lack of liquidity
- Best practice critiques
- Sybil attacks
- Centralization risks
- Arbitrage tricks (not complete attacks but ways for arbitrageurs to get extra funds, such as depositing funds into a shield then buying rewards themselves)

The following activities are prohibited by this bug bounty program:

- Any testing with mainnet or public testnet contracts; all testing should be done on private testnets
- Any testing with pricing oracles or third party smart contracts
- Attempting phishing or other social engineering attacks against our employees and/or customers
- Any testing with third party systems and applications (e.g. browser extensions) as well as websites (e.g. SSO providers, advertising networks)
- Any denial of service attacks
- Automated testing of services that generates significant amounts of traffic
- Public disclosure of an unpatched vulnerability in an embargoed bounty
