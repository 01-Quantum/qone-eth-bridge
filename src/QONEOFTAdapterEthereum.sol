// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title QONE OFT Adapter (Ethereum side)
/// @notice Locks/unlocks existing QONE V2 tokens on Ethereum for cross-chain bridging.
contract QONEOFTAdapterEthereum is OFTAdapter {
    address constant QONE_TOKEN    = 0x20196F73529C7DC24B30f4703D7A2b79643aCdE0;
    address constant LZ_ENDPOINT   = 0x1a44076050125825900e736c501f859c50fE728c;
    address constant OWNER         = 0xb2A1dc0DB510E268B645387e852061ce22E2e7aa;

    constructor()
        OFTAdapter(QONE_TOKEN, LZ_ENDPOINT, OWNER)
        Ownable(OWNER)
    {}
}
