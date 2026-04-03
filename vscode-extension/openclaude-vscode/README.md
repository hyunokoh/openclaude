# OpenClaude VS Code Extension

A sleek VS Code companion for OpenClaude with a visual **Control Center** plus terminal-first workflows.

## Features

- **Control Center sidebar UI** in the Activity Bar:
  - Launch OpenClaude
  - Open repository/docs
  - Open VS Code theme picker
- **Terminal launch command**: `OpenClaude: Launch in Terminal`
- **Codex preset**: launch OpenClaude with GPT-5.4 on the Codex backend
- **Search-aware preflight**: warns before launch when Codex auth or required web search is unavailable
- **Built-in dark theme**: `OpenClaude Terminal Black` (terminal-inspired, low-glare, neon accents)

## Requirements

- VS Code `1.95+`
- `openclaude` available in your terminal PATH (`npm install -g @gitlawb/openclaude`)

## Commands

- `OpenClaude: Open Control Center`
- `OpenClaude: Launch in Terminal`
- `OpenClaude: Open Repository`

## Settings

Note: OpenClaude itself now supports a separate `uiLanguage` setting (`ko` by default) for harness UI text. That setting is configured inside OpenClaude, not inside the VS Code extension.


- `openclaude.launchCommand` (default: `openclaude`)
- `openclaude.terminalName` (default: `OpenClaude`)
- `openclaude.useOpenAIShim` (default: `false`)
- `openclaude.providerPreset` (`default`, `openai`, `codex`)
- `openclaude.model` (for example `gpt-5.4` or `codexplan`)
- `openclaude.baseUrl`
- `openclaude.envFile`
- `openclaude.firecrawlApiKey`
- `openclaude.codexApiKey`
- `openclaude.chatgptAccountId`
- `openclaude.codexAuthJsonPath`
- `openclaude.extraEnv`
- `openclaude.requireWebSearch`

## Quick Setup For Codex GPT-5.4

Use these workspace settings:

```json
{
  "openclaude.useOpenAIShim": true,
  "openclaude.providerPreset": "codex",
  "openclaude.model": "gpt-5.4",
  "openclaude.requireWebSearch": true,
  "openclaude.envFile": "${workspaceFolder}/.env.openclaude"
}
```

Then create `.env.openclaude` if you want to override auth or add Firecrawl. If you already use the Codex CLI, OpenClaude can read `~/.codex/auth.json` automatically.

## Development

From this folder:

```bash
npm run lint
```

To package (optional):

```bash
npm run package
```
