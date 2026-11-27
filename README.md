# UltraGYM

Version 1.1.1 — personal, offline-first strength training log. No accounts, backend or advertisements. Cloudflare Web Analytics collects aggregate usage statistics without accessing local workout records. Designed for iPhone Home Screen installation, with the same muted green palette as To Buy.

## Run locally

Open a terminal in this folder and run:

```sh
python3 -m http.server 8002
```

Open <http://localhost:8002/> in your browser. Don't open `index.html` directly: JavaScript modules and the service worker require a web origin. No npm installation or build step is needed. The app starts with an empty exercise library and no sample records.

For an iPhone, use an HTTPS deployment (such as GitHub Pages). Data entered in localhost, a browser and an installed Home Screen app may be kept in different storage containers.

## Deploy with GitHub Pages

Create a new repository, e.g. `ultragym`. With GitHub CLI already authenticated, run these commands **inside this folder**, not its parent:

```sh
git init -b main
git add .
git commit -m "Initial UltraGYM release"
gh repo create ultragym --public --source=. --remote=origin --push
```

In the repository's Settings → Pages, select **Deploy from a branch**, branch `main`, folder `/ (root)`. Save. Once GitHub reports deployment complete, open the published address in Safari and choose Share → Add to Home Screen. Check the website works before adding it.

## What is implemented

- Home: new/resume workout, latest bodyweight, last finished workout.
- Workout: single-exercise logging with large weight/reps fields and LOG button, previous-set suggestions, set equipment, RPE/RIR, notes, live statistics and expandable graphs. Every logged set is persisted in IndexedDB. Current workout allows edits/deletion/additions, and finishing shows a summary and rep records.
- Timer: tap the time to enter minutes and seconds (00:01–99:59), presets, ±30 seconds, start and stop/reset. Logging restarts the configured duration; switching exercises does not stop the timer. Remaining time is calculated from a stored deadline. During an active countdown, ±30 adjusts that countdown only; when stopped it adjusts the default duration. Three slow full-screen white pulses followed by a green glow indicate expiry until the next touch or key press. Reduced-motion mode skips the pulses. No sound, vibration or wake lock.
- Six measurement types: weight × reps, bodyweight × reps (reps only), time, weight × time, distance (integer m or ft), weight × distance. Time is entered as integer minutes and seconds. Reps and distance reject fractional input; manually entered weights accept decimals.
- Calendar: inspect, edit, delete or add past workouts; resume only today's sessions. If an unfinished workout is from another day, finish or discard it before starting a new one.
- Records: favourites, exercise search, muscle-group filtering, exact-repetition records, Epley/Brzycki estimated 1RM, 1/2 years or all time; exercise graphs and session history. Graph windows: 1/3/6/12 months or all time. Equipment filters support any/with/without; imported sets with unknown gear are excluded from specific filters.
- Bodyweight: optional dated records, notes, edits/deletion and graph. Relative graphs use the most recent bodyweight at or before each workout, and omit points with no eligible measurement. Tap a graph point to see its date, value and bodyweight measurement date when applicable.
- Weighted bodyweight: set the “Include bodyweight in 1RM calculations” checkbox on a weight × reps exercise. Added load is logged, e1RM is calculated from total load minus bodyweight, and absolute/relative graphs use added load. Bodyweight-only exercises show rep records, not e1RM. Single repetitions use actual added weight.
- Exercise library: customize name, measurement type, up to two customizable muscle groups, notes; merge compatible exercises and archive unused ones. Measurement types cannot be changed after sets exist, to prevent misinterpreting history. Weighted and unweighted variants are separate exercises.
- Settings: light/dark/auto, kg/lb and m/ft, e1RM formula and cutoff, increment (only for adjustment buttons), built-in belt/straps/wrist wraps, custom equipment (archive or permanent deletion), editable muscle groups, JSON backup/restore and CSV export. Internal units are kg and metres, avoiding accumulated conversion error when changing display units.
- Offline service worker caches every required resource locally. No external chart library or network-dependent asset.

## Testing

A real browser integration test was attempted during creation, but the container's managed Chromium blocked local navigation. iPhone Safari and installed-PWA behaviour are not yet verified. Suggested smoke test before using the app as your only workout log:

1. Start a custom workout and create Squat. Log 100 kg × 5; confirm volume, sets, reps, e1RM and the countdown. Log another suggested set, expand details, and try decimals in reps (they must be rejected).
2. Tap the timer and enter 00:05; start, switch exercise, then check expiry and the visual highlight. Lock the phone for longer than the countdown and reopen it. Confirm the timer shows zero.
3. Create a bodyweight-only exercise, timed exercise and distance exercise. Confirm only the relevant input fields appear. Edit and delete a completed set in Current workout.
4. Reload with a workout in progress and resume it. Finish; inspect the calendar, records, graphs, favourites, bodyweight and equipment filters.
5. Export JSON, restore it into a separate test instance, then verify all data. Try loading offline after the service worker is installed. Check light/dark appearance and Home Screen installation.

## Code structure and updates

- `index.html`, `styles.css`: layout and styling.
- `js/app.js`: UI, dialogs, workflows and timer.
- `js/model.js`: data schema, validation, measurements, unit conversions and calculations.
- `js/db.js`: IndexedDB snapshot persistence; write queue prevents out-of-order saves in the same instance.
- `js/charts.js`: local SVG charts with date-scaled axes and selectable data points.
- `sw.js`, `manifest.json`, `icons/`: installation and offline support.
- `backup.js`: shared emergency export and settings UI.

For each functional or visual update, increment `CACHE` in `sw.js` (e.g. `ultragym-v3`), update the displayed version in Settings and commit/push. Reopening the installed app may be necessary to load the newly activated worker. Do not clear site data or uninstall an app holding your only copy of workout records. Export JSON regularly; JSON is the full backup, while CSV is a tabular set export.

This initial version is intended for one active browser/app instance at a time. Concurrent tabs do not coordinate data writes. No synchronization or automatic remote backup is implemented.

## Deferred

Predefined training programs (Starting Strength, Juggernaut, Reverse Juggernaut, 5/3/1) and custom weekly programs; HeavySet migration; plate calculator; muscle group training statistics; achievements. Workouts have a reserved program field for future integration. No assisted exercises, warm-up classification, supersets, duplicate workouts, separate workout templates or calorie tracking.


## Emergency backup reminder

Settings → Data and backups offers a device-local reminder every day, every 7 days (default), every 30 days, or Never. The first reminder is due when records exist and no emergency export has been requested. Later reminders require both changed records and the selected interval to have elapsed. Later dismisses the reminder for the current launch/day. The app requests persistent browser storage where supported.

The emergency export creates `ultragym-emergency.json` in the existing JSON backup format. Save it outside the app, preferably in Files or iCloud Drive, and replace the previous emergency file if prompted. The app cannot silently overwrite external files or verify that a download was saved. The displayed timestamp records the export request, not confirmation of a completed save. Normal dated exports are unchanged. Empty emergency exports are disabled; both backup types can be restored through Restore JSON. Reminder preferences and export fingerprints are stored separately on this device, not inside the exported records. Persistent storage is best effort, not a replacement for an external backup.
