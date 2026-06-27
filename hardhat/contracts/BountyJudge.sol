// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  BountyJudge - commit-reveal bounty system with AI-assisted judging
/// @notice Answers stay hidden (stored only as commitment hashes) during the
///         submission phase, so participants cannot read and "improve on" a
///         rival's answer before the deadline. Answers become checkable only
///         in the reveal phase, and only valid reveals are eligible for judging.
/// @dev    Works on any EVM chain. The commitment is:
///         keccak256(abi.encode(answer, salt, msg.sender, bountyId))
///         Binding the commitment to msg.sender stops anyone from front-running
///         or replaying another participant's reveal.
contract BountyJudge {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Submission {
        bytes32 commitment; // keccak256(abi.encode(answer, salt, msg.sender, bountyId))
        string  answer;     // populated only after a successful reveal
        bool    revealed;
        bool    exists;
    }

    struct Bounty {
        address   creator;
        string    prompt;
        uint64    submissionDeadline; // commitments accepted strictly BEFORE this ts
        uint64    revealDeadline;     // reveals accepted in [submissionDeadline, revealDeadline)
        bool      judged;
        bool      finalized;
        bool      exists;
        uint256   winnerIndex;        // index into participants[]
        bytes32   judgeInputHash;     // hash of the exact batch handed to the LLM judge
        address[] participants;       // every address that submitted a commitment
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    uint256 public nextBountyId;
    mapping(uint256 => Bounty) private _bounties;
    mapping(uint256 => mapping(address => Submission)) private _submissions;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed creator,
        uint64 submissionDeadline,
        uint64 revealDeadline
    );
    event CommitmentSubmitted(uint256 indexed bountyId, address indexed participant, bytes32 commitment);
    event AnswerRevealed(uint256 indexed bountyId, address indexed participant);
    event Judged(uint256 indexed bountyId, bytes32 judgeInputHash, uint256 revealedCount);
    event WinnerFinalized(uint256 indexed bountyId, uint256 winnerIndex, address indexed winner);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotCreator();
    error BountyMissing();
    error BadDeadlines();
    error SubmissionClosed();
    error AlreadyCommitted();
    error RevealNotOpen();
    error RevealClosed();
    error NothingToReveal();
    error AlreadyRevealed();
    error CommitmentMismatch();
    error JudgingNotOpen();
    error NotJudged();
    error AlreadyJudged();
    error AlreadyFinalized();
    error WinnerNotRevealed();
    error IndexOutOfRange();

    // ---------------------------------------------------------------------
    // Bounty lifecycle
    // ---------------------------------------------------------------------

    /// @notice Create a bounty and define its two deadlines.
    /// @dev Not in the required signature list, but a bounty must exist before
    ///      anyone can commit. The caller becomes the judging authority.
    function createBounty(string calldata prompt, uint64 submissionDeadline, uint64 revealDeadline)
        external
        returns (uint256 bountyId)
    {
        if (submissionDeadline <= block.timestamp || revealDeadline <= submissionDeadline) {
            revert BadDeadlines();
        }
        bountyId = nextBountyId++;
        Bounty storage b = _bounties[bountyId];
        b.creator = msg.sender;
        b.prompt = prompt;
        b.submissionDeadline = submissionDeadline;
        b.revealDeadline = revealDeadline;
        b.exists = true;
        emit BountyCreated(bountyId, msg.sender, submissionDeadline, revealDeadline);
    }

    /// @notice Phase 1 - submit ONLY a commitment hash. The answer stays hidden.
    function submitCommitment(uint256 bountyId, bytes32 commitment) external {
        Bounty storage b = _bounties[bountyId];
        if (!b.exists) revert BountyMissing();
        if (block.timestamp >= b.submissionDeadline) revert SubmissionClosed();

        Submission storage s = _submissions[bountyId][msg.sender];
        if (s.exists) revert AlreadyCommitted();

        s.commitment = commitment;
        s.exists = true;
        b.participants.push(msg.sender);

        emit CommitmentSubmitted(bountyId, msg.sender, commitment);
    }

    /// @notice Phase 2 - reveal answer + salt. Must reproduce the original commitment.
    function revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt) external {
        Bounty storage b = _bounties[bountyId];
        if (!b.exists) revert BountyMissing();
        if (block.timestamp < b.submissionDeadline) revert RevealNotOpen();
        if (block.timestamp >= b.revealDeadline) revert RevealClosed();

        Submission storage s = _submissions[bountyId][msg.sender];
        if (!s.exists) revert NothingToReveal();
        if (s.revealed) revert AlreadyRevealed();

        bytes32 expected = keccak256(abi.encode(answer, salt, msg.sender, bountyId));
        if (expected != s.commitment) revert CommitmentMismatch();

        s.answer = answer;
        s.revealed = true;

        emit AnswerRevealed(bountyId, msg.sender);
    }

    /// @notice Phase 3 - lock in the batch of revealed answers handed to the AI judge.
    /// @dev Only the creator can judge, and only after the reveal window closes.
    ///      `llmInput` is the exact byte payload sent to the LLM for BATCH judging
    ///      (one call for all answers, not one call per answer). We store its hash
    ///      so the off-chain/TEE judging step is auditable and tamper-evident.
    function judgeAll(uint256 bountyId, bytes calldata llmInput) external {
        Bounty storage b = _bounties[bountyId];
        if (!b.exists) revert BountyMissing();
        if (msg.sender != b.creator) revert NotCreator();
        if (block.timestamp < b.revealDeadline) revert JudgingNotOpen();
        if (b.judged) revert AlreadyJudged();

        uint256 revealedCount;
        uint256 len = b.participants.length;
        for (uint256 i; i < len; ++i) {
            if (_submissions[bountyId][b.participants[i]].revealed) {
                revealedCount++;
            }
        }

        b.judged = true;
        b.judgeInputHash = keccak256(llmInput);

        emit Judged(bountyId, b.judgeInputHash, revealedCount);
    }

    /// @notice Phase 4 - record the winning submission. Winner must have revealed.
    function finalizeWinner(uint256 bountyId, uint256 winnerIndex) external {
        Bounty storage b = _bounties[bountyId];
        if (!b.exists) revert BountyMissing();
        if (msg.sender != b.creator) revert NotCreator();
        if (!b.judged) revert NotJudged();
        if (b.finalized) revert AlreadyFinalized();
        if (winnerIndex >= b.participants.length) revert IndexOutOfRange();

        address winner = b.participants[winnerIndex];
        if (!_submissions[bountyId][winner].revealed) revert WinnerNotRevealed();

        b.finalized = true;
        b.winnerIndex = winnerIndex;

        emit WinnerFinalized(bountyId, winnerIndex, winner);
    }

    // ---------------------------------------------------------------------
    // Views / helpers
    // ---------------------------------------------------------------------

    /// @notice Build a commitment exactly the way the contract verifies it.
    /// @dev Call OFF-CHAIN (eth_call). Never broadcast your answer in a tx during
    ///      the submission phase - that would defeat the whole point.
    function computeCommitment(
        string calldata answer,
        bytes32 salt,
        address sender,
        uint256 bountyId
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(answer, salt, sender, bountyId));
    }

    function getParticipants(uint256 bountyId) external view returns (address[] memory) {
        return _bounties[bountyId].participants;
    }

    function getSubmission(uint256 bountyId, address participant)
        external
        view
        returns (bytes32 commitment, bool revealed, string memory answer)
    {
        Submission storage s = _submissions[bountyId][participant];
        return (s.commitment, s.revealed, s.answer);
    }

    function getWinner(uint256 bountyId) external view returns (address winner, string memory answer) {
        Bounty storage b = _bounties[bountyId];
        if (!b.finalized) return (address(0), "");
        winner = b.participants[b.winnerIndex];
        answer = _submissions[bountyId][winner].answer;
    }

    function getBounty(uint256 bountyId)
        external
        view
        returns (
            address creator,
            string memory prompt,
            uint64 submissionDeadline,
            uint64 revealDeadline,
            bool judged,
            bool finalized,
            uint256 winnerIndex,
            uint256 participantCount
        )
    {
        Bounty storage b = _bounties[bountyId];
        return (
            b.creator,
            b.prompt,
            b.submissionDeadline,
            b.revealDeadline,
            b.judged,
            b.finalized,
            b.winnerIndex,
            b.participants.length
        );
    }
}
