import { parseRuntimeInteger, validateRuntimeContractConfig } from "../runtimeContractReport.js";

validateRuntimeContractConfig({
  authorizationConfirmed: process.env.CONTRACT_TEST_AUTHORIZED === "true",
  indexer: process.env.CONTRACT_TEST_INDEXER ?? "",
  term: process.env.CONTRACT_TEST_TERM ?? "",
  limit: parseRuntimeInteger(process.env.CONTRACT_TEST_LIMIT, "CONTRACT_TEST_LIMIT"),
  timeoutSeconds: parseRuntimeInteger(process.env.CONTRACT_TEST_TIMEOUT_SECONDS, "CONTRACT_TEST_TIMEOUT_SECONDS"),
  maxResponseBytes: parseRuntimeInteger(process.env.CONTRACT_TEST_MAX_RESPONSE_BYTES, "CONTRACT_TEST_MAX_RESPONSE_BYTES"),
});
