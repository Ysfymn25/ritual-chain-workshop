// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrecompileConsumer} from "./utils/PrecompileConsumer.sol";

/// @title  RitualAuditor - on-chain AI smart-contract security auditor
/// @notice A user submits a Solidity snippet; the contract forwards it to
///         Ritual's LLM inference precompile (0x0802), which runs the model
///         inside a TEE executor and returns a security report in the SAME
///         transaction. The findings are stored on-chain, so an audit becomes
///         a permanent, verifiable artifact anyone can read back.
/// @dev    Usage fees are charged in the native (Ritual) token: `requestAudit`
///         is payable, requires at least `auditFee`, and forwards the paid
///         amount to the fixed TREASURY wallet. The owner can adjust the fee.
contract RitualAuditor is PrecompileConsumer {
    /// @notice Hard cap so a single audit request stays within gas/payload limits.
    uint256 public constant MAX_CODE_LENGTH = 12_000;

    /// @notice All usage fees (native Ritual token) are forwarded here.
    address public constant TREASURY =
        0x1BFe607AD53Ca8B2b638630865466E7F386a9b80;

    /// @notice Can update `auditFee`. Set to the deployer at construction.
    address public owner;

    /// @notice Minimum fee per audit, denominated in wei of the native token.
    uint256 public auditFee;

    struct Audit {
        address requester;
        string code; // the Solidity snippet that was audited
        string report; // the AI's findings (model text, usually JSON)
        bool completed;
        uint256 timestamp;
    }

    /// @dev Matches the trailing tuple the LLM precompile returns in its response.
    struct ConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    uint256 public nextAuditId;
    mapping(uint256 => Audit) public audits;

    event AuditRequested(uint256 indexed auditId, address indexed requester);
    event AuditCompleted(uint256 indexed auditId, string report);
    event FeePaid(uint256 indexed auditId, address indexed payer, uint256 amount);
    event AuditFeeUpdated(uint256 newFee);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    /// @param initialFee  Starting per-audit fee in wei of the native token.
    /// @param initialOwner Address that owns the contract (can re-price audits
    ///        and transfer ownership). Pass the zero address to default to the
    ///        deployer. This lets a throwaway key deploy while a different
    ///        wallet (e.g. your own) ends up as the real owner.
    constructor(uint256 initialFee, address initialOwner) {
        owner = initialOwner == address(0) ? msg.sender : initialOwner;
        auditFee = initialFee;
        emit OwnershipTransferred(address(0), owner);
    }

    /// @notice Owner can re-price audits as inference costs / demand change.
    function setAuditFee(uint256 newFee) external onlyOwner {
        auditFee = newFee;
        emit AuditFeeUpdated(newFee);
    }

    /// @notice Hand ownership to another wallet.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Submit a Solidity snippet for an AI security audit.
    /// @dev    Pay at least `auditFee` in the native token; it is forwarded to
    ///         TREASURY. The LLM precompile runs the model and returns findings
    ///         in this same transaction.
    /// @param code      The source to audit (also stored on-chain for the record).
    /// @param llmInput  ABI-encoded LLM request built off-chain; it embeds `code`
    ///                  and the auditor system prompt and selects the model.
    /// @return auditId  Id of the stored audit; its `report` holds the findings.
    function requestAudit(string calldata code, bytes calldata llmInput)
        external
        payable
        returns (uint256 auditId)
    {
        require(bytes(code).length > 0, "empty code");
        require(bytes(code).length <= MAX_CODE_LENGTH, "code too long");
        require(msg.value >= auditFee, "insufficient fee");

        auditId = nextAuditId++;

        Audit storage a = audits[auditId];
        a.requester = msg.sender;
        a.code = code;
        a.timestamp = block.timestamp;

        emit AuditRequested(auditId, msg.sender);

        // Forward the usage fee (native Ritual token) to the treasury wallet.
        if (msg.value > 0) {
            (bool paid, ) = payable(TREASURY).call{value: msg.value}("");
            require(paid, "fee transfer failed");
            emit FeePaid(auditId, msg.sender, msg.value);
        }

        // Call the LLM inference precompile. PrecompileConsumer unwraps the
        // short-running async envelope and returns the actual encoded output.
        bytes memory output = _executePrecompile(LLM_INFERENCE_PRECOMPILE, llmInput);

        (
            bool hasError,
            bytes memory completionData,
            ,
            string memory errorMessage,

        ) = abi.decode(output, (bool, bytes, bytes, string, ConvoHistory));

        require(!hasError, errorMessage);

        a.report = string(completionData);
        a.completed = true;

        emit AuditCompleted(auditId, a.report);
    }

    function getAudit(uint256 auditId)
        external
        view
        returns (
            address requester,
            string memory code,
            string memory report,
            bool completed,
            uint256 timestamp
        )
    {
        Audit storage a = audits[auditId];
        return (a.requester, a.code, a.report, a.completed, a.timestamp);
    }
}
