# FreeStable v0.2 - Stablecoin Research

> WIP - Work In Progress

This repository hosts an experiment implementation of a FreeStable stablecoin (version 0.2). The test uses a EUR-pegged version (FreeEUR), but it can be used for any currency.

The concept description: https://github.com/FreeStable/freestable-concept 

**Features:**

- Collateralized with **ETH only** (collateralization ratio at 120% by default, can be changed by governance)
- A **burning fee** instead of an interest rate
- Collateral **lock** until debt is repaid
- Regular debt repayments
- Liquidations allowed (under certain conditions: the last debt instalment not paid in time, the coll. ratio below 110%)

Note that the amount of locked collateral **does not decrease** with the collateral price increasing (as it is the case with Synthetix minting). But you can unlock a percentage of the collateral by repaying the same percentage of your debt.

## Potential design changes

### Allow user to mint at a higher collateralization ratio if they want

Currently the users cannot choose the size of coll. ratio, it is automatically set at the amount defined by the governance.

## TODO

- adapt the tests from v0.1
- a burn test for when coll. ratio is below 120%
- a minimum required instalment amount (absolute or relative amount? Probably relative/basis points)
- liquidation function
- additional tests for liquidations
- governance: a function to change the coll. ratio
