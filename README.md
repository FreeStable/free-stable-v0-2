# FreeStable v0.2 - Stablecoin Research

This repository hosts an experiment implementation of a FreeStable stablecoin (version 0.2). The test uses a EUR-pegged version (FreeEUR), but it can be used for any currency.

The concept description: https://github.com/FreeStable/freestable-concept 

**Features:**

- Collateralized with **ETH only**
- Collateralization ratio at 120% by default, can be changed by governance*
- A **burning fee** instead of an interest rate
- Collateral **lock** until debt is repaid
- Regular debt repayments (instalments)*
- Liquidations allowed* (under certain conditions: the last debt instalment not paid in time, the coll. ratio below 110%)

*A star denotes a change from the previous version

Note that the amount of locked collateral **does not decrease** with the collateral price increasing (as it is the case with Synthetix minting). But you can unlock a percentage of the collateral by repaying the same percentage of your debt.

## Potential design changes

The following ideas may be implemented in one of the future versions.

### Allow user to mint at a higher collateralization ratio if they want

Currently the users cannot choose the size of coll. ratio, it is automatically set at the amount defined by the governance. Instead the user could be allowed to set a higher coll. ratio when calling the minting function.

### Both fixed and relative minimum instalment amount

In v0.2, the minimal required instalment amount is fixed, which is not optimal. The v0.3 version will have both relative and fixed minimal instalment amounts. The lower one will be the threshold.

### Partial liquidations

Allow liqiudators to liquidate only part of a minter's collateral (meaning only part of the debt is returned).

### Compensating liquidators in case collateralization ratio is below 100%

In case a liquidation is only possible after the collateralization ratio has already fallen below 100%, the liquidator could be compensated with governance tokens (up to the 100% ratio value).

It might be good if there's a cap on how much of gov tokens can a liquidator receive as reward (for example, not more than 5% of total gov token supply).
