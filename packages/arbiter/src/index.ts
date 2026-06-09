import "./env.js";
import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { evaluateRouter } from "./routes/evaluate.js";
import { healthRouter } from "./routes/health.js";
import { parseRouter } from "./routes/parse.js";
import { statusRouter } from "./routes/status.js";
import { apiKeyAuth } from "./middleware/auth.js";
import { evaluateRateLimit, parseRateLimit } from "./middleware/rateLimit.js";
import { validateJsonRequest } from "./middleware/validateRequest.js";

const port = Number(process.env.ARBITER_PORT ?? "3001");
const isDevelopment = process.env.NODE_ENV === "development";

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "64kb" }));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});

app.use(apiKeyAuth);

app.use("/health", healthRouter);
app.use("/arbiter/parse", parseRateLimit, validateJsonRequest, parseRouter);
app.use("/arbiter/evaluate", evaluateRateLimit, validateJsonRequest, evaluateRouter);
app.use("/arbiter/pact/:id", statusRouter);

const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected arbiter error";
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("Unhandled arbiter error", error);

  res.status(500).json({
    error: message,
    ...(isDevelopment && stack ? { stack } : {})
  });
};

app.use(errorHandler);

app.listen(port, () => {
  console.log(`PactNet arbiter listening on port ${port}`);
});

export { app };
