// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title QONE OFT (Ethereum side)
/// @notice Mint/burn representation of QONE on Ethereum, bridged via LayerZero.
/// @dev Deploy this on Ethereum. Tokens are minted when received from HyperEVM
///      and burned when sent back.
contract QONEOFT is OFT {
    address constant LZ_ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;
    address constant OWNER       = 0xb2A1dc0DB510E268B645387e852061ce22E2e7aa;

    constructor()
        OFT("QONE", "QONE", LZ_ENDPOINT, OWNER)
        Ownable(OWNER)
    {}
}
