const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const STORE_PATH = path.join(app.getPath('userData'), 'openclaude-desktop.json')
let mainWindow = null
let currentProcess = null

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
  } catch {
    return {
      launchCommand: 'openclaude',
      envFile: '',
      providerPreset: 'default',
      extraEnv: '',
    }
  }
}

function writeStore(nextStore) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(nextStore, null, 2))
}

function parseEnvFile(filePath) {
  if (!filePath) return {}
  try {
    const resolved = filePath.startsWith('~/')
      ? path.join(os.homedir(), filePath.slice(2))
      : filePath
    const content = fs.readFileSync(resolved, 'utf8')
    const entries = {}
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match) continue
      let value = match[2] || ''
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\n/g, '\n')
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1)
      }
      entries[match[1]] = value
    }
    return entries
  } catch {
    return {}
  }
}

function parseExtraEnv(text) {
  if (!text.trim()) return {}
  const entries = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (key) entries[key] = value
  }
  return entries
}

function buildEnv(store) {
  const env = {
    ...process.env,
    ...parseEnvFile(store.envFile),
    ...parseExtraEnv(store.extraEnv || ''),
  }

  if (store.providerPreset && store.providerPreset !== 'default') {
    env.CLAUDE_CODE_USE_OPENAI = '1'
  }
  if (store.providerPreset === 'codex' && !env.OPENAI_MODEL) {
    env.OPENAI_MODEL = 'gpt-5.4'
  }
  return env
}

function sendTerminalEvent(type, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(type, payload)
  }
}

function stopCurrentProcess() {
  if (!currentProcess) return
  currentProcess.kill('SIGTERM')
  currentProcess = null
}

function launchOpenClaude(store) {
  stopCurrentProcess()
  const command = store.launchCommand || 'openclaude'
  currentProcess = spawn(command, {
    cwd: process.cwd(),
    env: buildEnv(store),
    shell: true,
  })

  currentProcess.stdout.on('data', chunk => {
    sendTerminalEvent('terminal:data', chunk.toString())
  })

  currentProcess.stderr.on('data', chunk => {
    sendTerminalEvent('terminal:data', chunk.toString())
  })

  currentProcess.on('close', code => {
    sendTerminalEvent('terminal:exit', { code })
    currentProcess = null
  })

  currentProcess.on('error', error => {
    sendTerminalEvent('terminal:error', { message: error.message })
    currentProcess = null
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'index.html'))
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('desktop:get-store', () => readStore())
  ipcMain.handle('desktop:save-store', (_event, nextStore) => {
    writeStore(nextStore)
    return readStore()
  })
  ipcMain.handle('desktop:launch', (_event, store) => {
    writeStore(store)
    launchOpenClaude(store)
    return { ok: true }
  })
  ipcMain.handle('desktop:restart', () => {
    launchOpenClaude(readStore())
    return { ok: true }
  })
  ipcMain.handle('desktop:stop', () => {
    stopCurrentProcess()
    return { ok: true }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopCurrentProcess()
  if (process.platform !== 'darwin') app.quit()
})
