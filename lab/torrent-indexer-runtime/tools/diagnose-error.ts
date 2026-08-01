import { diagnoseAndDeleteTemporaryFiles } from "../runtimeContractReport.js";

const [body, logs, environment, dns, egress, torrentIndexerLogs, flaresolverrLogs, marker] = process.argv.slice(2);
if ([body, logs, environment, dns, egress, torrentIndexerLogs, flaresolverrLogs, marker].some((value) => value === undefined)) {
  throw new Error("Usage: diagnose-error.ts <body> <logs> <environment> <dns> <egress> <torrent-indexer-logs> <flaresolverr-logs> <marker>");
}

const report = await diagnoseAndDeleteTemporaryFiles({
  body: body!, logs: logs!, environment: environment!, dns: dns!, egress: egress!,
  torrentIndexerLogs: torrentIndexerLogs!, flaresolverrLogs: flaresolverrLogs!, marker: marker!,
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
