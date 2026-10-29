# NetScope

A lightweight Windows network monitor built with Electron, JavaScript, HTML, and CSS.

## Features

- Live combined download and upload speed
- Cumulative bytes received and sent by Windows network adapters
- Simple 60-sample traffic chart
- Adapter status, link speed, descriptions, and counters
- Refreshes once per second
- No account, cloud service, or database
- Minimal dependencies and a compact interface

## Requirements

- Windows 10 or Windows 11
- Node.js 20+ (for development)
- npm

NetScope reads adapter counters through Windows PowerShell's `Get-NetAdapterStatistics` and `Get-NetAdapter` cmdlets. Administrator privileges are not normally required. Adapter counters are cumulative Windows counters, not necessarily totals for the current day or month. Virtual adapters may also appear.

## Run from source

```bash
npm install
npm start
```

## Build the Windows installer

```bash
npm run dist
```

The installer is written to the `release` directory.

## Notes

- Live adapter statistics are currently Windows-only.
- If PowerShell's networking cmdlets are unavailable, the app displays a clear error instead of fabricated data.
- The app uses Electron context isolation and a restricted preload bridge. Renderer code does not have direct Node.js access.
- Network speed is calculated from differences between consecutive Windows byte counters while NetScope is running.

## License

MIT
