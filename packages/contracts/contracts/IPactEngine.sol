// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPactEngine
/// @notice Interface for PactNet pact creation, settlement, dispute, and lookup.
interface IPactEngine {
    enum PactState {
        Pending,
        Active,
        Fulfilled,
        Breached,
        Disputed
    }

    struct Pact {
        address agentA;
        address agentB;
        bytes32 commitmentHash;
        bytes32 verdictHash;
        uint128 bond;
        uint64 deadline;
        uint8 confidenceScore;
        PactState state;
        bytes commitmentURI;
    }

    event PactCreated(uint256 indexed id, address indexed agentA, address indexed agentB, uint256 bond, uint256 deadline);
    event PactSettled(uint256 indexed id, PactState outcome, string reasoning, uint8 confidence);
    event PactDisputed(uint256 indexed id, address disputer);

    /// @notice Creates a pact between the caller and another agent.
    /// @param agentB Counterparty agent address.
    /// @param commitment Commitment text to be hashed and stored.
    /// @param commitmentURI URI containing expanded pact metadata.
    /// @param deadline Unix timestamp by which the commitment must be fulfilled.
    /// @return pactId Newly created pact id.
    function createPact(
        address agentB,
        string calldata commitment,
        bytes calldata commitmentURI,
        uint256 deadline
    ) external payable returns (uint256 pactId);

    /// @notice Settles an active pact using a registered arbiter's signed verdict.
    /// @param pactId Pact id to settle.
    /// @param fulfilled Whether the commitment was fulfilled.
    /// @param confidence Arbiter confidence score from 0 to 100.
    /// @param reasoning Human-readable settlement reasoning.
    /// @param signature Arbiter signature over the settlement payload.
    function settleWithVerdict(
        uint256 pactId,
        bool fulfilled,
        uint8 confidence,
        string calldata reasoning,
        bytes calldata signature
    ) external;

    /// @notice Marks an active pact as disputed by one of its parties.
    /// @param pactId Pact id to dispute.
    function disputePact(uint256 pactId) external;

    /// @notice Returns a pact by id.
    /// @param pactId Pact id to read.
    /// @return pact Pact data.
    function getPact(uint256 pactId) external view returns (Pact memory pact);

    /// @notice Returns all pact ids associated with an agent.
    /// @param agent Agent address.
    /// @return pactIds Pact ids involving the agent.
    function getAgentPacts(address agent) external view returns (uint256[] memory pactIds);

    /// @notice Returns the fulfilled percentage for an agent.
    /// @param agent Agent address.
    /// @return pct Fulfilled percentage from 0 to 100.
    function getReliability(address agent) external view returns (uint256 pct);
}
