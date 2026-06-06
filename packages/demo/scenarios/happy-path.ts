import { runDemo } from "../run-demo.js";

runDemo("happy").catch((error) => {
  console.error(`[Demo] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
