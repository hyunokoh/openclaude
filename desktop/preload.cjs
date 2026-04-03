const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('openclaudeDesktop', {
  getStore: () => ipcRenderer.invoke('desktop:get-store'),
  saveStore: store => ipcRenderer.invoke('desktop:save-store', store),
  launch: store => ipcRenderer.invoke('desktop:launch', store),
  restart: () => ipcRenderer.invoke('desktop:restart'),
  stop: () => ipcRenderer.invoke('desktop:stop'),
  onTerminalData: callback => ipcRenderer.on('terminal:data', (_event, data) => callback(data)),
  onTerminalExit: callback => ipcRenderer.on('terminal:exit', (_event, data) => callback(data)),
  onTerminalError: callback => ipcRenderer.on('terminal:error', (_event, data) => callback(data)),
})
