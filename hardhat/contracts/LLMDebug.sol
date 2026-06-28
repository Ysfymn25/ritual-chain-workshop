// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrecompileConsumer} from "./utils/PrecompileConsumer.sol";

/// @notice Debug-only: calls the LLM precompile and STORES the decoded result
///         instead of reverting, so the exact TEE error/output can be read back.
contract LLMDebug is PrecompileConsumer {
    struct ConvoHistory {
        string a;
        string b;
        string c;
    }

    bool public callSuccess;
    bytes public rawOutput;
    bool public hasError;
    string public errorMessage;
    bytes public completion;

    function probe(bytes calldata llmInput) external payable {
        (bool ok, bytes memory raw) = LLM_INFERENCE_PRECOMPILE.call(llmInput);
        callSuccess = ok;
        rawOutput = raw;
        if (!ok) return;

        (, bytes memory actualOutput) = abi.decode(raw, (bytes, bytes));
        (bool he, bytes memory cd, , string memory em, ) =
            abi.decode(actualOutput, (bool, bytes, bytes, string, ConvoHistory));
        hasError = he;
        errorMessage = em;
        completion = cd;
    }
}
