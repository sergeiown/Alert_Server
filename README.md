# ⚠ Local alert update server

**[EN](https://github.com/sergeiown/Alert_Server/blob/main/README.md)** | [UA](https://github.com/sergeiown/Alert_Server/blob/main/README-UA.md)

A Node.js server adapted for 64-bit versions of Windows that receives data on alerts provided by [alerts.in.ua](https://alerts.in.ua/) at a specified frequency with subsequent processing and display of notifications about the start and end of alerts in the regions of Ukraine selected for monitoring.


| Structure: |  |
| --- | --- |
| Dependencies | ![image](https://github.com/sergeiown/Alert_Server/assets/112722061/08280db3-bf47-4b51-bc90-ab4b5d1dc5c0) |

## Installation

The possibility of fully automated installation has been implemented at the moment. The installer is made in a minimalist version using Batch scripts and PowerShell.

The procedure is as follows:
- download the installer archive `Alert_server_setup.zip` available here: [Alert server releases](https://github.com/sergeiown/Alert_Server/releases);
- extract the installer from the archive to the selected location;
- run the `Alert_server_setup.bat` installer.

The installation will be performed in the location `%userprofile%\Documents\Alert_Server`, during the installation the availability of [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/en) will be checked and installed if necessary.

Actually installation of the local alarm update server consists of importing the project from the [GitHub](https://github.com/sergeiown/Alert_Server) repository and installing the necessary dependencies and shortcuts in the Start menu.

The code is open source, no compiled files are used.

---
***Disclaimer:***  
*Testing and adaptation of the functionality was carried out on 64-bit versions of Windows 10 22H2 and 11 22H2.*  
*Features may be limited or unavailable on other platforms or versions of Windows.*  
*We recommend using Windows 10 version 22H2 or Windows 11 for the best experience.*  
*Please note that only the Ukrainian version is available.*

## Usage

Using the local alert update server is surprisingly easy and intuitive. The first run is performed automatically after the installation process is complete.

The status and settings are displayed and managed through the tray icon menu. The settings include starting the server at system startup, activating audio notifications, and selecting regions for which alerts will be monitored. The tray icon can be displayed in monochrome or color. 

Notifications about the current alert and alert cancellation, as well as saving the alert history, are provided through the Windows Notification Center using [Snoretoast] (https://github.com/KDE/snoretoast). Additionally, alarm indication through the tray icon and audio alerts are used. The tray icon menu also allows you to view a map of current alerts [alerts.in.ua] (https://alerts.in.ua/) and a map of the current state of the front line [DeepState] (https://deepstatemap.live).

All actions are recorded in a log file, the size of which is automatically limited to 256 KB, and can be viewed through the tray icon menu.

| Appearance of notifications:  |||
| --- | --- | --- |
| ![info1](https://github.com/sergeiown/Alert_Server/assets/112722061/9e0bdb50-229f-4616-8425-9e7c390c104a) | ![info2](https://github.com/sergeiown/Alert_Server/assets/112722061/4ef3c9a4-9b1a-4023-89d0-267e4b5afc48) | ![info3](https://github.com/sergeiown/Alert_Server/assets/112722061/1ab1e93c-bb93-4d1c-be27-9918a6252ad4) |
| Server start                  | Active alert                      | Cancel the alert |

| Appearance of the settings:  ||
| --- | --- |
| ![image](https://github.com/sergeiown/Alert_Server/assets/112722061/509d25bc-8f07-4e8d-9f7d-4795b7830238) | ![111](https://github.com/sergeiown/Alert_Server/assets/112722061/b4cf4c28-d45b-47ae-af6f-a4f84befa665) | 
## Removal

| Recommendation: |  |
| --- | --- |
| If you need to uninstall the local alert update server use the `Uninstall` shortcut in the Start => Alert server menu. | ![image](https://github.com/sergeiown/Alert_Server/assets/112722061/139ee2ee-e07c-44b7-b2a2-4e42c8542dea) |

## Contribution

If you have suggestions or want to propose improvements to the project, please open a pull request.

## License

[Copyright (c) 2024 Serhii I. Myshko](https://github.com/sergeiown/Current_Alert/blob/main/LICENSE)
