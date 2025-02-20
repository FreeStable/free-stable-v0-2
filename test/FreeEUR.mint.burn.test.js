const {
  BN,           // Big Number support 
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
  time          // Time manipulation library
} = require('@openzeppelin/test-helpers');

const { assert } = require("chai");

// helper
const ether = (n) => web3.utils.toWei(n.toString(), 'ether');

// artifacts
const FreeStablecoin = artifacts.require("FreeStablecoin");

contract("FreeStablecoin", accounts => {
  let instance;

  const governance = accounts[0];
  const sender = accounts[1];
  const beneficiary = accounts[2];
  const sender2 = accounts[3];

  const name = "FreeEUR";
  const symbol = "frEUR";

  before(async () => {
    // before() is run only once at the start of the contract
    instance = await FreeStablecoin.new(name, symbol);
  });

  describe("Minting and burning", () => {
    let ethValue = 1;
    let ethPrice = 500;
    let collRatio = 1.20; //$120 in ETH mints you $100 in frEUR

    it("mints stablecoins for the sender", async () => {
      const mint = await instance.mintStablecoin({
        from: sender,
        value: ether(ethValue)
      });

      // gas used: 129599
      // console.log("Gas used (mintStablecoin): " + mint.receipt.gasUsed);

      expectEvent(mint, "Transfer", {
        from: constants.ZERO_ADDRESS,
        to: sender,
        //value: String(ether(ethValue*ethPrice/collRatio))
      });

      const collateralAmount = await instance.getCollateralAmount(sender);
      assert.equal(collateralAmount, ether(ethValue)); // 1 ETH

      const debtAmount = await instance.getDebtAmount(sender);
      assert.equal(
        Number(debtAmount), // around 416.66 frEUR
        Number(ether(ethValue*ethPrice/collRatio))
      );

      const stablecoinBalance = await instance.balanceOf(sender);
      assert.equal(Number(stablecoinBalance), Number(ether(ethValue*ethPrice/collRatio))); // around 416.66 frEUR
    });
    
    it("mints stablecoins for another account (beneficiary)", async () => {
      // sender mints stablecoin for beneficiary
      const mint = await instance.mintStablecoinFor(beneficiary, {
        from: sender,
        value: ether(ethValue)
      });

      // gas used: 115036
      // console.log("Gas used (mintStablecoinFor): " + mint.receipt.gasUsed);

      expectEvent(mint, "Transfer", {
        from: constants.ZERO_ADDRESS,
        to: beneficiary,
        //value: ether(ethValue*ethPrice)
      });

      // the collateral should be in the name of the beneficiary
      const collateralAmount = await instance.getCollateralAmount(beneficiary);
      assert.equal(collateralAmount, ether(ethValue));

      // the debt should be in the name of the beneficiary
      const debtAmount = await instance.getDebtAmount(beneficiary);
      assert.equal(
        Number(debtAmount), // around 416.66 frEUR
        Number(ether(ethValue*ethPrice/collRatio))
      );

      const stablecoinBalance = await instance.balanceOf(beneficiary);
      assert.equal(Number(stablecoinBalance), Number(ether(ethValue*ethPrice/collRatio))); // around 416.66 frEUR
    });

    it("fetches minters addresses from minters array", async () => {
      const length = await instance.getMintersArrayLength();
      assert.equal(Number(length), 2);

      const minter1 = await instance.getMinterAddressByIndex(0);
      assert.equal(minter1, sender);

      const minter2 = await instance.getMinterAddressByIndex(1);
      assert.equal(minter2, beneficiary);
    });
    
    it("partly burns stablecoins", async () => {
      // sender decides to burn some stablecoins and reduce their own debt

      const ethBalanceSenderBefore = await web3.eth.getBalance(sender);
      const ethBalanceGovernanceBefore = await web3.eth.getBalance(governance);

      const collateralAmountBefore = await instance.getCollateralAmount(sender);
      assert.equal(collateralAmountBefore, ether(1));

      const stablecoinBalanceBefore = await instance.balanceOf(sender);
      assert.equal(Number(stablecoinBalanceBefore), Number(ether(ethValue*ethPrice/collRatio))); // around 416.66 frEUR

      let stablecoinsToBurn = String(stablecoinBalanceBefore/3); // burn 33% (a third) of your stablecoins

      // get the last instalment timestamp (should be the minting time)
      const instalmentTimestampBefore = await instance.getLastInstalment(sender);
      
      const burn = await instance.burnStablecoin(stablecoinsToBurn, {
        from: sender
      });

      // gas used: 79965
      // console.log("Gas used (burnStablecoin): " + burn.receipt.gasUsed);

      expectEvent(burn, "Transfer", {
        from: sender,
        to: constants.ZERO_ADDRESS,
        value: stablecoinsToBurn
      });

      // get the new instalment timestamp (should be the burn time)
      const instalmentTimestampAfter = await instance.getLastInstalment(sender);
      assert.isTrue(instalmentTimestampAfter > instalmentTimestampBefore); // new timestamp is bigger than the old one

      // the collateral for sender has been reduced from 1 ETH by a third (33%)
      const collateralAmountAfter = await instance.getCollateralAmount(sender);
      assert.equal(Number(collateralAmountAfter), Number(ether(0.67))); // 67% (approx. two thirds) remaining as a collateral

      const debtAmount = await instance.getDebtAmount(sender);
      assert.equal(Number(debtAmount), Number(ether(ethValue*ethPrice/collRatio)-stablecoinsToBurn));

      const stablecoinBalanceAfter = await instance.balanceOf(sender);
      assert.equal(Number(stablecoinBalanceAfter), ether(ethValue*ethPrice/collRatio)-stablecoinsToBurn);

      // sender's ETH balance is now bigger because sender got part of the collateral back (a bit less than 0.33 ETH)
      const ethBalanceSenderAfter = await web3.eth.getBalance(sender);

      assert.approximately(
        Number(ethBalanceSenderAfter)-Number(ethBalanceSenderBefore),
        Number(collateralAmountBefore)-Number(collateralAmountAfter),
        Number(ether(0.01)) // the difference are both the burn fee & gas fee
      );

      // the governance earned approx. 0.0033 ETH as the burn fee
      const ethBalanceGovernanceAfter = await web3.eth.getBalance(governance);
      const burnFee = await instance.getBurnFee();
      const collateralUnlocked = Number(collateralAmountBefore)-Number(collateralAmountAfter);
      const burnFeeTotal = collateralUnlocked*(burnFee/10000);
      assert.approximately(
        Number(ethBalanceGovernanceAfter)-Number(ethBalanceGovernanceBefore), 
        Number(burnFeeTotal),
        Number(10000000));
    });

    it("fails at burning because the instalment amount is too low", async () => {
      const ethBalanceBefore = await web3.eth.getBalance(sender);

      const collateralAmountBefore = await instance.getCollateralAmount(sender);

      const debtAmountBefore = await instance.getDebtAmount(sender);

      // stablecoin balance before the first burn
      const initialStablecoinBalance = Number(ether(ethValue*ethPrice/collRatio));

      // stablecoin balance now (after the first burn)
      const stablecoinBalanceBefore = await instance.balanceOf(sender);
      assert.equal(Number(stablecoinBalanceBefore), initialStablecoinBalance-(initialStablecoinBalance/3));

      let stablecoinsToBurn = ether(5); // 5frEUR, which is too low (minimum is 10 frEUR)
      
      await expectRevert(
        instance.burnStablecoin(stablecoinsToBurn, {
          from: sender
        }),
        "The _stablecoinAmount sent is lower than both the required minimum and the debt."
      );

      const debtAmountAfter = await instance.getDebtAmount(sender);
      assert.equal(Number(debtAmountBefore), Number(debtAmountAfter));

      const collateralAmountAfter = await instance.getCollateralAmount(sender);
      assert.equal(Number(collateralAmountAfter), Number(collateralAmountBefore));

      const stablecoinBalanceAfter = await instance.balanceOf(sender);
      assert.equal(Number(stablecoinBalanceAfter), Number(stablecoinBalanceBefore));

      const ethBalanceAfter = await web3.eth.getBalance(sender);
      assert.approximately(
        Number(ethBalanceBefore),
        Number(ethBalanceAfter),
        Number(ether(0.003)) // difference due to gas cost of the reverted tx
      );
    });

    it("burns the rest of the sender's stablecoins", async () => {
      const ethBalanceBefore = await web3.eth.getBalance(sender);

      const collateralAmountBefore = await instance.getCollateralAmount(sender);

      // stablecoin balance before the first burn
      const initialStablecoinBalance = Number(ether(ethValue*ethPrice/collRatio));

      // stablecoin balance now (after the first burn)
      const stablecoinBalanceBefore = await instance.balanceOf(sender);
      assert.equal(Number(stablecoinBalanceBefore), initialStablecoinBalance-(initialStablecoinBalance/3));

      let stablecoinsToBurn = String(stablecoinBalanceBefore); // burn the whole balance
      
      const burn = await instance.burnStablecoin(stablecoinsToBurn, {
        from: sender
      });

      // gas used: 37356
      // console.log("Gas used (burnStablecoin): " + burn.receipt.gasUsed);

      expectEvent(burn, "Transfer", {
        from: sender,
        to: constants.ZERO_ADDRESS,
        value: stablecoinsToBurn
      });

      const collateralAmountAfter = await instance.getCollateralAmount(sender);
      assert.equal(collateralAmountAfter, 0);

      const debtAmount = await instance.getDebtAmount(sender);
      assert.equal(debtAmount, 0);

      const stablecoinBalanceAfter = await instance.balanceOf(sender);
      assert.equal(stablecoinBalanceAfter, 0);

      const ethBalanceAfter = await web3.eth.getBalance(sender);
      assert.approximately(
        Number(ethBalanceBefore)+Number(collateralAmountBefore)-(Number(collateralAmountBefore)*0.01), // 0.01 is burn fee
        Number(ethBalanceAfter),
        Number(ether(0.003)) // difference due to gas cost
      );
    });

    it("allows sender to burn stablecoins to benefit another user (beneficiary)", async () => {
      // sender needs to mint some frEUR because it doesn't have any right now
      const mint = await instance.mintStablecoin({
        from: sender,
        value: ether(0.5)
      });

      const ethBalanceSenderBefore = await web3.eth.getBalance(sender);

      const ethBalanceBeneficiaryBefore = await web3.eth.getBalance(beneficiary);

      const collateralAmountBefore = await instance.getCollateralAmount(beneficiary);
      assert.equal(Number(collateralAmountBefore), ether(1));

      const stablecoinBalanceBefore0 = await instance.balanceOf(sender);
      assert.equal(Number(stablecoinBalanceBefore0), Number(ether(250/collRatio))); // 208.33 frEUR

      const stablecoinBalanceBefore1 = await instance.balanceOf(beneficiary);
      assert.equal(Number(stablecoinBalanceBefore1), ether(500/collRatio)); // 416.67 frEUR

      let stablecoinsToBurn = String(Number(stablecoinBalanceBefore1)/3); // burn one third of the beneficiaries debt
      
      // sender burns their stablecoin to benefit beneficiary
      const burn = await instance.burnStablecoinFor(stablecoinsToBurn, beneficiary, {
        from: sender
      });

      // gas used: 80300
      // console.log("Gas used (burnStablecoinFor): " + burn.receipt.gasUsed);

      expectEvent(burn, "Transfer", {
        from: sender,
        to: constants.ZERO_ADDRESS,
        value: stablecoinsToBurn
      });

      const collateralAmountAfter = await instance.getCollateralAmount(beneficiary);
      assert.equal(Number(collateralAmountAfter), ether(0.67)); // 33% less collateral (one third)

      const debtAmount = await instance.getDebtAmount(beneficiary);
      assert.equal(debtAmount, ether(ethValue*ethPrice/collRatio)-stablecoinsToBurn);

      // stablecoin balance of the person that burned the tokens (sender)
      const stablecoinBalanceAfter0 = await instance.balanceOf(sender);
      assert.approximately(
        Number(stablecoinBalanceAfter0), 
        Number(stablecoinBalanceBefore0)-Number(stablecoinsToBurn),
        Number(ether(0.000001)) // rounding error
        );

      let burnFee = ether(0.0033);

      // sender's ETH balance should go down
      const ethBalanceSenderAfter = await web3.eth.getBalance(sender);
      assert.isTrue(ethBalanceSenderAfter < ethBalanceSenderBefore);

      // the beneficiary's ETH balance goes up for the unlocked collateral minus the burn fee
      const ethBalanceBeneficiaryAfter = await web3.eth.getBalance(beneficiary);
      assert.approximately(
        Number(ethBalanceBeneficiaryAfter-ethBalanceBeneficiaryBefore), 
        Number(ether(0.33)-burnFee),
        Number(82000) // error of margin due to dust
      );
    });

    it("doesn't burn as much as sender wanted due to lower actual frEUR balance", async () => {
      // sender attempts to reduce debt of the beneficiary
      // the problem is that sender has less frEUR tokens than sent
      const stablecoinBalanceBefore = await instance.balanceOf(sender);

      let stablecoinsToBurn = Number(stablecoinBalanceBefore) * 2; // tries to burn 2x more stablecoin than it has

      const debtAmountBefore = await instance.getDebtAmount(beneficiary);
      assert.equal(Number(debtAmountBefore), ether(277.77777777777777));
      
      // sender burns their stablecoin to benefit beneficiary
      const burn = await instance.burnStablecoinFor(String(stablecoinsToBurn), beneficiary, {
        from: sender
      });

      // gas used: 65292
      // console.log("Gas used (burnStablecoinFor - lower balance): " + burn.receipt.gasUsed);

      expectEvent(burn, "Transfer", {
        from: sender,
        to: constants.ZERO_ADDRESS,
        value: String(stablecoinBalanceBefore) // the actual burn should be what the sender actually has, not the amount that was specified as argument
      });

      const debtAmountAfter = await instance.getDebtAmount(beneficiary); // 208.33 frEUR
      assert.approximately(
        Number(debtAmountBefore)-Number(debtAmountAfter), 
        Number(stablecoinBalanceBefore),
        Number(ether(0.000001))
      );
    });

    it("fails at burning because sender's frEUR balance is 0", async () => {
      // sender attempts to reduce debt of the beneficiary
      // the problem is that sender does not have any frEUR tokens
      const stablecoinBalanceBefore = await instance.balanceOf(sender);
      assert.equal(stablecoinBalanceBefore, 0);

      const stablecoinsToBurn = ether(200); // 200 frEUR

      const debtAmountBefore = await instance.getDebtAmount(beneficiary);

      const collateralAmountBefore = await instance.getCollateralAmount(beneficiary);

      // the tx should fail because account 0's frEUR balance is 0
      await expectRevert(
        instance.burnStablecoinFor(stablecoinsToBurn, beneficiary, {from: sender}), // trying to burn 200 frEUR
        "Sender's token balance is 0."
      );

      // the beneficiary's debt & collateral amounts should have stayed the same
      const debtAmountAfter = await instance.getDebtAmount(beneficiary);
      assert.equal(Number(debtAmountAfter), Number(debtAmountBefore));

      const collateralAmountAfter = await instance.getCollateralAmount(beneficiary);
      assert.equal(Number(collateralAmountAfter), Number(collateralAmountBefore));

    });
    
    it("burns less than specified amount of stablecoin due to debt being lower than that", async () => {
      // Beneficiary will burn the whole debt, but will send a bigger amount of stablecoin than really needed.
      // Because sender was burning frEUR for beneficiary previously, the beneficiary actually holds more frEUR than his debt is.
      const debtAmountBefore = await instance.getDebtAmount(beneficiary); // 208.33 frEUR
      assert.equal(Number(debtAmountBefore), ether(208.33333333333334));

      const stablecoinBalanceBefore = await instance.balanceOf(beneficiary); // 416.67 frEUR
      assert.equal(Number(stablecoinBalanceBefore), ether(416.6666666666667));

      const ethBalanceBefore = await web3.eth.getBalance(beneficiary);
      
      // try to burn the whole stablecoin balance (even though the debt is lower than that)
      const burn = await instance.burnStablecoin(stablecoinBalanceBefore, {
        from: beneficiary
      });

      // gas used: 44720
      // console.log("Gas used (burnStablecoin - lower debt): " + burn.receipt.gasUsed);

      expectEvent(burn, "Transfer", {
        from: beneficiary,
        to: constants.ZERO_ADDRESS,
        value: debtAmountBefore // the real amount of burned tokens should be 250 frEUR (not 500)
      });

      const debtAmountAfter = await instance.getDebtAmount(beneficiary);
      assert.equal(debtAmountAfter, 0); // all debt is repaid

      const collateralAmount = await instance.getCollateralAmount(beneficiary);
      assert.equal(collateralAmount, 0); // all collateral is returned (minus the burn fee)

      const stablecoinBalanceAfter = await instance.balanceOf(beneficiary);
      assert.equal(stablecoinBalanceAfter, stablecoinBalanceBefore-debtAmountBefore);

      const ethBalanceAfter = await web3.eth.getBalance(beneficiary);
      assert.isTrue(ethBalanceBefore < ethBalanceAfter);
    });

    it("burn when coll. ratio is BELOW threshold", async () => {
      // sender2's debt initial
      const debtAmountBefore = await instance.getDebtAmount(sender2);
      assert.equal(Number(debtAmountBefore), 0);

      // sender2's stablecoin balance initial
      const stablecoinBalanceBefore = await instance.balanceOf(sender2);
      assert.equal(Number(stablecoinBalanceBefore), 0);

      // sender2 needs to mint some frEUR because it doesn't have any right now
      const mint = await instance.mintStablecoin({
        from: sender2,
        value: ether(1)
      });

      // sender2's debt after mint
      const debtAmountAfterMint = await instance.getDebtAmount(sender2);
      assert.equal(Number(debtAmountAfterMint), ether(416.6666666666667)); // 416.67 frEUR

      // sender2's stablecoin balance after mint
      const stablecoinBalanceAfterMint = await instance.balanceOf(sender2);
      assert.equal(Number(stablecoinBalanceAfterMint), ether(416.6666666666667)); // 416.67 frEUR

      const collRatioBefore = await instance.getCollRatioOf(sender2);
      assert.equal(collRatioBefore, 120);

      // raise the coll. ratio to 150%
      const newCollRatio = 150;
      let changeCollRatio = await instance.changeCollRatio(String(newCollRatio), {from: governance});

      const amountToBurn = ether(100); // burn 100 frEUR

      // now do the burn
      const burn = await instance.burnStablecoin(amountToBurn, {
        from: sender2
      });

      // gas used: 85599
      // console.log("Gas used (burnStablecoin - ratio below threshold): " + burn.receipt.gasUsed);

      expectEvent(burn, "Transfer", {
        from: sender2,
        to: constants.ZERO_ADDRESS,
        value: amountToBurn
      });

      // check whether coll. ratio is now 150% as required
      const collRatioAfter = await instance.getCollRatioOf(sender2);
      assert.equal(Number(collRatioAfter), 150);

    });

    it("burn when coll. ratio is ABOVE threshold", async () => {
      // sender2's debt before burn
      const debtAmountBefore = await instance.getDebtAmount(sender2);
      assert.equal(Number(debtAmountBefore), ether(316.6666666666667));

      // sender2's stablecoin balance before burn
      const stablecoinBalanceBefore = await instance.balanceOf(sender2);
      assert.equal(Number(stablecoinBalanceBefore), ether(316.6666666666667));

      // sender2's coll. ratio before burn
      const collRatioBefore = await instance.getCollRatioOf(sender2);
      assert.equal(collRatioBefore, 150);

      // lower the coll. ratio to 130%
      const newCollRatio = 130;
      let changeCollRatio = await instance.changeCollRatio(String(newCollRatio), {from: governance});

      const amountToBurn = ether(100); // burn 100 frEUR

      // now do the burn
      const burn = await instance.burnStablecoin(amountToBurn, {
        from: sender2
      });

      // gas used: 85599
      // console.log("Gas used (burnStablecoin - ratio above threshold): " + burn.receipt.gasUsed);

      expectEvent(burn, "Transfer", {
        from: sender2,
        to: constants.ZERO_ADDRESS,
        value: amountToBurn
      });

      // coll. ratio for sender2 is now lowered to approx. 130%
      const collRatioAfter = await instance.getCollRatioOf(sender2);
      assert.approximately(
        Number(collRatioAfter), 
        Number(130),
        1);

      // sender2's debt after burn
      const debtAmountAfter = await instance.getDebtAmount(sender2);
      assert.equal(Number(debtAmountAfter), ether(216.66666666666666));

      // sender2's stablecoin balance after burn
      const stablecoinBalanceAfter = await instance.balanceOf(sender2);
      assert.equal(Number(stablecoinBalanceAfter), ether(216.66666666666666));

    });

    it("fails to liquidate a user (stablecoinAmount too low)", async () => {
      // minter: sender2
      // liquidator: sender
      let liquidator = sender;

      // sender2 and beneficiary need to send some frEUR to liquidator (because liquidator does not have any right now)
      await instance.transfer(liquidator, ether(200), {from: sender2});
      await instance.transfer(liquidator, ether(200), {from: beneficiary});

      // liquidator's stablecoin balance is now 400 frEUR
      const stablecoinBalance = await instance.balanceOf(liquidator);
      assert.equal(Number(stablecoinBalance), ether(400));

      const stablecoinAmount = ether(50); // 50 frEUR

      await expectRevert(
        instance.liquidateVault(sender2, stablecoinAmount, {from: liquidator}),
        "The entered stablecoin amount is too low"
      );
    });

    it("fails to liquidate a user (coll. ratio not below threshold)", async () => {
      // minter: sender2
      // liquidator: sender
      let liquidator = sender;

      // sender2's debt amount before
      const debtAmountBefore = await instance.getDebtAmount(sender2);
      assert.equal(Number(debtAmountBefore), ether(216.66666666666666));

      const stablecoinAmount = ether(220); // 220 frEUR (can be above debt value, just not below)

      await expectRevert(
        instance.liquidateVault(sender2, stablecoinAmount, {from: liquidator}),
        "Collateralization ratio is not below the required value"
      );
    });

    it("fails to liquidate a user (coll. ratio below threshold, but max time between instalments not exceeded)", async () => {
      // minter: sender2
      // liquidator: sender
      let liquidator = sender;

      // confirm that sender2's coll. ratio is 131%
      const collRatioSender2 = await instance.getCollRatioOf(sender2);
      assert.equal(Number(collRatioSender2), 131);

      // raise the required coll. ratio to 200% (sender2 has coll. ratio of 131%)
      await instance.changeCollRatio(String(200), {from: governance});

      const stablecoinAmount = ether(220); // 220 frEUR

      await expectRevert(
        instance.liquidateVault(sender2, stablecoinAmount, {from: liquidator}),
        "Max time between instalments not exceeded"
      );
    });

    it("fully liquidates a collateral", async () => {
      // minter: sender2
      // liquidator: sender
      let liquidator = sender;

      // sender2's debt amount before
      const debtAmountBefore2 = await instance.getDebtAmount(sender2);
      assert.equal(Number(debtAmountBefore2), ether(216.66666666666666));

      // sender2 & liquidator's ETH balances before
      const ethBalanceBeforeSender2 = await web3.eth.getBalance(sender2);
      const ethBalanceBeforeLiquidator = await web3.eth.getBalance(liquidator);

      // fast forward in time so that user misses the instalment payment and can now be liquidated
      await time.increase(time.duration.days(31)); // max time is 30 days

      // liquidation
      let stablecoinAmount = ether(220);
      let liquidation = await instance.liquidateVault(sender2, stablecoinAmount, {from: liquidator});

      // sender2's debt amount after
      const debtAmountAfter = await instance.getDebtAmount(sender2);
      assert.equal(Number(debtAmountAfter), 0);

      // sender2's collateral amount after
      const collAmountAfter = await instance.getCollateralAmount(sender2);
      assert.equal(Number(collAmountAfter), 0);

      // sender2 & liquidator's ETH balances after
      const ethBalanceAfterSender2 = await web3.eth.getBalance(sender2);
      assert.equal(ethBalanceBeforeSender2, ethBalanceAfterSender2); // should stay the same, because collateral went to liquidator

      const ethBalanceAfterLiquidator = await web3.eth.getBalance(liquidator);
      assert.isTrue(ethBalanceAfterLiquidator > ethBalanceBeforeLiquidator); // liquidator should now have bigger ETH balance
    });
  });

});