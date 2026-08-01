const DEFAULT_PORT = 7000;

export function getPort(env: NodeJS.ProcessEnv = process.env): number {
  const rawPort = env.PORT;

  if (rawPort === undefined) {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(rawPort)) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return port;
}
