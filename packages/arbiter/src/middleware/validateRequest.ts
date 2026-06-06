import type { NextFunction, Request, Response } from "express";

const MAX_BODY_BYTES = 64 * 1024;
const SQL_INJECTION_PATTERNS = [
  /(\bunion\b\s+\bselect\b)/i,
  /(\bselect\b.+\bfrom\b)/i,
  /(\binsert\b\s+\binto\b)/i,
  /(\bupdate\b.+\bset\b)/i,
  /(\bdelete\b\s+\bfrom\b)/i,
  /(\bdrop\b\s+\btable\b)/i,
  /(--|\/\*|\*\/)/,
  /(\bor\b|\band\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i
];

const containsSqlInjectionPattern = (value: unknown): boolean => {
  if (typeof value === "string") {
    return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some(containsSqlInjectionPattern);
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(containsSqlInjectionPattern);
  }

  return false;
};

export function validateJsonRequest(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && !req.is("application/json")) {
    res.status(415).json({ error: "Content-Type must be application/json" });
    return;
  }

  const contentLength = Number(req.header("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    res.status(413).json({ error: "Request body exceeds 64kb limit" });
    return;
  }

  if (containsSqlInjectionPattern(req.body)) {
    res.status(400).json({ error: "Request body contains rejected input patterns" });
    return;
  }

  next();
}
