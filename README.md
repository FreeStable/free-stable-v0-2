# FreeStable v0.2 - Stablecoin Research

> WIP - Work In Progress. For research purposes only!

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

## TODO

- liquidation function
- additional tests for liquidations
