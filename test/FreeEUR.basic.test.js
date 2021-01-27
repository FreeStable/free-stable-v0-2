const { assert } = require("chai");

// artifacts
const FreeStablecoin = artifacts.require("FreeStablecoin");

contract("FreeStablecoin", accounts => {
  let instance;

  const name = "FreeEUR";
  const symbol = "frEUR";

  before(async () => {
    // before() is run only once at the start of the contract
    instance = await FreeStablecoin.new(name, symbol);
  });

  describe("Check basic ERC20 variables", () => {

    it("has the correct name (" + name + ")", async () => {
      const _name = await instance.name();
      assert.equal(_name, name);
    });

    it("has the correct symbol (" + symbol + ")", async () => {
      const _symbol = await instance.symbol();
      assert.equal(_symbol, symbol);
    });

    it("has 18 decimal places", async () => {
      const decimals = await instance.decimals();
      assert.equal(decimals, 18);
    });

    it("has 0 current total supply", async () => {
      const totalSupply = await instance.totalSupply();
      assert.equal(totalSupply, 0);
    });

  });

});