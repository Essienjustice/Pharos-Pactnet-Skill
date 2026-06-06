import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers/internal/type-extensions";
import dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config({ path: "../../.env" });

const pharosRpcUrl = process.env.PHAROS_RPC_URL ?? "";
const pharosChainId = Number(process.env.PHAROS_CHAIN_ID ?? "0");
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6"
  },
  networks: {
    pharosMainnet: {
      url: pharosRpcUrl,
      chainId: pharosChainId || undefined,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : []
    },
    pharosTestnet: {
      url: pharosRpcUrl,
      chainId: pharosChainId || undefined,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : []
    }
  }
};

export default config;
