// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IPactEngine} from "./IPactEngine.sol";
import {ArbiterRegistry} from "./ArbiterRegistry.sol";
import {ReputationNFT} from "./ReputationNFT.sol";

/// @title PactEngine
/// @notice Escrows pact bonds and settles outcomes using registered arbiter signatures.
contract PactEngine is IPactEngine, Ownable, ReentrancyGuard {
    using MessageHashUtils for bytes32;

    mapping(uint256 => Pact) private _pacts;
    mapping(address => uint256[]) private _agentPacts;

    uint256 public nextPactId;
    uint256 public PROTOCOL_FEE_BPS = 500;
    address public treasury;

    ReputationNFT public immutable reputationNFT;
    ArbiterRegistry public immutable arbiterRegistry;

    /// @notice Initializes PactEngine dependencies.
    /// @param _reputationNFT Reputation NFT contract address.
    /// @param _arbiterRegistry Arbiter registry contract address.
    /// @param _treasury Address receiving protocol fees.
    constructor(address _reputationNFT, address _arbiterRegistry, address _treasury) Ownable(msg.sender) {
        require(_reputationNFT != address(0), "PactEngine: zero reputation");
        require(_arbiterRegistry != address(0), "PactEngine: zero registry");
        require(_treasury != address(0), "PactEngine: zero treasury");

        reputationNFT = ReputationNFT(_reputationNFT);
        arbiterRegistry = ArbiterRegistry(_arbiterRegistry);
        treasury = _treasury;
    }

    /// @notice Creates an active pact and escrows the caller's bond.
    /// @param agentB Counterparty agent address.
    /// @param commitment Commitment text to hash.
    /// @param commitmentURI URI for pact metadata.
    /// @param deadline Unix timestamp between now and seven days from now.
    /// @return pactId Newly created pact id.
    function createPact(
        address agentB,
        string calldata commitment,
        bytes calldata commitmentURI,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 pactId) {
        require(msg.value >= 1e15, "PactEngine: bond too low");
        require(msg.value <= type(uint128).max, "PactEngine: bond too high");
        require(agentB != msg.sender, "PactEngine: self pact");
        require(agentB != address(0), "PactEngine: zero agentB");
        require(deadline > block.timestamp && deadline <= block.timestamp + 7 days, "PactEngine: invalid deadline");
        require(bytes(commitment).length >= 20, "PactEngine: commitment too short");

        pactId = nextPactId++;

        _pacts[pactId] = Pact({
            agentA: msg.sender,
            agentB: agentB,
            commitmentHash: keccak256(bytes(commitment)),
            verdictHash: bytes32(0),
            bond: uint128(msg.value),
            deadline: uint64(deadline),
            confidenceScore: 0,
            state: PactState.Active,
            commitmentURI: commitmentURI
        });

        _agentPacts[msg.sender].push(pactId);
        _agentPacts[agentB].push(pactId);

        reputationNFT.ensureMinted(msg.sender);
        reputationNFT.ensureMinted(agentB);

        emit PactCreated(pactId, msg.sender, agentB, msg.value, deadline);
    }

    /// @notice Settles an active pact with a registered arbiter's signed verdict.
    /// @param pactId Pact id to settle.
    /// @param fulfilled Whether the pact was fulfilled.
    /// @param confidence Arbiter confidence from 0 to 100.
    /// @param reasoning Factual reasoning for the verdict.
    /// @param signature Arbiter signature over pact id, fulfilled flag, confidence, and reasoning hash.
    function settleWithVerdict(
        uint256 pactId,
        bool fulfilled,
        uint8 confidence,
        string calldata reasoning,
        bytes calldata signature
    ) external nonReentrant {
        Pact storage pact = _pacts[pactId];
        require(pact.state == PactState.Active, "PactEngine: pact not active");

        bytes32 reasoningHash = keccak256(bytes(reasoning));
        bytes32 msgHash = keccak256(abi.encodePacked(pactId, fulfilled, confidence, reasoningHash)).toEthSignedMessageHash();
        address signer = ECDSA.recover(msgHash, signature);
        require(arbiterRegistry.isRegistered(signer), "PactEngine: invalid arbiter");

        pact.verdictHash = msgHash;
        pact.confidenceScore = confidence;

        if (fulfilled) {
            pact.state = PactState.Fulfilled;
            reputationNFT.recordFulfilled(pact.agentA, pact.bond);
            _sendValue(pact.agentA, pact.bond);
            emit PactSettled(pactId, PactState.Fulfilled, reasoning, confidence);
        } else {
            pact.state = PactState.Breached;
            reputationNFT.recordBreached(pact.agentA, pact.bond);

            uint256 fee = (pact.bond * PROTOCOL_FEE_BPS) / 10_000;
            uint256 agentBAmount = (pact.bond - fee) / 2;
            uint256 treasuryAmount = pact.bond - agentBAmount;

            _sendValue(pact.agentB, agentBAmount);
            _sendValue(treasury, treasuryAmount);
            emit PactSettled(pactId, PactState.Breached, reasoning, confidence);
        }
    }

    /// @notice Disputes an active pact by one of its two parties.
    /// @param pactId Pact id to dispute.
    function disputePact(uint256 pactId) external {
        Pact storage pact = _pacts[pactId];
        require(pact.state == PactState.Active, "PactEngine: pact not active");
        require(msg.sender == pact.agentA || msg.sender == pact.agentB, "PactEngine: not party");

        pact.state = PactState.Disputed;
        emit PactDisputed(pactId, msg.sender);
    }

    /// @notice Returns a pact by id.
    /// @param pactId Pact id to read.
    /// @return pact Pact data.
    function getPact(uint256 pactId) external view returns (Pact memory pact) {
        return _pacts[pactId];
    }

    /// @notice Returns all pacts involving an agent.
    /// @param agent Agent address.
    /// @return pactIds Pact ids involving the agent.
    function getAgentPacts(address agent) external view returns (uint256[] memory pactIds) {
        return _agentPacts[agent];
    }

    /// @notice Returns the fulfilled percentage for an agent.
    /// @param agent Agent address.
    /// @return pct Fulfilled percentage from 0 to 100.
    function getReliability(address agent) external view returns (uint256 pct) {
        ReputationNFT.Score memory score = reputationNFT.getScore(agent);
        uint256 total = uint256(score.fulfilled) + uint256(score.breached);
        if (total == 0) {
            return 0;
        }

        return (uint256(score.fulfilled) * 100) / total;
    }

    /// @notice Updates the protocol fee recipient.
    /// @param newTreasury New treasury address.
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "PactEngine: zero treasury");
        treasury = newTreasury;
    }

    /// @notice Updates the protocol fee in basis points.
    /// @param newFeeBps New protocol fee bps.
    function setProtocolFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 2_000, "PactEngine: fee too high");
        PROTOCOL_FEE_BPS = newFeeBps;
    }

    function _sendValue(address recipient, uint256 amount) private {
        (bool success,) = payable(recipient).call{value: amount}("");
        require(success, "PactEngine: transfer failed");
    }
}
