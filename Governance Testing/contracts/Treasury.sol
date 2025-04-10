// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;
import "hardhat/console.sol";

contract Box {
    address public owner;

    uint256 public boxValue;

    constructor(address _owner) {
        owner = _owner;
    }

    function udpateOwner(address _owner) external {
        require(msg.sender == owner, "Ownable UnAuthorized");
        owner = _owner;
    }

    function setBoxValue(uint256 _boxValue) external {
        console.log("msgsender", address(msg.sender));
        console.log("owner", owner);
        require(msg.sender == owner, "Ownable UnAuthorized");
        boxValue = _boxValue;
    }
}
