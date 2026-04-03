const vscode = require('vscode');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const OPENCLAUDE_REPO_URL = 'https://github.com/Gitlawb/openclaude';
const OPENCLAUDE_SETUP_URL = `${OPENCLAUDE_REPO_URL}#web-search-and-fetch`;
const DEFAULT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
const CODEX_ALIAS_MODELS = new Set([
  'codexplan',
  'codexspark',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
]);

function getPrimaryWorkspaceFolder() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
}

function resolveWorkspaceVariables(value) {
  if (!value) {
    return value;
  }

  const workspaceFolder = getPrimaryWorkspaceFolder();
  const workspaceFolderBasename = workspaceFolder
    ? path.basename(workspaceFolder)
    : '';

  return value
    .replaceAll('${workspaceFolder}', workspaceFolder)
    .replaceAll('${workspaceFolderBasename}', workspaceFolderBasename);
}

function resolveConfiguredPath(rawPath) {
  const trimmed = (rawPath || '').trim();
  if (!trimmed) {
    return '';
  }

  const expanded =
    trimmed.startsWith('~/') || trimmed === '~'
      ? path.join(os.homedir(), trimmed.slice(2))
      : resolveWorkspaceVariables(trimmed);

  if (path.isAbsolute(expanded)) {
    return expanded;
  }

  const workspaceFolder = getPrimaryWorkspaceFolder();
  return workspaceFolder ? path.resolve(workspaceFolder, expanded) : path.resolve(expanded);
}

function parseDotEnv(content) {
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] || '';

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    env[key] = value;
  }

  return env;
}

function readEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  try {
    return parseDotEnv(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function sanitizeStringRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
      .map(([key, entryValue]) => [key, String(entryValue)])
  );
}

function asTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isEnabledFlag(value) {
  const normalized = asTrimmedString(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length < 2) {
    return undefined;
  }

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

function readNestedString(value, paths) {
  for (const currentPath of paths) {
    let current = value;
    let valid = true;

    for (const key of currentPath) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        valid = false;
        break;
      }

      current = current[key];
    }

    const resolved = asTrimmedString(current);
    if (valid && resolved) {
      return resolved;
    }
  }

  return '';
}

function parseChatgptAccountId(token) {
  if (!token) {
    return '';
  }

  const payload = decodeJwtPayload(token);
  return (
    asTrimmedString(payload?.['https://api.openai.com/auth.chatgpt_account_id']) ||
    asTrimmedString(payload?.chatgpt_account_id)
  );
}

function resolveCodexAuthPath(env) {
  const explicit = asTrimmedString(env.CODEX_AUTH_JSON_PATH);
  if (explicit) {
    return resolveConfiguredPath(explicit);
  }

  const codexHome = asTrimmedString(env.CODEX_HOME);
  if (codexHome) {
    return path.join(resolveConfiguredPath(codexHome), 'auth.json');
  }

  return path.join(os.homedir(), '.codex', 'auth.json');
}

