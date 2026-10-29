const { app, BrowserWindow, ipcMain } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');

let mainWindow;
let pollTimer;
const POLL_MS = 1000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#101318',
    title: 'NetScope',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const encodedScript = Buffer
      .from(script, 'utf16le')
      .toString('base64');

    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodedScript
      ],
      {
        windowsHide: true,
        timeout: 7000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        if (error) {
          return reject(
            new Error((stderr || error.message || 'PowerShell failed').trim())
          );
        }

        try {
          const output = stdout.trim();
          resolve(output ? JSON.parse(output) : []);
        } catch {
          reject(
            new Error(
              `Could not parse PowerShell JSON output: ${stdout.trim().slice(0, 500)}`
            )
          );
        }
      }
    );
  });
}

async function getNetworkSnapshot() {
  if (process.platform !== 'win32') {
    return { supported: false, error: 'Live adapter statistics are currently supported on Windows only.' };
  }

  // PowerShell returns only the adapter fields needed by the UI. No admin rights are required.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$stats = Get-NetAdapterStatistics -ErrorAction Stop",
    "$adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name, InterfaceDescription, Status, LinkSpeed, MacAddress, ifIndex",
    "$result = foreach ($s in $stats) {",
    "  $a = $adapters | Where-Object { $_.Name -eq $s.Name } | Select-Object -First 1",
    "  [PSCustomObject]@{",
    "    name = [string]$s.Name",
    "    description = [string]$a.InterfaceDescription",
    "    status = [string]$a.Status",
    "    linkSpeed = [string]$a.LinkSpeed",
    "    macAddress = [string]$a.MacAddress",
    "    received = [double]$s.ReceivedBytes",
    "    sent = [double]$s.SentBytes",
    "    receivedPackets = [double]$s.ReceivedUnicastPackets",
    "    sentPackets = [double]$s.SentUnicastPackets",
    "    index = [int]$a.ifIndex",
    "  }",
    "}",
    "$result | ConvertTo-Json -Compress -Depth 3"
  ].join('\r\n');

  try {
    const result = await runPowerShell(script);
    const adapters = Array.isArray(result) ? result : (result ? [result] : []);
    return { supported: true, timestamp: Date.now(), adapters };
  } catch (error) {
    return {
      supported: true,
      timestamp: Date.now(),
      adapters: [],
      error: 'Windows could not read adapter statistics. Check that PowerShell and Get-NetAdapterStatistics are available.',
      detail: error.message
    };
  }
}

function startPolling() {
  stopPolling();
  let busy = false;
  const poll = async () => {
    if (!mainWindow || mainWindow.isDestroyed() || busy) return;
    busy = true;
    try {
      const snapshot = await getNetworkSnapshot();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('network:snapshot', snapshot);
    } finally {
      busy = false;
    }
  };
  poll();
  pollTimer = setInterval(poll, POLL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

app.whenReady().then(() => {
  ipcMain.handle('network:get-snapshot', getNetworkSnapshot);
  createWindow();
  startPolling();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      startPolling();
    }
  });
});

app.on('window-all-closed', () => {
  stopPolling();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopPolling);
