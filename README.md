# Riddle Hosted Launch

Public hosted version of the handwritten AI diary. The browser never receives the Kimi API key.

The source code is free to self-host under the MIT License. One codebase supports two modes:

- `AUTH_REQUIRED=false`: direct self-host mode. Visitors open the diary immediately.
- `AUTH_REQUIRED=true`: hosted operator mode. Visitors must enter an access code.

In both modes, the API key is configured on the server and is never sent to the browser.

## Local run

1. Copy `.env.example` to `.env`, set `AUTH_REQUIRED=false`, and fill `KIMI_API_KEY`.
2. Load the environment variables in your shell.
3. Start: `npm start`.
4. Open `http://localhost:3000`.

Node itself does not load `.env`; the deployment platform should inject these variables. For local PowerShell:

```powershell
$env:KIMI_API_KEY = "sk-..."
$env:AUTH_REQUIRED = "false"
npm start
```

For a hosted access-code service, set `AUTH_REQUIRED=true`, add a random `SESSION_SECRET` of at least 32 characters, then run `npm run codes -- 100 launch` before starting the service.

The generated CSV contains plaintext buyer codes and must stay private. `data/codes.json` stores only keyed hashes, activation state and device IDs.

## Deployment tonight

Use a single Node instance with a persistent disk mounted for `data/codes.json` (Railway, Render, VPS or another Node host). Required settings:

- Build command: none (or `npm install`, there are no dependencies)
- Start command: `npm start`
- Health URL: `/`
- Persistent file: `/app/data/codes.json` or set `CODES_FILE` to the mounted path
- HTTPS public URL in `PUBLIC_ORIGIN`
- `AUTH_REQUIRED=true` for the commercial access-code mode
- Environment variables from `.env.example`
- One instance only; the JSON store is intentionally minimal and not multi-instance safe

Before sales, generate/import the 100 codes against the same `SESSION_SECRET` and production data file. Back up `data/codes.json` after generation and daily during launch.

## Safety behavior

Normal customers see no per-minute throttle. Two high emergency fuses remain: 500 requests/code/day and 5,000 requests/site/day by default. Change them through environment variables only after observing real cost.

## Rollback

Deploy the preceding Git commit and restore the latest `codes.json` backup. Never roll back the data file to a copy made before sold codes were activated unless you intentionally want to reset device bindings.
