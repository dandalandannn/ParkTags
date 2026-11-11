# ParkTags

An RFID-based parking gate system for school campuses. An ESP32 with four MFRC522 readers logs student and vehicle entry and exit to Firebase and opens a servo gate. A web dashboard lets admins and guards manage users, vehicles, incidents and parking slots. Desktop tools write student IDs to cards and keep an offline log when the network is down.

## What's in this repo

| Folder | What it is |
|---|---|
| [`firmware/`](firmware/) | ESP32 sketches: the **gate** (4 readers, servo, Firebase logging, optional SMS) and the **card writer** (1 reader, registers student cards over USB). |
| [`web/`](web/) | Web app (vanilla JS + Firebase): dashboard, gate, users, vehicles, incidents, activity, archive, Excel export. |
| [`tools/`](tools/) | Python/Tkinter desktop tools: student card writer and offline logger. |

To run it you need your own Firebase project, a WiFi network, and (optionally) an SMS account.

## How it fits together

```
 RFID cards ──► ESP32 gate (4× MFRC522 + servo) ──WiFi──► Firebase Realtime Database ◄──► Web app (admin / guard)
                    │
                    └── USB serial ──► rfid_offline_logger.py  (when the network is down)

 ESP32 card writer (1× MFRC522) ── USB serial ──► rfid_student_manager.py  (register student cards)
```

## Quick start

1. **Firebase:** create a project, enable Email/Password sign-in, create a Realtime Database, publish [`web/database.rules.json`](web/database.rules.json).
2. **First admin:** add a user in Authentication, then add `roles/<UID>/role = admin` in the database by hand. Add a second user for the ESP32 and give it a role too (see the [web README](web/README.md)).
3. **Web app:** put your Firebase config into [`web/js/firebase.js`](web/js/firebase.js) (replace the `REDACTED` values) and serve `web/`.
4. **Gate:** wire the hardware, create `secrets.h`, flash the gate sketch. See the [firmware README](firmware/README.md).
5. **Card writer:** flash the card writer sketch on a separate ESP32 + MFRC522, then register cards with the desktop tool. See the [firmware](firmware/README.md) and [tools](tools/README.md) READMEs.

## License
Free for personal, educational and other **noncommercial** use under the [PolyForm Noncommercial License 1.0.0](LICENSE). Schools, universities, non-profits and government institutions may use it. Selling it or using it in a paid product or service needs separate permission from the author.
