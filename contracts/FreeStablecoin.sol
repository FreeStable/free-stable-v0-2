// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import "@openzeppelin/contracts/math/SafeMath.sol";

contract FreeStablecoin is ERC20, Ownable {
  using SafeMath for uint256;

  // VARIABLES
  address private oracle;
  uint private burnFeeBps = 100; // 100bps or 1% by default
  uint private collRatioPercent = 120; // 120% by default

  // DATA STRUCTURES
  struct Vault { // each minter has a vault that tracks the amount of ETH locked and stablecoin minted
    uint ethLocked; // collateral
    uint stablecoinsMinted; // debt
    uint lastInstalment; // timestamp of the last paid instalment (the first value is when Vault is created)
  }

  mapping (address => Vault) private vaults;

  // EVENTS
  event BurnFeeChange(address indexed _from, uint _fee);
  event OracleChange(address indexed _from, address indexed _oracle);
  
  // CONSTRUCTOR
  constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

  // VIEW
  function getCollateralAmount(address minter) public view returns(uint) {
    return vaults[minter].ethLocked;
  }

  function getDebtAmount(address minter) public view returns(uint) {
    return vaults[minter].stablecoinsMinted;
  }

  function getBurnFee() public view returns(uint) {
    return burnFeeBps;
  }

  // PUBLIC (state changing)
  function burnStablecoin(uint stablecoinAmount) public returns(bool) {
    _burnStablecoin(stablecoinAmount, _msgSender());
    return true;
  }
  
  function burnStablecoinFor(uint stablecoinAmount, address beneficiary) public returns(bool) {
    _burnStablecoin(stablecoinAmount, beneficiary);
    return true;
  }

  function getCollateralizationRatio(address minter) public returns(uint) {
    // (eth collateral * eth price) * 100 / debt; 100 is to get the percent result
    return vaults[minter].ethLocked * getEthPrice() * 100 / vaults[minter].stablecoinsMinted;
  }

  function getEthPrice() public returns(uint) {
    // gets current ETH price from an oracle
    // hardcoded for this experiment only
    return 500; // 1 ETH = 500 stablecoins
  }

  // function liquidateVault(address minter) public returns(bool) {}

  function mintStablecoin() payable public returns(bool) {
    _mintStablecoin(msg.value, _msgSender());
    return true;
  }

  function mintStablecoinFor(address beneficiary) payable public returns(bool) {
    _mintStablecoin(msg.value, beneficiary);
    return true;
  }

  // INTERNAL
  function _mintStablecoin(uint _ethAmount, address _beneficiary) internal returns(bool) {
    require(_ethAmount > 0);
    require(_beneficiary != address(0));

    uint _lastInstalment = block.timestamp; // only for new Vaults (or Vaults that have ETH collateral 0)

    // if already some ETH locked, don't set lastInstalment as current timestamp, but keep the previous value
    if (vaults[_beneficiary].ethLocked != 0) {
      _lastInstalment = vaults[_beneficiary].lastInstalment;

      // if the Vault is below the collateralization ratio, use (part of) new collateral to fix the coll. ratio
      if (getCollateralizationRatio(_beneficiary) < collRatioPercent) {
        uint ethPrice = getEthPrice();
        uint collNeeded = (vaults[_beneficiary].stablecoinsMinted - (vaults[_beneficiary].ethLocked*ethPrice)) / ethPrice;

        if (collNeeded < _ethAmount) {
          _ethAmount.sub(collNeeded);
        } else {
          return true; // no need for minting, the whole added collateral is used to fix the collateralization ratio
        }
      }

    }

    // calculate stablecoin amount based on the collateralization ratio
    uint stablecoinAmount = _ethAmount.mul(getEthPrice()).div(collRatioPercent).mul(100);

    // mint
    _mint(_beneficiary, stablecoinAmount);
    vaults[_beneficiary] = Vault(_ethAmount, stablecoinAmount, _lastInstalment);
    return true;
  }

  function _burnStablecoin(uint _stablecoinAmount, address _beneficiary) internal {
    require(_stablecoinAmount > 0);
    require(_beneficiary != address(0));

    // check if msg.sender has enough stablecoins
    uint senderBalance = balanceOf(_msgSender());
    uint debt = getDebtAmount(_beneficiary);

    if (senderBalance == 0) {
      revert("Sender's token balance is 0."); // if msg.sender has 0 stablecoins, revert
    } else if (senderBalance < _stablecoinAmount) {
      _stablecoinAmount = senderBalance; // balance is less than specified amount, reduce the _stablecoinAmount
    } else if (debt < _stablecoinAmount) {
      _stablecoinAmount = debt; // debt is lower than specified stablecoin amount, so reduce the _stablecoinAmount
    }

    // set ethUnlocked as the whole value of locked collateral 
    uint ethUnlocked = vaults[_beneficiary].ethLocked;

    // but if sent stablecoin amount is lower than debt, set the ethUnlocked amount again
    if (debt > _stablecoinAmount) {
      // calculate the percentage of burned stablecoins in debt: (_stablecoinAmount / debt) * collateral
      uint ratio = (_stablecoinAmount.mul(100)).div(debt);
      ethUnlocked = (ratio.mul(getCollateralAmount(_beneficiary))).div(100);
    }

    // calculate the burn fee and reduce the amount of ETH to be returned
    uint burnFee = ethUnlocked.mul(burnFeeBps).div(10000); // divided by 10000 because it's basis points, not percentage

    // burn stablecoins that below to msg.sender (not the beneficiary!!!)
    _burn(_msgSender(), _stablecoinAmount);

    // reduce the collateral and stablecoin amounts in Vault
    vaults[_beneficiary].ethLocked = vaults[_beneficiary].ethLocked.sub(ethUnlocked);
    vaults[_beneficiary].stablecoinsMinted = vaults[_beneficiary].stablecoinsMinted.sub(_stablecoinAmount);
    vaults[_beneficiary].lastInstalment = block.timestamp;

    // send the burn fee in ETH to the owner/governance address
    payable(owner()).transfer(burnFee);

    // return the unlocked ETH to beneficiary (minus the burn fee)
    payable(_beneficiary).transfer(ethUnlocked.sub(burnFee));
  }

  // GOVERNANCE

  function changeBurnFeeBps(uint _burnFeeBps) public onlyOwner returns(bool) {
    burnFeeBps = _burnFeeBps;
    emit BurnFeeChange(_msgSender(), _burnFeeBps);
    return true;
  }

  // TODO: function changeCollRatio

  function changeOracleAddress(address oracle_) public onlyOwner returns(bool) {
    oracle = oracle_;
    emit OracleChange(_msgSender(), oracle_);
    return true;
  }

  // RECEIVE & FALLBACK
  receive() external payable { 
    _mintStablecoin(msg.value, _msgSender());
  }

  fallback() external payable {
    _mintStablecoin(msg.value, _msgSender());
  }

}