function loadCodexAuthJson(authPath) {
  if (!authPath || !fs.existsSync(authPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function resolveCodexCredentials(env) {
  const envApiKey = asTrimmedString(env.CODEX_API_KEY);
  const envAccountId =
    asTrimmedString(env.CODEX_ACCOUNT_ID) ||
    asTrimmedString(env.CHATGPT_ACCOUNT_ID);

  if (envApiKey) {
    return {
      apiKey: envApiKey,
      accountId: envAccountId || parseChatgptAccountId(envApiKey),
      source: 'env',
    };
  }

  const authPath = resolveCodexAuthPath(env);
  const authJson = loadCodexAuthJson(authPath);
  if (!authJson) {
    return {
      apiKey: '',
      accountId: '',
      authPath,
      source: 'none',
    };
  }

  const apiKey = readNestedString(authJson, [
    ['access_token'],
    ['accessToken'],
    ['tokens', 'access_token'],
    ['tokens', 'accessToken'],
    ['auth', 'access_token'],
    ['auth', 'accessToken'],
    ['token', 'access_token'],
    ['token', 'accessToken'],
    ['tokens', 'id_token'],
    ['tokens', 'idToken'],
  ]);
  const accountId =
    envAccountId ||
    readNestedString(authJson, [
      ['account_id'],
      ['accountId'],
      ['tokens', 'account_id'],
      ['tokens', 'accountId'],
      ['auth', 'account_id'],
      ['auth', 'accountId'],
    ]) ||
    parseChatgptAccountId(apiKey);

  return {
    apiKey,
    accountId,
    authPath,
    source: apiKey ? 'auth.json' : 'none',
  };
}

function isCodexBaseUrl(baseUrl) {
  if (!baseUrl) {
    return false;
  }

  try {
    const parsed = new URL(baseUrl);
    const codexBaseUrl = new URL(DEFAULT_CODEX_BASE_URL);
    return (
      parsed.hostname === codexBaseUrl.hostname &&
      parsed.pathname.replace(/\/+$/, '') === codexBaseUrl.pathname
    );
  } catch {
    return false;
  }
}

function isCodexModel(model, baseUrl) {
  const normalizedModel = asTrimmedString(model).split('?', 1)[0].toLowerCase();
  return CODEX_ALIAS_MODELS.has(normalizedModel) || isCodexBaseUrl(baseUrl);
}

function getProviderLabel(providerPreset, env) {
  if (providerPreset === 'codex' || isCodexModel(env.OPENAI_MODEL, env.OPENAI_BASE_URL)) {
    return 'codex';
  }

  if (providerPreset === 'openai' || isEnabledFlag(env.CLAUDE_CODE_USE_OPENAI)) {
    return 'openai-compatible';
  }

  return 'default';
}

function getWebSearchMode(env, codexCredentials) {
  if (asTrimmedString(env.FIRECRAWL_API_KEY)) {
    return 'firecrawl';
  }

  if (
    isCodexModel(env.OPENAI_MODEL, env.OPENAI_BASE_URL) &&
    codexCredentials.apiKey &&
    codexCredentials.accountId
  ) {
    return 'codex';
  }

  return 'disabled';
}

function buildLaunchProfile() {
  const configured = vscode.workspace.getConfiguration('openclaude');
  const providerPreset = configured.get('providerPreset', 'default');
  const launchCommand = configured.get('launchCommand', 'openclaude');
  const terminalName = configured.get('terminalName', 'OpenClaude');
  const shimEnabled = configured.get('useOpenAIShim', false);
  const envFileSetting = configured.get('envFile', '');
  const envFilePath = resolveConfiguredPath(envFileSetting);
  const envFromFile = readEnvFile(envFilePath);
  const extraEnv = sanitizeStringRecord(configured.get('extraEnv', {}));

  const envOverrides = {
    ...envFromFile,
    ...extraEnv,
  };

  if (shimEnabled || providerPreset !== 'default') {
    envOverrides.CLAUDE_CODE_USE_OPENAI = '1';
  }

  if (providerPreset === 'codex' && !asTrimmedString(envOverrides.OPENAI_MODEL)) {
    envOverrides.OPENAI_MODEL = 'gpt-5.4';
  }

  const model = asTrimmedString(configured.get('model', ''));
  const baseUrl = asTrimmedString(configured.get('baseUrl', ''));
  const firecrawlApiKey = asTrimmedString(configured.get('firecrawlApiKey', ''));
  const codexApiKey = asTrimmedString(configured.get('codexApiKey', ''));
  const chatgptAccountId = asTrimmedString(configured.get('chatgptAccountId', ''));
  const codexAuthJsonPath = resolveConfiguredPath(
    asTrimmedString(configured.get('codexAuthJsonPath', ''))
  );

  if (model) {
    envOverrides.OPENAI_MODEL = model;
  }
  if (baseUrl) {
    envOverrides.OPENAI_BASE_URL = baseUrl;
  }
  if (firecrawlApiKey) {
    envOverrides.FIRECRAWL_API_KEY = firecrawlApiKey;
  }
  if (codexApiKey) {
    envOverrides.CODEX_API_KEY = codexApiKey;
  }
  if (chatgptAccountId) {
    envOverrides.CHATGPT_ACCOUNT_ID = chatgptAccountId;
  }
  if (codexAuthJsonPath) {
    envOverrides.CODEX_AUTH_JSON_PATH = codexAuthJsonPath;
  }

  const effectiveEnv = {
    ...process.env,
    ...envOverrides,
  };
  const codexCredentials = resolveCodexCredentials(effectiveEnv);
  const webSearchMode = getWebSearchMode(effectiveEnv, codexCredentials);

  return {
    configured,
    launchCommand,
    terminalName,
    envOverrides,
    effectiveEnv,
    providerPreset,
    shimEnabled,
    model: asTrimmedString(effectiveEnv.OPENAI_MODEL) || 'default',
    envFilePath,
    codexCredentials,
    webSearchMode,
  };
}

async function showLaunchError(message) {
  const action = await vscode.window.showErrorMessage(
    message,
    'Open Settings',
    'Open Setup Guide'
  );

  if (action === 'Open Settings') {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      '@ext:devnull-bootloader.openclaude'
    );
  } else if (action === 'Open Setup Guide') {
    await vscode.env.openExternal(vscode.Uri.parse(OPENCLAUDE_SETUP_URL));
  }
}

async function validateLaunchProfile(launchProfile) {
  const requireWebSearch = launchProfile.configured.get('requireWebSearch', false);
  const usesCodex = isCodexModel(
    launchProfile.effectiveEnv.OPENAI_MODEL,
    launchProfile.effectiveEnv.OPENAI_BASE_URL
  );

  if (usesCodex && !launchProfile.codexCredentials.apiKey) {
    await showLaunchError(
      'OpenClaude Codex launch needs CODEX_API_KEY or a valid ~/.codex/auth.json.'
    );
    return false;
  }

  if (usesCodex && !launchProfile.codexCredentials.accountId) {
    await showLaunchError(
      'OpenClaude Codex launch needs CHATGPT_ACCOUNT_ID or an auth.json with chatgpt_account_id.'
    );
    return false;
  }

  if (requireWebSearch && launchProfile.webSearchMode === 'disabled') {
    await showLaunchError(
      'Web search is required for this workspace, but it is unavailable. Use Codex with valid auth or set FIRECRAWL_API_KEY.'
    );
    return false;
  }

  return true;
}

async function isCommandAvailable(command) {
  try {
    if (!command) {
      return false;
    }

    if (process.platform === 'win32') {
      await execAsync(`where ${command}`);
    } else {
      await execAsync(`command -v ${command}`);
    }

    return true;
  } catch {
    return false;
  }
}

function getExecutableFromCommand(command) {
  return command.trim().split(/\s+/)[0];
}

async function launchOpenClaude() {
  const launchProfile = buildLaunchProfile();
  const { launchCommand, terminalName } = launchProfile;
  const executable = getExecutableFromCommand(launchCommand);
  const installed = await isCommandAvailable(executable);

  if (!installed) {
    const action = await vscode.window.showErrorMessage(
      `OpenClaude command not found: ${executable}. Install it with: npm install -g @gitlawb/openclaude`,
      'Open Repository'
    );

    if (action === 'Open Repository') {
      await vscode.env.openExternal(vscode.Uri.parse(OPENCLAUDE_REPO_URL));
    }

    return;
  }

  const isValid = await validateLaunchProfile(launchProfile);
  if (!isValid) {
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: terminalName,
    env: launchProfile.envOverrides,
  });

  terminal.show(true);
  terminal.sendText(launchCommand, true);
}

class OpenClaudeControlCenterProvider {
  async resolveWebviewView(webviewView) {
    webviewView.webview.options = { enableScripts: true };
    const launchProfile = buildLaunchProfile();
    const { launchCommand, shimEnabled, providerPreset, model, webSearchMode, envFilePath } =
      launchProfile;
    const executable = getExecutableFromCommand(launchCommand);
    const installed = await isCommandAvailable(executable);
    const shortcut = process.platform === 'darwin' ? 'Cmd+Shift+P' : 'Ctrl+Shift+P';

    webviewView.webview.html = this.getHtml(webviewView.webview, {
      installed,
      shimEnabled,
      shortcut,
      executable,
      providerLabel: getProviderLabel(providerPreset, launchProfile.effectiveEnv),
      modelLabel: model,
      searchLabel: webSearchMode === 'disabled' ? 'disabled' : webSearchMode,
      envFileLabel: envFilePath || 'inherit shell env',
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === 'launch') {
        await launchOpenClaude();
        return;
      }

      if (message?.type === 'docs') {
        await vscode.env.openExternal(vscode.Uri.parse(OPENCLAUDE_REPO_URL));
        return;
      }

      if (message?.type === 'commands') {
        await vscode.commands.executeCommand('workbench.action.showCommands');
      }
    });
  }

  getHtml(webview, status) {
    const nonce = crypto.randomBytes(16).toString('base64');
    const runtimeLabel = status.installed ? 'available' : 'missing';
    const shimLabel = status.shimEnabled ? 'enabled (CLAUDE_CODE_USE_OPENAI=1)' : 'disabled';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --oc-bg-1: #081018;
      --oc-bg-2: #0e1b29;
      --oc-line: #2f4d63;
      --oc-accent: #7fffd4;
      --oc-accent-dim: #4db89a;
      --oc-text-dim: #94a7b5;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: "Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, monospace;
      color: var(--vscode-foreground);
      background:
        radial-gradient(circle at 85% -10%, color-mix(in srgb, var(--oc-accent) 16%, transparent), transparent 45%),
        linear-gradient(165deg, var(--oc-bg-1), var(--oc-bg-2));
      padding: 14px;
      min-height: 100vh;
      line-height: 1.45;
      letter-spacing: 0.15px;
      overflow-x: hidden;
    }
    .panel {
      border: 1px solid color-mix(in srgb, var(--oc-line) 80%, var(--vscode-editorWidget-border));
      border-radius: 10px;
      background: color-mix(in srgb, var(--oc-bg-1) 78%, var(--vscode-sideBar-background));
      box-shadow: 0 0 0 1px rgba(127, 255, 212, 0.08), 0 10px 24px rgba(0, 0, 0, 0.35);
      overflow: hidden;
      animation: boot 360ms ease-out;
    }
    .topbar {
      padding: 8px 10px;
      font-size: 10px;
      text-transform: uppercase;
      color: var(--oc-text-dim);
      border-bottom: 1px solid var(--oc-line);
      background: color-mix(in srgb, var(--oc-bg-2) 74%, black);
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .boot-dot {
      color: var(--oc-accent);
      animation: blink 1.2s steps(1, end) infinite;
    }
    .content {
      padding: 12px;
      display: grid;
      gap: 14px;
    }
    .title {
      color: var(--oc-accent);
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .sub {
      color: var(--oc-text-dim);
      font-size: 11px;
    }
    .terminal-box {
      border: 1px dashed color-mix(in srgb, var(--oc-line) 78%, white);
      border-radius: 8px;
      padding: 10px;
      background: color-mix(in srgb, var(--oc-bg-2) 78%, black);
      font-size: 11px;
      display: grid;
      gap: 6px;
    }
    .terminal-row {
      color: var(--oc-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .prompt {
      color: var(--oc-accent);
    }
    .cursor::after {
      content: "_";
      animation: blink 1s steps(1, end) infinite;
      margin-left: 1px;
    }
    .actions {
      display: grid;
      gap: 8px;
    }
    .btn {
      width: 100%;
      border: 1px solid var(--oc-line);
      border-radius: 7px;
      padding: 10px;
      cursor: pointer;
      text-align: left;
      font-family: inherit;
      font-size: 11px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
      background: color-mix(in srgb, var(--oc-bg-2) 82%, black);
      color: var(--vscode-foreground);
      position: relative;
      overflow: hidden;
    }
    .btn::before {
      content: ">";
      color: var(--oc-accent-dim);
      margin-right: 8px;
      display: inline-block;
      width: 10px;
    }
    .btn:hover {
      border-color: var(--oc-accent-dim);
      transform: translateX(2px);
      background: color-mix(in srgb, var(--oc-bg-2) 68%, #113642);
    }
    .btn.primary {
      border-color: color-mix(in srgb, var(--oc-accent) 50%, var(--oc-line));
      box-shadow: inset 0 0 0 1px rgba(127, 255, 212, 0.12);
    }
    .hint {
      font-size: 10px;
      color: var(--oc-text-dim);
      border-top: 1px solid var(--oc-line);
      padding-top: 10px;
    }
    .hint code {
      font-family: inherit;
      color: var(--oc-accent);
      background: rgba(0, 0, 0, 0.26);
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid rgba(127, 255, 212, 0.14);
    }
    @keyframes blink {
      50% {
        opacity: 0;
      }
    }
    @keyframes boot {
      from {
        transform: translateY(6px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  </style>
</head>
<body>
  <div class="panel">
    <div class="topbar">
      <span>openclaude control center</span>
      <span class="boot-dot">online</span>
    </div>
    <div class="content">
      <div>
        <div class="title">READY FOR INPUT</div>
        <div class="sub">Terminal-oriented workflow with direct command access.</div>
      </div>

      <div class="terminal-box">
        <div class="terminal-row"><span class="prompt">$</span> openclaude --status</div>
        <div class="terminal-row">runtime: ${runtimeLabel}</div>
        <div class="terminal-row">shim: ${shimLabel}</div>
        <div class="terminal-row">provider: ${status.providerLabel}</div>
        <div class="terminal-row">model: ${status.modelLabel}</div>
        <div class="terminal-row">search: ${status.searchLabel}</div>
        <div class="terminal-row">env: ${status.envFileLabel}</div>
        <div class="terminal-row">command: ${status.executable}</div>
        <div class="terminal-row"><span class="prompt">$</span> <span class="cursor">awaiting command</span></div>
      </div>

      <div class="actions">
        <button class="btn primary" id="launch">Launch OpenClaude</button>
        <button class="btn" id="docs">Open Repository</button>
        <button class="btn" id="commands">Open Command Palette</button>
      </div>

      <div class="hint">
        Quick trigger: use <code>${status.shortcut}</code> and run OpenClaude commands from anywhere.
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('launch').addEventListener('click', () => vscode.postMessage({ type: 'launch' }));
    document.getElementById('docs').addEventListener('click', () => vscode.postMessage({ type: 'docs' }));
    document.getElementById('commands').addEventListener('click', () => vscode.postMessage({ type: 'commands' }));
  </script>
</body>
</html>`;
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const startCommand = vscode.commands.registerCommand('openclaude.start', async () => {
    await launchOpenClaude();
  });

  const openDocsCommand = vscode.commands.registerCommand('openclaude.openDocs', async () => {
    await vscode.env.openExternal(vscode.Uri.parse(OPENCLAUDE_REPO_URL));
  });

  const openUiCommand = vscode.commands.registerCommand('openclaude.openControlCenter', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.openclaude');
  });

  const provider = new OpenClaudeControlCenterProvider();
  const providerDisposable = vscode.window.registerWebviewViewProvider('openclaude.controlCenter', provider);

  context.subscriptions.push(startCommand, openDocsCommand, openUiCommand, providerDisposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
