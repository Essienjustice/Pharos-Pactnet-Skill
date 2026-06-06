import { expect } from "chai";
import "@nomicfoundation/hardhat-ethers/internal/type-extensions";
import { ethers } from "hardhat";
import type { BytesLike } from "ethers";

const MIN_BOND = 1_000_000_000_000_000n;
const COMMITMENT = "Deliver a verified API response with a successful completion status.";
const COMMITMENT_URI = "ipfs://pactnet/commitment-1";

async function latestTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  if (!block) {
    throw new Error("Missing latest block");
  }

  return block.timestamp;
}

async function signVerdict(
  arbiter: { signMessage(message: BytesLike): Promise<string> },
  pactId: bigint | number,
  fulfilled: boolean,
  confidence: number,
  reasoning: string
) {
  const reasoningHash = ethers.keccak256(ethers.toUtf8Bytes(reasoning));
  const digest = ethers.solidityPackedKeccak256(
    ["uint256", "bool", "uint8", "bytes32"],
    [pactId, fulfilled, confidence, reasoningHash]
  );

  return arbiter.signMessage(ethers.getBytes(digest));
}

async function deployFixture() {
  const [deployer, agentA, agentB, treasury, stranger] = await ethers.getSigners();
  const arbiter = ethers.Wallet.createRandom().connect(ethers.provider);

  await deployer.sendTransaction({ to: arbiter.address, value: ethers.parseEther("1") });

  const ArbiterRegistry = await ethers.getContractFactory("ArbiterRegistry");
  const registry = await ArbiterRegistry.deploy(deployer.address);
  await registry.waitForDeployment();

  const ReputationNFT = await ethers.getContractFactory("ReputationNFT");
  const reputation = await ReputationNFT.deploy(deployer.address);
  await reputation.waitForDeployment();

  const PactEngine = await ethers.getContractFactory("PactEngine");
  const engine = await PactEngine.deploy(await reputation.getAddress(), await registry.getAddress(), treasury.address);
  await engine.waitForDeployment();

  await registry.addArbiter(arbiter.address);
  await reputation.grantRole(await reputation.ENGINE_ROLE(), await engine.getAddress());

  return { deployer, agentA, agentB, treasury, stranger, arbiter, registry, reputation, engine };
}

async function createActivePact(context: Awaited<ReturnType<typeof deployFixture>>, bond = MIN_BOND) {
  const deadline = (await latestTimestamp()) + 3600;
  const tx = await context.engine
    .connect(context.agentA)
    .createPact(context.agentB.address, COMMITMENT, ethers.toUtf8Bytes(COMMITMENT_URI), deadline, { value: bond });
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error("Missing createPact receipt");
  }

  return { pactId: 0n, deadline, receipt };
}

