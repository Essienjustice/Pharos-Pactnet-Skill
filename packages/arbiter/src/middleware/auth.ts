import type { NextFunction, Request, Response } from "express";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const expectedApiKey = process.env.ARBITER_API_KEY;

  if (!expectedApiKey) {
    next();
    return;
  }

  const providedApiKey = req.header("X-API-Key");
  if (providedApiKey !== expectedApiKey) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }

  next();
}
