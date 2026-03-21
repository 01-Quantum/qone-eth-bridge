// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title QONE OFT (Ethereum side)
/// @notice Mint/burn representation of QONE on Ethereum, bridged via LayerZero.
/// @dev Deploy this on Ethereum. Tokens are minted when received from HyperEVM
///      and burned when sent back.
contract QONEOFT is OFT {
    constructor(
        address _lzEndpoint,
        address _owner
    ) OFT("QONE", "QONE", _lzEndpoint, _owner) Ownable(_owner) {}
}
