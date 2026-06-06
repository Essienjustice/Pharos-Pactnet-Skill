import { Router, type Router as ExpressRouter } from "express";
import { DETERMINISTIC_ARBITER_MODE } from "@pactnet/shared";
import { PactStore } from "../storage/PactStore.js";
import { ChainService } from "../services/ChainService.js";

export const statusRouter: ExpressRouter = Router({ mergeParams: true });

const pactStore = new PactStore(process.env.DB_PATH ?? "pactnet.db");
let chainService: ChainService | null = null;

const getChainService = (): ChainService => {
  chainService ??= new ChainService();
  return chainService;
};

statusRouter.get("/", async (req: import("express").Request<{ id: string }>, res, next) => {
  try {
    const pactId = req.params.id;

    if (!pactId) {
      res.status(400).json({ error: "pactId is required" });
      return;
    }

    const chainService = getChainService();
    const [pact, verdict] = await Promise.all([
      chainService.getPact(pactId),
      Promise.resolve(pactStore.getVerdict(pactId))
    ]);

    res.json({
      pact,
      verdict,
      ...(!process.env.ANTHROPIC_API_KEY ? { arbiterMode: DETERMINISTIC_ARBITER_MODE } : {})
    });
  } catch (error) {
    next(new Error(`Failed to load pact status: ${error instanceof Error ? error.message : String(error)}`));
  }
});
