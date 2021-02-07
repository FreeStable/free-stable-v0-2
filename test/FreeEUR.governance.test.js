const {
  BN,           // Big Number support 
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
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

  const name = "FreeEUR";
  const symbol = "frEUR";

  before(async () => {
    // before() is run only once at the start of the contract
    instance = await FreeStablecoin.new(name, symbol);
  });

  describe("Governance", () => {
    it("changes burn fee percentage", async () => {
      const burnFeeBefore = await instance.getBurnFee();
      assert.equal(burnFeeBefore, 100);

      let changeFee = await instance.changeBurnFee(200, {from: governance});

      expectEvent(changeFee, "BurnFeeChange", {
        _from: governance,
        _fee: "200"
      });

      const burnFeeAfter = await instance.getBurnFee();
      assert.equal(burnFeeAfter, 200);
    });

    it("prevents non-owner account from changing the burn fee", async () => {
      const burnFeeBefore = await instance.getBurnFee();
      assert.equal(burnFeeBefore, 200);

      await expectRevert(
        instance.changeBurnFee(130, {from: sender}), // sender is not owner!
        "caller is not the owner"
      ) 

      const burnFeeAfter = await instance.getBurnFee();
      assert.equal(burnFeeAfter, 200);
    });

    it("changes collateralization ratio", async () => {
      const collRatioBefore = await instance.getCollRatio();
      assert.equal(collRatioBefore, 120);

      const newCollRatio = 150;

      let changeCollRatio = await instance.changeCollRatio(String(newCollRatio), {from: governance});

      expectEvent(changeCollRatio, "CollRatioChange", {
        _from: governance,
        _collRatio: String(newCollRatio)
      });

      const collRatioAfter = await instance.getCollRatio();
      assert.equal(collRatioAfter, newCollRatio);
    });

    it("changes the maximum instalment period", async () => {
      const periodBefore = await instance.getMaxInstalmentPeriod();
      assert.equal(Number(periodBefore), 2592000); // 30 days

      const newPeriod = 14 * 24 * 60 * 60; // 14 days (1209600)

      let changePeriod = await instance.changeMaxInstalmentPeriod(String(newPeriod), {from: governance});

      expectEvent(changePeriod, "MaxInstalmentPeriodChanged", {
        _from: governance,
        _period: String(newPeriod)
      });

      const periodAfter = await instance.getMaxInstalmentPeriod();
      assert.equal(Number(periodAfter), newPeriod);
    });

    it("changes the minimum instalment amount", async () => {
      const instalmentBefore = await instance.getMinInstalmentAmount();
      assert.equal(instalmentBefore, ether(10));

      const newAmount = ether(12);

      let changeAmount = await instance.changeMinInstalmentAmount(newAmount, {from: governance});

      expectEvent(changeAmount, "MinInstalmentAmountChanged", {
        _from: governance,
        _amount: newAmount
      });

      const instalmentAfter = await instance.getMinInstalmentAmount();
      assert.equal(instalmentAfter, newAmount);
    });

    it("changes the oracle address", async () => {
      // let's use accounts[5] as the dummy new oracle address
      const oracle = accounts[5];

      let changeOracle = await instance.changeOracleAddress(oracle, {from: governance});

      expectEvent(changeOracle, "OracleChange", {
        _from: governance,
        _oracle: oracle
      });
    });

    it("prevents non-owner account from changing the oracle address", async () => {
      await expectRevert(
        instance.changeOracleAddress(accounts[7], {from: sender}), // sender is not owner!
        "caller is not the owner"
      ) 
    });
  });

});