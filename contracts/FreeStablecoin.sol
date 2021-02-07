// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import "@openzeppelin/contracts/math/SafeMath.sol";

import "hardhat/console.sol";

contract FreeStablecoin is ERC20, Ownable {
  using SafeMath for uint256;

  // VARIABLES
  address private oracle;
  uint private burnFeeBps = 100; // 100bps or 1%
  uint private collRatioPercent = 120; // 120%
  uint private ethPrice = 500; // 500 frEUR
  uint private maxInstalmentPeriod = 30 * 24 * 60 * 60; // max time between instalments: 30 days (2592000 seconds)
  uint private minInstalmentAmount = 10 * (10 ** 18); // 10frEUR (with 18 decimal places)

  // DATA STRUCTURES
  struct Vault { // each minter has a vault that tracks the amount of ETH locked and stablecoin minted
    uint ethLocked; // collateral
    uint stablecoinsMinted; // debt
    uint lastInstalment; // timestamp of the last paid instalment (the first value is when Vault is created)
  }

  mapping (address => Vault) private vaults;

  address[] private minters; // a list of all addresses that ever minted a stablecoin through this smart contract

  // EVENTS
  event BurnFeeChange(address indexed _from, uint _fee);
  event CollRatioChange(address indexed _from, uint _collRatio);
  event MaxInstalmentPeriodChanged(address indexed _from, uint indexed _period);
  event MinInstalmentAmountChanged(address indexed _from, uint indexed _amount);
  event OracleChange(address indexed _from, address indexed _oracle);
  
  // CONSTRUCTOR
  constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

  // VIEW
  function getCollateralAmount(address _minter) public view returns(uint) {
    return vaults[_minter].ethLocked;
  }

  function getDebtAmount(address _minter) public view returns(uint) {
    return vaults[_minter].stablecoinsMinted;
  }

  function getBurnFee() public view returns(uint) {
    return burnFeeBps;
  }

  function getCollRatioOf(address _minter) public view returns(uint) {
    // (eth collateral * eth price) * 100 / debt; 100 is to get the percent result
    return vaults[_minter].ethLocked * ethPrice * 100 / vaults[_minter].stablecoinsMinted;
  }

  function getCollRatio() public view returns(uint) {
    return collRatioPercent;
  }

  function getEthPrice() public view returns(uint) {
    return ethPrice;
  }

  function getLastInstalment(address _minter) public view returns(uint) {
    return vaults[_minter].lastInstalment;
  }

  function getMaxInstalmentPeriod() public view returns(uint) {
    return maxInstalmentPeriod;
  }

  function getMinInstalmentAmount() public view returns(uint) {
    return minInstalmentAmount;
  }

  function getMinterAddressByIndex(uint _index) public view returns(address) {
    return minters[_index];
  }

  function getMintersArrayLength() public view returns(uint) {
    return minters.length;
  }

  // PUBLIC (state changing)
  function burnStablecoin(uint _stablecoinAmount) public returns(bool) {
    _burnStablecoin(_stablecoinAmount, _msgSender());
    return true;
  }
  
  function burnStablecoinFor(uint _stablecoinAmount, address _beneficiary) public returns(bool) {
    _burnStablecoin(_stablecoinAmount, _beneficiary);
    return true;
  }

  function fetchEthPrice() public returns(bool) {
    // gets current ETH price from an oracle
    // hardcoded for this experiment only
    ethPrice = 500; // 1 ETH = 500 stablecoins
    return true;
  }

  function liquidateVault(address _minter, uint _stablecoinAmount) public returns(bool) {
    // TODO
    // if coll. ratio below the required collRatioPercent
    // if last instalment payment more than the specified max time ago
    // then liquidation can happen (basically burn, but collateral goes to _msgSender)
    // only full liquidation is possible
  }

  function mintStablecoin() payable public returns(bool) {
    _mintStablecoin(msg.value, _msgSender());
    return true;
  }

  function mintStablecoinFor(address _beneficiary) payable public returns(bool) {
    _mintStablecoin(msg.value, _beneficiary);
    return true;
  }

  // INTERNAL
  function _mintStablecoin(uint _ethAmount, address _beneficiary) internal returns(bool) {
    require(_ethAmount > 0);
    require(_beneficiary != address(0));
    fetchEthPrice(); // get the current ETH price

    uint _lastInstalment = block.timestamp; // only for new Vaults (or Vaults that have ETH collateral 0)

    // if already some ETH locked, don't set lastInstalment as current timestamp, but keep the previous value
    if (vaults[_beneficiary].ethLocked != 0) {
      _lastInstalment = vaults[_beneficiary].lastInstalment;

      // if the Vault is below the collateralization ratio, use (part of) new collateral to fix the coll. ratio
      if (getCollRatioOf(_beneficiary) < collRatioPercent) {
        uint collNeeded = (vaults[_beneficiary].stablecoinsMinted - (vaults[_beneficiary].ethLocked*ethPrice)) / ethPrice;

        if (collNeeded < _ethAmount) {
          _ethAmount.sub(collNeeded);
        } else {
          return true; // no need for minting, the whole added collateral is used to fix the collateralization ratio
        }
      }
    }

    // calculate stablecoin amount based on the collateralization ratio
    uint stablecoinAmount = _ethAmount.mul(ethPrice).div(collRatioPercent).mul(100);

    // mint
    _mint(_beneficiary, stablecoinAmount);
    vaults[_beneficiary] = Vault(_ethAmount, stablecoinAmount, _lastInstalment);

    minters.push(_beneficiary);

    return true;
  }

  function _burnStablecoin(uint _stablecoinAmount, address _beneficiary) internal {
    require(_stablecoinAmount > 0, "Stablecoin amount needs to be larger than 0.");
    require(_beneficiary != address(0), "The beneficiary cannot be the 0x0 address.");
    fetchEthPrice(); // fresh ETH price is needed for correct coll. ratio of a _beneficiary

    // check if msg.sender has enough stablecoins
    uint senderBalance = balanceOf(_msgSender());
    uint debt = getDebtAmount(_beneficiary);

    if (senderBalance == 0) {
      revert("Sender's token balance is 0."); // if msg.sender has 0 stablecoins, revert
    } else if (_stablecoinAmount < debt && _stablecoinAmount < minInstalmentAmount) {
      // if _stablecoinAmount is lower than minimum, reject the tx (unless _stablecoinAmount >= debt)
      revert("The _stablecoinAmount sent is lower than both the required minimum and the debt.");
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

      // if user's collateralization ratio is below the threshold, return less collateral back (and vice versa)
      // this chunk of code could be further optimized
      if (getCollRatioOf(_beneficiary) != collRatioPercent) {
        uint ethLocked = vaults[_beneficiary].ethLocked;
        uint collWithOldRatio = ethLocked.sub(ethUnlocked);

        // formula: collWithNewRatio = collBefore * (required collRatio / user's collRatio)
        uint collWithNewRatio = collWithOldRatio.mul(collRatioPercent).mul(100).div(getCollRatioOf(_beneficiary)).div(100);
        ethUnlocked = ethLocked.sub(collWithNewRatio);
      }
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

  function changeBurnFee(uint _burnFeeBps) public onlyOwner returns(bool) {
    burnFeeBps = _burnFeeBps;
    emit BurnFeeChange(_msgSender(), _burnFeeBps);
    return true;
  }

  function changeCollRatio(uint _collRatioPercent) public onlyOwner returns(bool) {
    collRatioPercent = _collRatioPercent;
    emit CollRatioChange(_msgSender(), _collRatioPercent);
    return true;
  }

  function changeMaxInstalmentPeriod(uint _maxInstalmentPeriod) public onlyOwner returns(bool) {
    maxInstalmentPeriod = _maxInstalmentPeriod;
    emit MaxInstalmentPeriodChanged(_msgSender(), _maxInstalmentPeriod);
    return true;
  }

  function changeMinInstalmentAmount(uint _minInstalmentAmount) public onlyOwner returns(bool) {
    minInstalmentAmount = _minInstalmentAmount;
    emit MinInstalmentAmountChanged(_msgSender(), _minInstalmentAmount);
    return true;
  }

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
