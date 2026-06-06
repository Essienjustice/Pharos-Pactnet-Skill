import fs from "node:fs";
import path from "node:path";
import "@nomicfoundation/hardhat-ethers/internal/type-extensions";
import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const ArbiterRegistry = await ethers.getContractFactory("ArbiterRegistry");
  const arbiterRegistry = await ArbiterRegistry.deploy(deployer.address);
  await arbiterRegistry.waitForDeployment();

  const ReputationNFT = await ethers.getContractFactory("ReputationNFT");
  const reputationNFT = await ReputationNFT.deploy(deployer.address);
  await reputationNFT.waitForDeployment();

  const PactEngine = await ethers.getContractFactory("PactEngine");
  const pactEngine = await PactEngine.deploy(
    await reputationNFT.getAddress(),
    await arbiterRegistry.getAddress(),
    deployer.address
  );
  await pactEngine.waitForDeployment();

  const engineRole = await reputationNFT.ENGINE_ROLE();
  await (await reputationNFT.grantRole(engineRole, await pactEngine.getAddress())).wait();

  const arbiterPublicKey = process.env.ARBITER_PUBLIC_KEY;
  if (arbiterPublicKey) {
    await (await arbiterRegistry.addArbiter(arbiterPublicKey)).wait();
  }

  const addresses = {
    arbiterRegistry: await arbiterRegistry.getAddress(),
    reputationNFT: await reputationNFT.getAddress(),
    pactEngine: await pactEngine.getAddress()
  };

  console.log(`ArbiterRegistry deployed to ${addresses.arbiterRegistry}`);
  console.log(`ReputationNFT deployed to ${addresses.reputationNFT}`);
  console.log(`PactEngine deployed to ${addresses.pactEngine}`);

  const outputFileByNetwork: Record<string, string> = {
    pharosMainnet: "pharos-mainnet.json",
    pharosTestnet: "pharos-testnet.json",
    pharosAtlanticTestnet: "pharos-atlantic-testnet.json"
  };
  const outputFile = outputFileByNetwork[network.name] ?? `${network.name}.json`;
  const outputPath = path.resolve(__dirname, `../deployments/${outputFile}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(addresses, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
