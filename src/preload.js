'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kiosk', {
  onState: (callback) => ipcRenderer.on('state', (_event, state) => callback(state)),
  command: (name) => ipcRenderer.send('command', name),
});
