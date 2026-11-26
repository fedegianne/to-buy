# To Buy

A personal, offline-first shopping reminder PWA. No build step or dependencies.

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Add an item, choose any number of equivalent tags, and optionally add a priority flag, notes or product link. Multiple selected tags match ANY selected tag. Grouped view can show one item under several tags; purchasing it removes it everywhere. History supports Restore (undo a purchase) and Buy again (new item, retains history). Renaming or merging a tag updates all records including history.

## Deployment

Push these files to a dedicated GitHub repository and enable GitHub Pages from the main branch root. Open its HTTPS URL on iPhone Safari and Add to Home Screen (Open as Web App). Open online once before using offline. Increment the cache name in sw.js for every functional release.

## Data

IndexedDB stores data on this browser/device. No sync or backend. Export JSON backups from Settings and save them independently (e.g. iCloud Drive). Restore replaces all current data after confirmation. Localhost and GitHub Pages use different storage; transfer using backup/restore. Clearing app storage or removing the app can lose data. Avoid editing in multiple simultaneous tabs because state is saved as one record.
