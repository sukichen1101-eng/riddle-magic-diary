# Riddle Hosted Launch

Public hosted version of the handwritten AI diary. The browser never receives the Kimi API key.

## Local run

1. Copy `.env.example` to `.env` and fill `SESSION_SECRET` and `KIMI_API_KEY`.
2. Load the environment variables in your shell.
3. Generate launch codes: `npm run codes -- 100 launch`.
4. Start: `npm start`.
5. Open `http://localhost:3000`.

Node itself does not load `.env`; the deployment platform should inject these variables. For local PowerShell:

```powershell
$env:SESSION_SECRET = "a-random-secret-at-least-32-characters"
$env:KIMI_API_KEY = "sk-..."
npm run codes -- 100 launch
npm start
```

The generated CSV contains plaintext buyer codes and must stay private. `data/codes.json` stores only keyed hashes, activation state and device IDs.

## Deployment tonight

Use a single Node instance with a persistent disk mounted for `data/codes.json` (Railway, Render, VPS or another Node host). Required settings:

- Build command: none (or `npm install`, there are no dependencies)
- Start command: `npm start`
- Health URL: `/`
- Persistent file: `/app/data/codes.json` or set `CODES_FILE` to the mounted path
- HTTPS public URL in `PUBLIC_ORIGIN`
- Environment variables from `.env.example`
- One instance only; the JSON store is intentionally minimal and not multi-instance safe

Before sales, generate/import the 100 codes against the same `SESSION_SECRET` and production data file. Back up `data/codes.json` after generation and daily during launch.

## Safety behavior

Normal customers see no per-minute throttle. Two high emergency fuses remain: 500 requests/code/day and 5,000 requests/site/day by default. Change them through environment variables only after observing real cost.

## Rollback

Deploy the preceding Git commit and restore the latest `codes.json` backup. Never roll back the data file to a copy made before sold codes were activated unless you intentionally want to reset device bindings.
