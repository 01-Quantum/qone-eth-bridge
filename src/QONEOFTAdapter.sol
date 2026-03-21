// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title QONE OFT Adapter (HyperEVM side)
/// @notice Locks/unlocks existing QONE tokens on HyperEVM for cross-chain bridging.
/// @dev Deploy this on HyperEVM only. There must be exactly ONE adapter in the mesh.
///      The QONE token's PQC authorizer must whitelist this contract's address so it
///      can hold and release tokens (the `_update` hook checks `isAuthorized(from)`).
contract QONEOFTAdapter is OFTAdapter {
    constructor(
        address _token,
        address _lzEndpoint,
        address _owner
    ) OFTAdapter(_token, _lzEndpoint, _owner) Ownable(_owner) {}
}