describe("PactEngine", () => {
  it("creates a pact successfully", async () => {
    const context = await deployFixture();
    const deadline = (await latestTimestamp()) + 3600;

    await expect(
      context.engine
        .connect(context.agentA)
        .createPact(context.agentB.address, COMMITMENT, ethers.toUtf8Bytes(COMMITMENT_URI), deadline, { value: MIN_BOND })
    )
      .to.emit(context.engine, "PactCreated")
      .withArgs(0, context.agentA.address, context.agentB.address, MIN_BOND, deadline);

    const pact = await context.engine.getPact(0);
    expect(pact.agentA).to.equal(context.agentA.address);
    expect(pact.agentB).to.equal(context.agentB.address);
    expect(pact.bond).to.equal(MIN_BOND);
    expect(pact.state).to.equal(1);
    expect(await context.reputation.agentToTokenId(context.agentA.address)).to.equal(1);
    expect(await context.reputation.agentToTokenId(context.agentB.address)).to.equal(2);
  });

  it("rejects zero bond pact creation", async () => {
    const context = await deployFixture();
    const deadline = (await latestTimestamp()) + 3600;

    await expect(
      context.engine.connect(context.agentA).createPact(context.agentB.address, COMMITMENT, ethers.toUtf8Bytes(COMMITMENT_URI), deadline)
    ).to.be.revertedWith("PactEngine: bond too low");
  });

  it("rejects past deadline pact creation", async () => {
    const context = await deployFixture();
    const deadline = (await latestTimestamp()) - 1;

    await expect(
      context.engine
        .connect(context.agentA)
        .createPact(context.agentB.address, COMMITMENT, ethers.toUtf8Bytes(COMMITMENT_URI), deadline, { value: MIN_BOND })
    ).to.be.revertedWith("PactEngine: invalid deadline");
  });

  it("rejects self-pacts", async () => {
    const context = await deployFixture();
    const deadline = (await latestTimestamp()) + 3600;

    await expect(
      context.engine
        .connect(context.agentA)
        .createPact(context.agentA.address, COMMITMENT, ethers.toUtf8Bytes(COMMITMENT_URI), deadline, { value: MIN_BOND })
    ).to.be.revertedWith("PactEngine: self pact");
  });

  it("settles fulfilled verdicts and returns the bond to agentA", async () => {
    const context = await deployFixture();
    await createActivePact(context);

    const reasoning = "The submitted evidence exactly matches the success condition.";
    const confidence = 94;
    const signature = await signVerdict(context.arbiter, 0n, true, confidence, reasoning);

    await expect(
      context.engine.connect(context.agentB).settleWithVerdict(0, true, confidence, reasoning, signature)
    ).to.changeEtherBalances([context.engine, context.agentA], [-MIN_BOND, MIN_BOND]);

    const pact = await context.engine.getPact(0);
    expect(pact.state).to.equal(2);
    expect(pact.confidenceScore).to.equal(confidence);
  });

  it("settles breached verdicts and splits the bond", async () => {
    const context = await deployFixture();
    const bond = ethers.parseEther("1");
    await createActivePact(context, bond);

    const reasoning = "The evidence does not prove the promised output was delivered.";
    const confidence = 91;
    const signature = await signVerdict(context.arbiter, 0n, false, confidence, reasoning);
    const fee = (bond * 500n) / 10_000n;
    const agentBAmount = (bond - fee) / 2n;
    const treasuryAmount = bond - agentBAmount;

    await expect(
      context.engine.connect(context.agentB).settleWithVerdict(0, false, confidence, reasoning, signature)
    ).to.changeEtherBalances([context.engine, context.agentB, context.treasury], [-bond, agentBAmount, treasuryAmount]);

    const pact = await context.engine.getPact(0);
    expect(pact.state).to.equal(3);
  });

  it("rejects invalid arbiter signatures", async () => {
    const context = await deployFixture();
    await createActivePact(context);

    const badArbiter = ethers.Wallet.createRandom();
    const reasoning = "A non-registered signer should not be accepted.";
    const signature = await signVerdict(badArbiter, 0n, true, 90, reasoning);

    await expect(
      context.engine.connect(context.agentB).settleWithVerdict(0, true, 90, reasoning, signature)
    ).to.be.revertedWith("PactEngine: invalid arbiter");
  });

  it("rejects already-settled pacts", async () => {
    const context = await deployFixture();
    await createActivePact(context);

    const reasoning = "The pact was fulfilled.";
    const signature = await signVerdict(context.arbiter, 0n, true, 90, reasoning);
    await context.engine.connect(context.agentB).settleWithVerdict(0, true, 90, reasoning, signature);

    await expect(
      context.engine.connect(context.agentB).settleWithVerdict(0, true, 90, reasoning, signature)
    ).to.be.revertedWith("PactEngine: pact not active");
  });

  it("reverts soulbound NFT transfers", async () => {
    const context = await deployFixture();
    await createActivePact(context);
    const tokenId = await context.reputation.agentToTokenId(context.agentA.address);

    await expect(
      context.reputation
        .connect(context.agentA)
        .transferFrom(context.agentA.address, context.stranger.address, tokenId)
    ).to.be.revertedWith("Soulbound: non-transferable");
  });

  it("updates reputation scores correctly", async () => {
    const context = await deployFixture();
    const bond = ethers.parseEther("2");
    await createActivePact(context, bond);

    const fulfilledReasoning = "The pact was fulfilled with strong evidence.";
    const fulfilledSignature = await signVerdict(context.arbiter, 0n, true, 95, fulfilledReasoning);
    await context.engine.connect(context.agentB).settleWithVerdict(0, true, 95, fulfilledReasoning, fulfilledSignature);

    const deadline = (await latestTimestamp()) + 3600;
    await context.engine
      .connect(context.agentA)
      .createPact(context.agentB.address, COMMITMENT, ethers.toUtf8Bytes(COMMITMENT_URI), deadline, { value: bond });

    const breachedReasoning = "The pact was breached because the required evidence is missing.";
    const breachedSignature = await signVerdict(context.arbiter, 1n, false, 92, breachedReasoning);
    await context.engine.connect(context.agentB).settleWithVerdict(1, false, 92, breachedReasoning, breachedSignature);

    const score = await context.reputation.getScore(context.agentA.address);
    expect(score.fulfilled).to.equal(1);
    expect(score.breached).to.equal(1);
    expect(score.disputed).to.equal(0);
    expect(score.totalBondHonored).to.equal(bond);
    expect(score.totalBondSlashed).to.equal(bond);
  });
});
