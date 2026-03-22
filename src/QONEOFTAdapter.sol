// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title QONE OFT Adapter (HyperEVM side)
/// @notice Locks/unlocks existing QONE tokens on HyperEVM for cross-chain bridging.
/// @dev Deploy this on HyperEVM only. There must be exactly ONE adapter in the mesh.
contract QONEOFTAdapter is OFTAdapter {
    address constant QONE_TOKEN    = 0x1E369922D78db967B009D4a21CC04c0881B698DB;
    address constant LZ_ENDPOINT   = 0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9;
    address constant OWNER         = 0xb2A1dc0DB510E268B645387e852061ce22E2e7aa;

    constructor()
        OFTAdapter(QONE_TOKEN, LZ_ENDPOINT, OWNER)
        Ownable(OWNER)
    {}
}
