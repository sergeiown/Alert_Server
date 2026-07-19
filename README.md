# <img src="docs/images/icon.png" alt="" width="32" align="center" /> Alert Server

**[EN](https://github.com/sergeiown/Alert_Server/blob/main/README.md)** | [UA](https://github.com/sergeiown/Alert_Server/blob/main/README-UA.md)

> **Disclaimer. The aggressor state's full-scale war against Ukraine has been ongoing since February 2014 and escalated into a full invasion on February 24, 2022. The entire territory of Ukraine remains a zone of active hostilities and potential missile threat. Stay vigilant, never ignore air raid alerts, and follow safety guidelines.**

A Windows tray application built with Electron that receives alert data from [alerts.in.ua](https://alerts.in.ua/) at a specified frequency and displays it through the Windows Notification Center for the regions of Ukraine you choose to monitor.

## Architecture

![architecture](docs/images/architecture-en.svg)

## Installation

Download the latest installer (`Alert Server Setup x.x.x.exe`) from [Releases](https://github.com/sergeiown/Alert_Server/releases) and run it. It's a standard NSIS installer: no administrator rights required, per-user install, with a Start Menu shortcut and uninstaller created automatically.

Future updates are detected and installed automatically from GitHub Releases; you'll only need to run the installer manually once.

## Usage

On first launch the app appears as a tray icon only, no window. Everything is controlled from the tray icon's context menu:

![tray menu](docs/images/tray-menu-en.png)

- **Alert map** / **Front line map** open [alerts.in.ua](https://alerts.in.ua/) and [DeepState](https://deepstatemap.live) in a dedicated app window.
- **Forecast** opens a window showing, for each monitored region, either a notice that an alert is currently active or historical statistics from the past month (alert count, average interval, most common time and alert type, time since the last alert ended, and a soft trend-based estimate) - clearly labeled as statistics, not a guaranteed prediction. Each region's summary can be copied to the clipboard.
- **Settings…** opens the settings window, where you pick which regions to monitor (searchable tree, from oblast down to individual community), choose the interface language, toggle monochrome tray icon, sound notification mode (none, siren, or voice) and its repeat count, and enable launching at Windows startup. Follows the Windows light/dark theme automatically.
- **Information → Log** opens the event log; **About** shows the current version and license.

![settings window](docs/images/settings-window-en.png)

Notifications for the start and end of an alert appear through the Windows Notification Center; clicking one shows the alert's location and start time.

![alert notification](docs/images/alert-en.png)

The event log records app activity (start/exit, settings and region changes, alerts, update checks) and is capped at 256 KB, automatically trimmed once it grows past that.

## Removal

Use the `Alert Server` entry in Windows Settings → Apps, or the uninstaller shortcut created alongside the Start Menu shortcut.

## Contribution

If you have suggestions or want to propose improvements to the project, please open a pull request.

## License

[Copyright (c) 2024-2026 Serhii I. Myshko](https://github.com/sergeiown/Alert_Server/blob/main/LICENSE) - MIT License
