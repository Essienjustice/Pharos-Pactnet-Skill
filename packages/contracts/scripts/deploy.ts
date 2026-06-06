import "@nomicfoundation/hardhat-ethers/internal/type-extensions";
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const arbiterRegistry = await ethers.deployContract("ArbiterRegistry", [deployer.address]);
  await arbiterRegistry.waitForDeployment();

  const reputationNFT = await ethers.deployContract("ReputationNFT", [deployer.address]);
  await reputationNFT.waitForDeployment();

  const pactEngine = await ethers.deployContract("PactEngine", [
    await reputationNFT.getAddress(),
    await arbiterRegistry.getAddress(),
    deployer.address
  ]);
  await pactEngine.waitForDeployment();

  await reputationNFT.grantRole(await reputationNFT.ENGINE_ROLE(), await pactEngine.getAddress());

  console.log(`ArbiterRegistry deployed to ${await arbiterRegistry.getAddress()}`);
  console.log(`ReputationNFT deployed to ${await reputationNFT.getAddress()}`);
  console.log(`PactEngine deployed to ${await pactEngine.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
