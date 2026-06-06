export const PactEngineAbi = [
  {
    type: "event",
    name: "PactCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "agentA", type: "address", indexed: true },
      { name: "agentB", type: "address", indexed: true },
      { name: "bond", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false }
    ]
  },
  {
    type: "function",
    name: "createPact",
    stateMutability: "payable",
    inputs: [
      { name: "agentB", type: "address" },
      { name: "commitment", type: "string" },
      { name: "commitmentURI", type: "bytes" },
      { name: "deadline", type: "uint256" }
    ],
    outputs: [{ name: "pactId", type: "uint256" }]
  },
  {
    type: "function",
    name: "settleWithVerdict",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pactId", type: "uint256" },
      { name: "fulfilled", type: "bool" },
      { name: "confidence", type: "uint8" },
      { name: "reasoning", type: "string" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getPact",
    stateMutability: "view",
    inputs: [{ name: "pactId", type: "uint256" }],
    outputs: [
      {
        name: "pact",
        type: "tuple",
        components: [
          { name: "agentA", type: "address" },
          { name: "agentB", type: "address" },
          { name: "commitmentHash", type: "bytes32" },
          { name: "commitmentURI", type: "bytes" },
          { name: "bond", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "state", type: "uint8" },
          { name: "verdictHash", type: "bytes32" },
          { name: "confidenceScore", type: "uint8" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getAgentPacts",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "pactIds", type: "uint256[]" }]
  }
] as const;

export const ReputationNFTAbi = [
  {
    type: "function",
    name: "getScore",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      {
        name: "score",
        type: "tuple",
        components: [
          { name: "fulfilled", type: "uint32" },
          { name: "breached", type: "uint32" },
          { name: "disputed", type: "uint32" },
          { name: "totalBondHonored", type: "uint128" },
          { name: "totalBondSlashed", type: "uint128" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "agentToTokenId",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "tokenId", type: "uint256" }]
  },
  {
    type: "function",
    name: "scores",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "fulfilled", type: "uint32" },
      { name: "breached", type: "uint32" },
      { name: "disputed", type: "uint32" },
      { name: "totalBondHonored", type: "uint128" },
      { name: "totalBondSlashed", type: "uint128" }
    ]
  }
] as const;
