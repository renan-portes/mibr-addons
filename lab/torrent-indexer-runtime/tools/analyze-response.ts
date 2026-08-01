import { analyzeAndDeleteRawResponse } from "../runtimeContractReport.js";

const path = process.argv[2];
if (path === undefined) {
  throw new Error("Usage: tsx analyze-response.ts <temporary-json-path>");
}

const report = await analyzeAndDeleteRawResponse(path);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status === "PARTIAL_ZERO_RESULTS") process.exitCode = 2;
