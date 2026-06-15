# Squad relay — deployment runbook

Deploys the Squad Mode relay on the home server, exposed to the public internet
through **Tailscale Funnel** as a dedicated node named `tarkovmoa`.

- **Public URL:** `https://tarkovmoa.<tailnet>.ts.net` (squad socket: `wss://…`)
- **No port-forwarding, no home IP exposure** — Funnel proxies through Tailscale.
- **Self-healing:** `restart: unless-stopped` + the server's UPS / RTC-self-wake.
- **Isolated:** a separate Tailscale identity; the host's `moahomeserver` node and
  its other Tailscale services are untouched.

## Security posture

- Relay bundled to a single `.mjs`; runtime image has **no node_modules, no dev
  tooling, no source** — just `node` + tini.
- Container runs **non-root**, **read-only rootfs**, `cap_drop: ALL`,
  `no-new-privileges`, with `mem_limit`/`pids_limit`.
- Tailscale runs in **userspace mode** (no `NET_ADMIN`, no `/dev/net/tun`).
- App layer: 64 KB frame cap, per-socket rate limit, **CSPRNG room codes**, global
  `MAX_ROOMS`/`MAX_CONNECTIONS` caps, strict join validation, origin re-stamping,
  whitelisted feedback metadata, `/stats` gated by `STATS_TOKEN`.

## One-time tailnet setup (admin console)

1. **Enable HTTPS certificates:** admin console → **DNS** → enable MagicDNS +
   **Enable HTTPS**. (Funnel requires this. Also unblocks Vaultwarden's serve URL.)
2. **ACL** — add the relay tag and grant it Funnel (admin console → **Access
   controls**):
   ```jsonc
   "tagOwners": {
     "tag:relay": ["autogroup:admin"]
   },
   "nodeAttrs": [
     { "target": ["tag:relay"], "attr": ["funnel"] }
   ]
   ```
3. **Auth key:** Settings → **Keys** → Generate auth key — *Reusable* ON,
   *Ephemeral* ON, *Tags* `tag:relay`. Copy it into `.env`.

## Deploy

```bash
cd ~/docker/squad-relay          # the compose lives here on the server
cp .env.example .env             # then fill TS_AUTHKEY (+ STATS_TOKEN if wanted)
docker compose up -d --build
```

## Verify

```bash
docker compose logs -f tailscale     # wait for "Funnel started" / a public URL
docker compose logs -f relay         # "squad-relay listening on :8787"

# From anything on the public internet:
curl -fsS https://tarkovmoa.<tailnet>.ts.net/health    # -> {"ok":true}
```

## Update to a new relay build

```bash
git pull
docker compose up -d --build         # rebuilds the bundle, recreates the relay
```

## Notes

- `serve-config.json` uses the `${TS_CERT_DOMAIN}` placeholder, which Tailscale
  substitutes with the node FQDN — so it's portable across tailnets.
- Feedback persists to the `relay-data` volume (`/data/feedback.jsonl`).
- Tailscale state persists to `ts-state` — the node keeps its identity across
  restarts and does not re-auth.
