# Alert Server

**[EN](https://github.com/sergeiown/Alert_Server/blob/main/README.md)** | [UA](https://github.com/sergeiown/Alert_Server/blob/main/README-UA.md)

A Windows tray application built with Electron that receives alert data from [alerts.in.ua](https://alerts.in.ua/) at a specified frequency and displays it through the Windows Notification Center for the regions of Ukraine you choose to monitor.

The app talks to alerts.in.ua through a small Cloudflare Worker proxy ([`alert-proxy/`](alert-proxy/)) that hides the API token and caches responses at the edge, so any number of installs share one token safely.

## Architecture

![architecture](docs/images/architecture-en.svg)

## Installation

Download the latest installer (`Alert Server Setup x.x.x.exe`) from [Releases](https://github.com/sergeiown/Alert_Server/releases) and run it. It's a standard NSIS installer: no administrator rights required, per-user install, with a Start Menu shortcut and uninstaller created automatically.

Future updates are detected and installed automatically from GitHub Releases; you'll only need to run the installer manually once.

## Usage

On first launch the app appears as a tray icon only, no window. Everything is controlled from the tray icon's context menu:

![tray menu](docs/images/tray-menu-uk.png)

*(menu shown in Ukrainian - the interface is fully available in both Ukrainian and English)*

- **Alert map** / **Front line map** open [alerts.in.ua](https://alerts.in.ua/) and [DeepState](https://deepstatemap.live) in a dedicated app window.
- **Settings…** opens the settings window, where you pick which regions to monitor (searchable tree, from oblast down to individual community), choose the interface language, toggle monochrome tray icon, sound notifications and their repeat count, and enable launching at Windows startup.
- **Information → Log** opens the event log; **About** shows the current version and license.

![settings window](docs/images/settings-window-en.png)

Notifications for the start and end of an alert appear through the Windows Notification Center; clicking a notification shows the alert's location and start time. An audio cue can be enabled alongside the visual notification and tray icon color change.

The event log is capped at 256 KB and automatically trimmed once it grows past that.

## Removal

Use the `Alert Server` entry in Windows Settings → Apps, or the uninstaller shortcut created alongside the Start Menu shortcut.

## Contribution

If you have suggestions or want to propose improvements to the project, please open a pull request.

## License

[Copyright (c) 2024 Serhii I. Myshko](https://github.com/sergeiown/Alert_Server/blob/main/LICENSE) - MIT License
