import { Router, type Router as ExpressRouter } from "express";
import { DETERMINISTIC_ARBITER_MODE } from "@pactnet/shared";
import { ChainService } from "../services/ChainService.js";
import { PactStore } from "../storage/PactStore.js";

export const healthRouter: ExpressRouter = Router();

const pactStore = new PactStore(process.env.DB_PATH ?? "pactnet.db");
let chainService: ChainService | null = null;

const getChainService = (): ChainService => {
  chainService ??= new ChainService();
  return chainService;
};

healthRouter.get("/", async (_req, res) => {
  let latestBlock = 0;
  let chainConnected = false;
  let arbiterAddress = "";

  try {
    const chain = getChainService();
    latestBlock = await chain.getLatestBlock();
    chainConnected = latestBlock > 0;
    arbiterAddress = chain.getArbiterAddress();
  } catch (error) {
    console.error("Health chain check failed", error);
  }

  let dbSize = 0;
  try {
    dbSize = pactStore.getDbSizeBytes();
  } catch (error) {
    console.error("Health database check failed", error);
  }

  res.json({
    ok: chainConnected && dbSize >= 0,
    version: "1.0.0",
    uptime: process.uptime(),
    chainConnected,
    latestBlock,
    dbSize,
    arbiterAddress,
    ...(!process.env.ANTHROPIC_API_KEY ? { arbiterMode: DETERMINISTIC_ARBITER_MODE } : {})
  });
});
