# ⚠ Local alert update server

**[EN](https://github.com/sergeiown/Alert_Server/blob/main/README.md)** | [UA](https://github.com/sergeiown/Alert_Server/blob/main/README-UA.md)

A Node.js server adapted for 64-bit versions of Windows that receives data on alerts provided by [alerts.in.ua](https://alerts.in.ua/) at a specified frequency with subsequent processing and display of notifications about the start and end of alerts in the regions of Ukraine selected for monitoring.


| Structure: |  |
| --- | --- |
| Dependencies | ![image](https://github.com/user-attachments/assets/58c7b454-ac18-43d9-b852-39a60c7ccb0f) |

## Installation

The possibility of fully automated installation has been implemented at the moment. The installer is made in a minimalist version using Batch scripts and PowerShell.

The procedure is as follows:
- download the installer archive `Alert_server_setup.zip` available here: [Alert server releases](https://github.com/sergeiown/Alert_Server/releases);
- extract the installer from the archive to the selected location;
- run the `Alert_server_setup.bat` installer.

The installation will be performed in the location `%userprofile%\Documents\Alert_Server`, during the installation the availability of [Git](https://git-scm.com/), [Node.js](https://nodejs.org/en) and [Microsoft .NET Framework 3.5](https://www.microsoft.com/en-us/download/details.aspx?id=21) will be checked and installed or update if necessary.

Actually installation of the local alarm update server consists of importing the project from the [GitHub](https://github.com/sergeiown/Alert_Server) repository and installing the necessary dependencies and shortcuts in the Start menu.

| Disclaimer: *testing and adaptation of the functionality was carried out on 64-bit versions of Windows 10 22H2 and 11 22H2. Features may be limited or unavailable on other platforms or versions of Windows. We recommend using Windows 10 version 22H2 or Windows 11 for the best experience. Please note that the interface is currently available in Ukrainian and English.* |                       [![windows_compatibility](https://github.com/user-attachments/assets/db2b5487-b5bf-45d9-8948-48bb88162f17)](https://en.wikipedia.org/wiki/List_of_Microsoft_Windows_versions)                       |
| :--- | :---: |

## Usage

Using the local alert update server is surprisingly easy and intuitive. The first run is performed automatically after the installation process is complete.

The status and settings are displayed and managed through the tray icon menu. The settings include starting the server at system startup, activating audio notifications, and selecting regions for which alerts will be monitored. The tray icon can be displayed in monochrome or color. 

Notifications about the current alert and alert cancellation, as well as saving the alert history, are provided through the Windows Notification Center using [Snoretoast](https://github.com/KDE/snoretoast). Additionally, alarm indication through the tray icon and audio alerts are used. The tray icon menu also allows you to view a map of current alerts [alerts.in.ua](https://alerts.in.ua/) and a map of the current state of the front line [DeepState](https://deepstatemap.live).

All actions are recorded in a log file, the size of which is automatically limited to 256 KB, and can be viewed through the tray icon menu.

| Appearance of notifications:  |||
| --- | --- | --- |
| ![1](https://github.com/sergeiown/Alert_Server/assets/112722061/90697f7c-e2d4-44dd-a4ee-d4974439cabc) | ![2](https://github.com/sergeiown/Alert_Server/assets/112722061/c954dfd2-673e-4a0d-9784-d4f2b37fe845) | ![3](https://github.com/sergeiown/Alert_Server/assets/112722061/4b487a03-ccc7-463f-986a-102198e844a9) |
| Server start                  | Active alert                      | Cancel the alert |

| Appearance of the settings:  ||
| --- | --- |
| Region selection | ![info4](https://github.com/sergeiown/Alert_Server/assets/112722061/eabb38f7-6900-404d-83f3-0e8ee38f9172) | 

## Removal

| Recommendation: |  |
| --- | --- |
| If you need to uninstall the local alert update server use the `Uninstall Alert server` shortcut in the `Start` => `Alert server` menu. | ![image](https://github.com/user-attachments/assets/f0bb8bac-cac3-4a71-b43e-eb4d61a86123) |

## Contribution

If you have suggestions or want to propose improvements to the project, please open a pull request.

## License

[Copyright (c) 2024 Serhii I. Myshko](https://github.com/sergeiown/Current_Alert/blob/main/LICENSE)
