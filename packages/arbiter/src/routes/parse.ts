import { ParseRequestSchema } from "@pactnet/shared";
import { Router, type Router as ExpressRouter } from "express";
import { ArbiterAgent } from "../services/ArbiterAgent.js";

export const parseRouter: ExpressRouter = Router();

const arbiterAgent = new ArbiterAgent();

parseRouter.post("/", async (req, res, next) => {
  try {
    const parsedBody = ParseRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        error: "Invalid parse request",
        issues: parsedBody.error.flatten()
      });
      return;
    }

    const parsedCommitment = await arbiterAgent.parseCommitment(parsedBody.data.text);
    res.json({
      ...parsedCommitment,
      ...(arbiterAgent.modeLabel ? { arbiterMode: arbiterAgent.modeLabel } : {})
    });
  } catch (error) {
    next(new Error(`Failed to parse commitment: ${error instanceof Error ? error.message : String(error)}`));
  }
});
