// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  MockLLMPrecompile — test-only stand-in for Ritual's LLM precompile.
/// @notice Ritual's real inference precompile lives at 0x0802 and only exists on
///         Ritual chain. For local end-to-end testing we deploy this mock and
///         `setCode` it onto 0x0802, so `RitualAuditor.requestAudit` can run its
///         full flow (fee → precompile call → decode → store report) with a
///         canned response in the exact envelope the real precompile uses.
contract MockLLMPrecompile {
    struct ConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    fallback(bytes calldata) external returns (bytes memory) {
        bytes memory report = bytes(
            '{"severity":"high","issues":[{"title":"Reentrancy in withdraw","detail":"State is updated after the external call, allowing re-entry.","recommendation":"Apply checks-effects-interactions or a reentrancy guard."}],"summary":"1 high-severity issue found"}'
        );

        // Inner tuple decoded by RitualAuditor:
        // (bool hasError, bytes completionData, bytes _unused, string errorMessage, ConvoHistory)
        bytes memory actualOutput = abi.encode(
            false,
            report,
            bytes(""),
            "",
            ConvoHistory("", "", "")
        );

        // Short-running async envelope unwrapped by PrecompileConsumer:
        // abi.encode(bytes simmedInput, bytes actualOutput)
        return abi.encode(bytes(""), actualOutput);
    }
}
