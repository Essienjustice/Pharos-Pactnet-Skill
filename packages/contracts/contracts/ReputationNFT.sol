// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title ReputationNFT
/// @notice Soulbound NFT storing PactNet agent reputation counters.
contract ReputationNFT is ERC721, AccessControl {
    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");

    struct Score {
        uint32 fulfilled;
        uint32 breached;
        uint32 disputed;
        uint128 totalBondHonored;
        uint128 totalBondSlashed;
    }

    mapping(address => uint256) public agentToTokenId;
    mapping(uint256 => Score) public scores;

    uint256 private _nextId = 1;

    /// @notice Initializes the soulbound reputation token and grants admin role.
    /// @param admin Address receiving the default admin role.
    constructor(address admin) ERC721("PactNet Reputation", "PACTREP") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Ensures an agent owns a reputation token, minting one if needed.
    /// @param agent Agent address.
    /// @return tokenId Existing or newly minted reputation token id.
    function ensureMinted(address agent) public onlyRole(ENGINE_ROLE) returns (uint256 tokenId) {
        require(agent != address(0), "ReputationNFT: zero agent");

        tokenId = agentToTokenId[agent];
        if (tokenId == 0) {
            tokenId = _nextId++;
            agentToTokenId[agent] = tokenId;
            _safeMint(agent, tokenId);
        }
    }

    /// @notice Records a fulfilled pact for an agent.
    /// @param agent Agent whose score should be updated.
    /// @param bond Bond amount honored.
    function recordFulfilled(address agent, uint256 bond) external onlyRole(ENGINE_ROLE) {
        uint256 tokenId = ensureMinted(agent);
        Score storage score = scores[tokenId];
        score.fulfilled += 1;
        score.totalBondHonored += uint128(bond);
    }

    /// @notice Records a breached pact for an agent.
    /// @param agent Agent whose score should be updated.
    /// @param bond Bond amount slashed.
    function recordBreached(address agent, uint256 bond) external onlyRole(ENGINE_ROLE) {
        uint256 tokenId = ensureMinted(agent);
        Score storage score = scores[tokenId];
        score.breached += 1;
        score.totalBondSlashed += uint128(bond);
    }

    /// @notice Returns the reputation score for an agent.
    /// @param agent Agent address.
    /// @return score Reputation score counters.
    function getScore(address agent) external view returns (Score memory score) {
        uint256 tokenId = agentToTokenId[agent];
        if (tokenId == 0) {
            return Score(0, 0, 0, 0, 0);
        }

        return scores[tokenId];
    }

    /// @notice Reports interface support for ERC721 and AccessControl.
    /// @param interfaceId Interface id to check.
    /// @return supported True when supported.
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool supported) {
        return super.supportsInterface(interfaceId);
    }

    /// @notice Enforces soulbound behavior by allowing only mints and burns.
    /// @param to Recipient address.
    /// @param tokenId Token id being updated.
    /// @param auth Authorized operator.
    /// @return previousOwner Previous token owner.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address previousOwner) {
        if (auth != address(0)) {
            revert("Soulbound: non-transferable");
        }

        return super._update(to, tokenId, auth);
    }
}
