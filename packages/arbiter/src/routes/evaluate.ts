import { CONFIDENCE_THRESHOLD_AUTO_SETTLE, SubmitEvidenceSchema } from "@pactnet/shared";
import { Router, type Router as ExpressRouter } from "express";
import { PactStore } from "../storage/PactStore.js";
import { ArbiterAgent } from "../services/ArbiterAgent.js";
import { ChainService } from "../services/ChainService.js";

export const evaluateRouter: ExpressRouter = Router();

const arbiterAgent = new ArbiterAgent();
const pactStore = new PactStore(process.env.DB_PATH ?? "pactnet.db");
let chainService: ChainService | null = null;

const getChainService = (): ChainService => {
  chainService ??= new ChainService();
  return chainService;
};

evaluateRouter.post("/", async (req, res, next) => {
  try {
    const parsedBody = SubmitEvidenceSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        error: "Invalid evidence submission",
        issues: parsedBody.error.flatten()
      });
      return;
    }

    const evidence = parsedBody.data;
    const chainService = getChainService();
    const pact = await chainService.getPact(evidence.pactId);

    if (!pact) {
      res.status(404).json({ error: `Pact ${evidence.pactId} was not found` });
      return;
    }

    if (pact.state !== "Active") {
      res.status(409).json({ error: `Pact ${evidence.pactId} is ${pact.state}, not Active` });
      return;
    }

    const verdict = await arbiterAgent.evaluateEvidence(pact, evidence);

    if (verdict.confidence >= CONFIDENCE_THRESHOLD_AUTO_SETTLE) {
      await chainService.settleWithVerdict(pact, verdict);
      pactStore.log(pact.id, "auto_settled", {
        confidence: verdict.confidence,
        fulfilled: verdict.fulfilled
      });
    }

    pactStore.saveVerdict(verdict);
    pactStore.log(pact.id, "verdict_saved", verdict);

    res.json({
      ...verdict,
      ...(arbiterAgent.modeLabel ? { arbiterMode: arbiterAgent.modeLabel } : {})
    });
  } catch (error) {
    next(new Error(`Failed to evaluate evidence: ${error instanceof Error ? error.message : String(error)}`));
  }
});
