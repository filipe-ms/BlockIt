# BlockIt
This extension lets users create a block list. If a script opens a new tab with a matching hostname, the extension automatically closes it.

## Features
- Add or remove hostnames to a block list.
- Automatically detects and closes tabs containing blocked hostnames that were opened by scripts.
- Nearly undetectable: Since it allows the tab to open before instantly closing it, it shouldn't trigger any anti-adblock popups.
- Simple and lightweight.

## Installation (local only, for now)
1. Clone or download the extension source files to your local machine and extract them into a folder.
2. Open `chrome://extensions/` in your Chrome browser.
3. **Ensure Developer Mode is turned on** (toggle in the top-right corner).
4. Click "Load unpacked" and navigate to the folder where you extracted the extension files.
5. Select the folder and click "Open." The extension will be added to your browser.

## Usage (popup)
1. When an unwanted page opens in a new tab, click the BlockIt icon in your browser toolbar.
2. Click "Block this page." If it was opened by a script, the page should close instantly.
3. The extension will block the tab again anytime a script attempts to reopen it.

## Usage (options page)
1. Right-click the BlockIt icon.
2. Choose "Options."
3. In the left menu, there is a field to enter a new hostname.
4. Enter the hostname and click the checkmark.
5. The hostname should now be blocked, and any script-opened tabs with that hostname will be closed instantly.

## Permissions
BlockIt requires the following permissions:
- `tabs`: To detect and close newly opened tabs from blocked hostnames.
- `storage`: To store the block list locally.