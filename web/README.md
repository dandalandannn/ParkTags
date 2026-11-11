# ParkTags web app

Static single-page app (vanilla JS ES modules + Firebase Auth and Realtime Database). No build step.

## Run it
1. Replace every `REDACTED` value in [`js/firebase.js`](js/firebase.js) with your Firebase web app config (Firebase console → Project settings → Your apps).
2. Publish [`database.rules.json`](database.rules.json) (Realtime Database → Rules, or `firebase deploy --only database`). Features are blocked until the rules are published.
3. Serve this folder with any static host:
   ```bash
   python -m http.server 8000
   ```
   then open http://localhost:8000. For a public site use Firebase Hosting or GitHub Pages.

## First admin
Only admins can write roles, so the first admin is added by hand:
1. Authentication → Users → Add user. Copy the UID.
2. In the Realtime Database add `roles/<UID>/role` = `admin`.
3. Create another Authentication user for the ESP32 and give it a role (`roles/<UID>/role` = `guard`). The rules require a role for writes.

After that, admins create guard and admin accounts from the **Accounts** page.

## Roles and pages
| Role | Pages |
|---|---|
| Admin | Dashboard, Activity, Manual entries, Incidents, Users, Cards, Accounts, Archive |
| Guard | Gate, Activity, Manual entries, Incidents |

## Features
- **Gate and Dashboard:** latest vehicle, who is parked, and live parking slots per type. Admins can edit slot limits. Defaults: car 10, motorcycle 300, bike 100, e-bike 300, other (trikes etc.) unlimited.
- **Users and vehicles:** students and staff with up to 3 vehicles each, contact person, and card assignment. Photos are shrunk in the browser to 256×256 JPEG.
- **Incident reports:** while a report is open, the vehicle is flagged every time it enters. A warning with the photo, name and incident text shows on the Gate and Dashboard pages, an "Incident" badge shows in Activity, and guards can add remarks.
- **Activity and manual entries:** searchable, filterable logs with paging.
- **Archive:** archived users, vehicles and accounts, with search and an "archived from / to" filter.
- **Export to Excel** on Activity, Manual entries, Users (and Parked users) and Archive. The export contains every row matching the current search and filters, not just the visible page.

## Database paths used
`roles`, `students` (with `vehicles`), `access_logs`, `settings/manual_cards`, `settings/slot_limits`, `incident_reports`, `student_photos`, `archived_students`, `archived_vehicles`, `archived_roles`, `settings/archived_manual_cards`.

## Code layout
```
index.html        entry page
css/style.css     styles
js/main.js        startup
js/router.js      client-side routing
js/firebase.js    Firebase config and SDK exports
js/auth.js        sign-in and role lookup
js/services.js    database reads/writes
js/constants.js   paths, vehicle types, limits, navigation
js/pages/         one file per page (dashboard, gate, users, ...)
database.rules.json  Realtime Database security rules
```
