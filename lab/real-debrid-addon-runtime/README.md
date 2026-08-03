# Real-Debrid addon runtime lab (experimental)

This isolated lab composes a new `ProviderManager` with `TorrentIndexerProvider` and, only when `enabled === true` plus a valid token are supplied, the opt-in Real-Debrid resolver chain. It does not alter the default bootstrap, public manifest, or public routes.

The versioned Compose file publishes no ports, runs as `1000:1000`, uses a read-only filesystem, drops all capabilities, has no Docker socket or persistent volume, and mounts an ephemeral token file read-only. The token is never an environment variable inside the container and must not be committed.

`tools/dry-run.ts` is intentionally offline: it always constructs the disabled composition and does not read the token file, perform DNS, fetch, or expose an addon endpoint. It is the only supported action for this milestone. A future separately authorized runtime execution must create a disposable secret file and override outside the repository, then validate an experimental manifest before any client installation.

The validated POSIX launcher is `scripts/dry-run.sh`. It rejects any supplied `REAL_DEBRID_TOKEN`, forces `REAL_DEBRID_ADDON_RUNTIME_ENABLED=false`, creates only an empty `0400` placeholder outside the repository, checks the rendered Compose JSON for published ports, performs one `compose run --rm --no-deps`, and always runs `compose down --remove-orphans`. It never prints the placeholder path or rendered environment. PowerShell equivalence is intentionally pending: Windows ACL-to-Linux UID semantics need a dedicated runtime validation.

The first Docker dry-run completed on runtime base `cf94968d6d7f641985e42bef6336408b63d4e907`: Compose rendered, the image built, the single run returned `DRY_RUN_OK` with exit code 0, no ports or external services were used, and `compose down` removed the residual project network and temporary placeholder.

No Stremio, Nuvio, playback, Docker runtime, or external service has been tested by this lab.

## Experimental HTTP runtime

`tools/http-server.ts` and the `addon-runtime-http-lab` Compose profile are a separate offline-only surface. They expose only `GET /health`, `GET /manifest.json`, and `GET /stream/{movie|series}/tt<id>.json` on loopback. The versioned Compose file still publishes no ports; `scripts/http-offline.sh` creates a disposable, mode-`600`, loopback-only override, validates it, retries health at most five times, and queries manifest and stream once each. The default response is empty and no token, DNS, fetch, Real-Debrid, Stremio, Nuvio, or playback is used. The standard manifest, bootstrap, and router remain unchanged.
