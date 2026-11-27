# To Buy

Version 1.3.1 · Offline-first PWA.


**To Buy** is a lightweight shopping reminder app designed to help you remember what to buy and where to buy it.

Organize your shopping list using custom tags for shops, shopping centres, geographical areas or online stores. When you're heading somewhere, simply select the relevant tags to see what you need to buy.

Free, offline-capable and without accounts, advertisements or subscriptions.

## Installation

**[Open To Buy](https://fedegianne.github.io/to-buy/)**

To Buy is a Progressive Web App (PWA) that can be installed directly on your device without using an app store.

### iPhone / iPad

1. Open the app link in Safari.
2. Tap the Share button.
3. Select **Add to Home Screen**.
4. Enable **Open as Web App**, if available.
5. Tap **Add**.

### Android

1. Open the app link in Chrome.
2. Tap the three-dot menu.
3. Select **Install app** or **Add to Home screen**.
4. Confirm the installation.

The app can also be used directly from a desktop browser.

## Features

- Create, edit and delete shopping reminders.
- Assign multiple custom tags to each item.
- Search, filter and group items by tag.
- Mark important items as priorities.
- Add notes and product links.
- Keep track of previous purchases.
- Restore purchased items or buy them again.
- Create, rename, merge and delete tags.
- Automatic, light and dark appearance modes.
- Offline functionality.
- Local data storage with backup and restore.

## How to use

### To Buy

Add items to your shopping list using the **+** button. Only the item name is required. Tags, priority, notes and product links are optional.

Each item can have multiple tags. For example:

| Item | Tags |
|---|---|
| Jeans | H&M, Zara, Euroma2 |
| Sandpaper | Leroy Merlin, Bricocenter |
| USB-C cable | MediaWorld, Amazon |
| Gym shoes | Decathlon |

Select one or more tags to filter your shopping list. Items matching any of the selected tags will be displayed.

When an item is purchased, mark it as completed. It will be removed from all active groups and moved to History.

### Tags

View and manage your custom tags, along with the number of outstanding items associated with each tag.

Select a tag to view its shopping list. Tags can also be renamed, merged or deleted. Renaming or merging a tag updates both active items and purchase history.

### History

Access previously purchased items.

- **Restore:** undo a purchase and return the item to the active shopping list.
- **Buy again:** create a new shopping reminder while preserving the original purchase record.

### Settings

Customize the app appearance and manage your data through the backup and restore functions.

## Data and privacy

All personal records are stored locally on your device using IndexedDB. No personal records are uploaded to an external database.

The app does not require an account and does not automatically synchronize data between devices.

Cloudflare Web Analytics is used to collect privacy-focused, aggregate website usage statistics, such as page visits, browser type, operating system, approximate geographical region and loading performance.

Analytics does not access personal records stored within the app and does not use tracking cookies.

For further information, see the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).

## Backup and restore

Export your shopping list, tags, purchase history and settings as a JSON backup file from the Settings page.

To recover your data, select a previously exported backup file using the Restore function. Restoring a backup replaces the current app data.

**Regular backups are recommended. Always create a backup before:**

- Removing or reinstalling the app.
- Clearing browser or application storage.
- Changing your device.
- Resetting your device.

Keep backup files in a safe location, such as iCloud Drive, Google Drive or your computer.

## Offline use and updates

After the first successful online launch, the app can be used without an internet connection.

An internet connection is required to receive application updates. Updates are downloaded automatically and normally do not affect locally stored data.

## Development

Built using HTML, CSS, vanilla JavaScript, IndexedDB and Service Workers. No external dependencies or build tools are required.

### Run locally

```bash
python3 -m http.server 8001
```

Open `http://localhost:8001` in your browser.

### Deployment

The app is hosted using GitHub Pages. Changes pushed to the main branch are automatically deployed.

Increment the service worker cache version in `sw.js` when releasing functional or visual updates.

## Emergency backup reminder

Settings → Data and backups offers a device-local reminder every day, every 7 days (default), every 30 days, or Never. The first reminder is due when records exist and no emergency export has been requested. Later reminders require both changed records and the selected interval to have elapsed. Later dismisses the reminder for the current launch/day. The app requests persistent browser storage where supported.

The emergency export creates `to-buy-emergency.json` in the existing JSON backup format. Save it outside the app, preferably in Files or iCloud Drive, and replace the previous emergency file if prompted. The app cannot silently overwrite external files or verify that a download was saved. The displayed timestamp records the export request, not confirmation of a completed save. Normal dated exports are unchanged. Empty emergency exports are disabled; both backup types can be restored through Restore JSON. Reminder preferences and export fingerprints are stored separately on this device, not inside the exported records. Persistent storage is best effort, not a replacement for an external backup.
