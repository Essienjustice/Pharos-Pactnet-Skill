// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ArbiterRegistry
/// @notice Owner-managed registry of trusted PactNet arbiter signing addresses.
contract ArbiterRegistry is Ownable {
    mapping(address => bool) private _arbiters;

    event ArbiterAdded(address indexed arbiter);
    event ArbiterRemoved(address indexed arbiter);

    /// @notice Initializes the registry owner.
    /// @param initialOwner Address that controls arbiter registration.
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Registers an arbiter signing address.
    /// @param arbiter Address to register.
    function addArbiter(address arbiter) external onlyOwner {
        require(arbiter != address(0), "ArbiterRegistry: zero arbiter");
        _arbiters[arbiter] = true;
        emit ArbiterAdded(arbiter);
    }

    /// @notice Removes an arbiter signing address.
    /// @param arbiter Address to remove.
    function removeArbiter(address arbiter) external onlyOwner {
        require(arbiter != address(0), "ArbiterRegistry: zero arbiter");
        _arbiters[arbiter] = false;
        emit ArbiterRemoved(arbiter);
    }

    /// @notice Checks whether an address is a registered arbiter.
    /// @param arbiter Address to check.
    /// @return registered True when the address is registered.
    function isRegistered(address arbiter) external view returns (bool registered) {
        return _arbiters[arbiter];
    }
}
