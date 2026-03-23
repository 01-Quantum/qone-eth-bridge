// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPQCAuthorizer.sol";

/**
 * @title QONE Token V2
 * @notice Fixed-supply ERC-20 token with Post-Quantum Cryptography (PQC) capability
 * @dev This version adds a 48-hour timelock for authorizer upgrades.
 */
contract QONE is ERC20, Ownable {
    /// @notice The PQC authorizer contract that validates transfers
    IPQCAuthorizer public pqcAuthorizer;

    /// @notice The pending PQC authorizer contract
    address public pendingPQCAuthorizer;

    /// @notice The timestamp when the pending authorizer was proposed
    uint256 public upgradeTimelock;

    /// @notice The duration of the timelock (48 hours)
    uint256 public constant TIMELOCK_DURATION = 48 hours;

    /// @notice Total supply: 1 billion QONE tokens
    uint256 public constant TOTAL_SUPPLY = 1_006_904_800 * 1e18;

    /// @notice The status of a probe of the pending authorizer
    enum ProbeStatus {
        OK,
        NOT_AUTHORIZED,
        INTERFACE_ERROR
    }

    /**
     * @notice Emitted when a new PQC authorizer is proposed
     * @param pendingAuthorizer The address of the proposed authorizer contract
     * @param unlockTime The timestamp when the upgrade can be finalized
     */
    event PQCAuthorizerUpgradeProposed(
        address indexed pendingAuthorizer,
        uint256 unlockTime
    );

    /**
     * @notice Emitted when a pending PQC authorizer upgrade is cancelled
     * @param oldPending The address of the cancelled pending authorizer
     */
    event PQCAuthorizerUpgradeCancelled(address indexed oldPending);

    /**
     * @notice Emitted when the PQC authorizer is updated
     * @param newAuthorizer The address of the new authorizer contract
     */
    event PQCAuthorizerUpdated(address indexed newAuthorizer);

    /**
     * @dev Deploys the token with fixed supply and initial authorizer
     * @param initialOwner The address that will own the token contract
     * @param authorizer The initial PQC authorizer
     */
    constructor(
        address initialOwner,
        address authorizer
    ) ERC20("QONE", "QONE") Ownable(initialOwner) {
        require(authorizer != address(0), "QONE: authorizer is zero address");

        // Mint entire supply to initial owner
        _mint(initialOwner, TOTAL_SUPPLY);

        // Set the authorizer
        pqcAuthorizer = IPQCAuthorizer(authorizer);
        emit PQCAuthorizerUpdated(authorizer);
    }

    /**
     * @notice Proposes a new PQC authorizer, starting the 48-hour timelock
     * @param newAuthorizer The new authorizer contract address
     */
    function proposePQCAuthorizer(address newAuthorizer) external onlyOwner {
        require(
            newAuthorizer != address(0),
            "QONE: new authorizer is zero address"
        );
        require(
            pendingPQCAuthorizer == address(0),
            "QONE: pending authorizer exists"
        );
        // Verify the new authorizer implements the interface
        try IPQCAuthorizer(newAuthorizer).isAuthorized(address(0)) returns (bool) {
            // Interface check passed
        } catch {
            revert("QONE: invalid authorizer interface");
        }
        pendingPQCAuthorizer = newAuthorizer;
        upgradeTimelock = block.timestamp + TIMELOCK_DURATION;
        emit PQCAuthorizerUpgradeProposed(newAuthorizer, upgradeTimelock);
    }

    /**
     * @notice Cancels a pending PQC authorizer upgrade
     */
    function cancelPendingUpdate() external onlyOwner {
        require(
            pendingPQCAuthorizer != address(0),
            "QONE: no pending authorizer"
        );
        address oldPending = pendingPQCAuthorizer;
        pendingPQCAuthorizer = address(0);
        upgradeTimelock = 0;
        emit PQCAuthorizerUpgradeCancelled(oldPending);
    }

    /**
     * @notice Finalizes the PQC authorizer upgrade after the timelock has passed
     * @dev The current authorizer must approve the upgrade.
     * @param proof ZKP proof data
     */
    function finalizePQCAuthorizer(bytes calldata proof) external onlyOwner {
        require(
            pendingPQCAuthorizer != address(0),
            "QONE: no pending authorizer"
        );
        require(
            block.timestamp >= upgradeTimelock,
            "QONE: timelock not expired"
        );

        address newAuthorizer = pendingPQCAuthorizer;

        // Current authorizer must approve the upgrade
        bool approved = pqcAuthorizer.authorizeUpgrade(
            msg.sender,
            address(this),
            address(pqcAuthorizer),
            newAuthorizer,
            proof
        );

        require(approved, "QONE: PQC upgrade not authorized");

        pqcAuthorizer = IPQCAuthorizer(newAuthorizer);

        // Reset pending state
        pendingPQCAuthorizer = address(0);
        upgradeTimelock = 0;

        emit PQCAuthorizerUpdated(newAuthorizer);
    }

    /**
     * @notice Probes a pending authorizer to check if an account would be authorized
     * @param account The address to check
     * @return status The status of the probe
     * @return pending The address of the pending authorizer
     */
    function probePendingAuthorizer(
        address account
    ) external view returns (ProbeStatus status, address pending) {
        pending = pendingPQCAuthorizer;
        require(pending != address(0), "QONE: no pending authorizer");

        try IPQCAuthorizer(pending).isAuthorized(account) returns (bool ok) {
            status = ok ? ProbeStatus.OK : ProbeStatus.NOT_AUTHORIZED;
        } catch {
            status = ProbeStatus.INTERFACE_ERROR;
        }
    }

    /**
     * @notice Internal transfer hook that enforces PQC authorization
     * @param from The address sending tokens
     * @param to The address receiving tokens
     * @param amount The amount of tokens to transfer
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override {
        // Skip authorization check for minting
        if (from != address(0)) {
            require(
                pqcAuthorizer.isAuthorized(from),
                "QONE: sender not authorized (PQC)"
            );
        }

        super._update(from, to, amount);
    }
}
