import { runPublicProbe } from "../publicProbe.js";

const report = await runPublicProbe(process.env.PROBE_INDEXER);
process.stdout.write(`${JSON.stringify(report)}\n`);
