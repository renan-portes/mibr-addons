const kind = process.argv[2];
if (kind !== "health" && kind !== "manifest" && kind !== "stream") process.exit(1);

const chunks: Buffer[] = [];
let size = 0;
for await (const chunk of process.stdin) {
  const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  size += value.length;
  if (size > 1024 * 1024) process.exit(1);
  chunks.push(value);
}

let value: unknown;
try {
  value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
  process.exit(1);
}

if (typeof value !== "object" || value === null) process.exit(1);
const record = value as Record<string, unknown>;
const valid = kind === "health"
  ? record.status === "ok"
  : kind === "manifest"
    ? typeof record.id === "string" && typeof record.name === "string" && Array.isArray(record.resources)
    : Array.isArray(record.streams);
process.exit(valid ? 0 : 1);
