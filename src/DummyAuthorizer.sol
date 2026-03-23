// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IPQCAuthorizer.sol";

/**
 * @title DummyAuthorizer
 * @notice A placeholder PQC authorizer that always returns true
 * @dev This contract is deployed initially to allow the qLabs token
 *      to function as a standard ERC-20 without any PQC restrictions.
 *      Later, it can be replaced with a real Falcon-ZKP authorizer
 *      without changing the token contract address.
 * 
 *      Phase 1: All transfers are authorized (this contract)
 *      Phase 2: Real PQC verification (future FalconAuthorizer)
 */
contract DummyAuthorizer is IPQCAuthorizer {
    /// @notice The owner who can authorize upgrades
    address public immutable owner;

    /**
     * @dev Sets the contract deployer as the owner
     * @param _owner The address that can authorize upgrades
     */
    constructor(address _owner) {
        require(_owner != address(0), "DummyAuthorizer: owner is zero address");
        owner = _owner;
    }

    /**
     * @notice Always returns true - everyone is authorized in Phase 1
     * @param account The address to check (unused in dummy implementation)
     * @return authorized Always returns true
     */
    function isAuthorized(address account) external pure override returns (bool authorized) {
        // Silence unused variable warning
        account;
        return true;
    }

    /**
     * @notice Authorizes upgrades if called by the owner
     * @dev In Phase 1, only the owner can upgrade. In Phase 2, this will
     *      require ZKP proof verification.
     * @param sender The address initiating the upgrade
     * @param tokenContract The token contract (unused in dummy)
     * @param currentAuthorizer The current authorizer (unused in dummy)
     * @param newAuthorizer The new authorizer contract
     * @param proof ZKP proof (unused in dummy implementation)
     * @return approved True if sender is the owner
     */
    function authorizeUpgrade(
        address sender,
        address tokenContract,
        address currentAuthorizer,
        address newAuthorizer,
        bytes calldata proof
    ) external override returns (bool approved) {
        // Silence unused variable warnings
        tokenContract;
        proof;
        
        // Only the owner can authorize upgrades
        bool isApproved = (sender == owner);
        
        if (isApproved) {
            emit UpgradeAuthorized(tokenContract, currentAuthorizer, newAuthorizer);
        }
        
        return isApproved;
    }
}

