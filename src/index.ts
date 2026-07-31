import { fileURLToPath } from "node:url";

/**
 * Entry point for the mibr-addons media addon.
 * Providers, parsers and services will be wired here in future iterations.
 */
export function main(): void {
  console.log("mibr-addons initialized");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
