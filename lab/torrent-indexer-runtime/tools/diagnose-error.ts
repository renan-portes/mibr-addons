import { diagnoseAndDeleteTemporaryFiles } from "../runtimeContractReport.js";

const [body, logs, environment, dns, egress] = process.argv.slice(2);
if ([body, logs, environment, dns, egress].some((value) => value === undefined)) {
  throw new Error("Usage: diagnose-error.ts <body> <logs> <environment> <dns> <egress>");
}

const report = await diagnoseAndDeleteTemporaryFiles({
  body: body!, logs: logs!, environment: environment!, dns: dns!, egress: egress!,
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
