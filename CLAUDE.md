# CLAUDE.md - Project Guide for AI Assistants

## Project: @deanhiller/gsuitecli

Multi-account Google Workspace CLI — Gmail, Drive, Sheets, Docs.

## Tech Stack
- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js (ES2022, NodeNext modules)
- **Build:** `tsc` → `dist/`
- **CLI Framework:** Commander.js
- **Google API:** `googleapis` SDK with OAuth2 (desktop app flow, local callback server)
- **Build System:** Nx (single project)
- **Linting:** ESLint with @typescript-eslint + custom webpieces config

## Commands
- `npm run build` — Compile TypeScript
- `npm run dev` — Run via tsx (no build needed)
- `npx nx lint gsuitecli` — Lint

## Architecture
```
src/
├── index.ts              # Entry point, registers all command groups
├── config.ts             # Paths (~/.config/gsuite/), credentials loader, scopes
├── auth.ts               # OAuth2 login flow (browser → localhost callback)
├── lib/
│   ├── token-store.ts    # Per-account refresh token storage (tokens.json)
│   ├── google-client.ts  # Auth client + service factories (gmail, drive, sheets, docs)
│   └── oauth-server.ts   # Ephemeral HTTP server for OAuth callback
└── commands/
    ├── account-resolver.ts  # Resolves --account flag or auto-selects single account
    ├── setup-command.ts     # Interactive GCP project + OAuth setup wizard
    ├── auth-commands.ts     # login, logout, list
    ├── gmail-commands.ts    # list, read, read-batch, send, search, labels, archive, move
    ├── drive-commands.ts    # list, upload, download, mkdir
    ├── sheets-commands.ts   # create, read, write
    └── docs-commands.ts     # create, read, append
```

## Key Patterns
- All commands accept `--account <email>` for multi-account support
- Credentials stored at `~/.config/gsuite/client_credentials.json` (GCP OAuth client)
- Tokens stored at `~/.config/gsuite/tokens.json` (per-account refresh tokens)
- OAuth uses `prompt: 'consent'` + `access_type: 'offline'` for reliable refresh tokens
- `resolveAccount()` auto-selects when only one account is logged in
- Error handling uses typed GaxiosError pattern for API errors

## Conventions
- Explicit TypeScript types on declarations (no implicit any)
- `.js` extensions in imports (NodeNext module resolution)
- File permissions: 0o600 for secrets, 0o700 for config dirs
- Commands are grouped under subcommands: `gsuite gmail list`, `gsuite drive upload`, etc.
