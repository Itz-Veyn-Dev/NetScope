const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('netScope', {
  getSnapshot: () => ipcRenderer.invoke('network:get-snapshot'),
  onSnapshot: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('network:snapshot', listener);
    return () => ipcRenderer.removeListener('network:snapshot', listener);
  }
});
