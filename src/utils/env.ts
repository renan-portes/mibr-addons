const DEFAULT_PORT = 7000;

export function getPort(env: NodeJS.ProcessEnv = process.env): number {
  const rawPort = env.PORT;

  if (rawPort === undefined || rawPort.trim() === "") {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return port;
}
