# Real-Debrid addon runtime lab (experimental)

This isolated lab composes a new `ProviderManager` with `TorrentIndexerProvider` and, only when `enabled === true` plus a valid token are supplied, the opt-in Real-Debrid resolver chain. It does not alter the default bootstrap, public manifest, or public routes.

The versioned Compose file publishes no ports, runs as `1000:1000`, uses a read-only filesystem, drops all capabilities, has no Docker socket or persistent volume, and mounts an ephemeral token file read-only. The token is never an environment variable inside the container and must not be committed.

`tools/dry-run.ts` is intentionally offline: it always constructs the disabled composition and does not read the token file, perform DNS, fetch, or expose an addon endpoint. It is the only supported action for this milestone. A future separately authorized runtime execution must create a disposable secret file and override outside the repository, then validate an experimental manifest before any client installation.

No Stremio, Nuvio, playback, Docker runtime, or external service has been tested by this lab.
