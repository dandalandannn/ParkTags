# ParkTags firmware

Two ESP32 Arduino sketches:

| Sketch | Purpose |
|---|---|
| [`parktags_eto_na/`](parktags_eto_na/parktags_eto_na.ino) | The **gate**: reads student and vehicle cards, checks Firebase, logs access, opens the servo. |
| [`card_writer/`](card_writer/card_writer.ino) | The **card writer**: registers student/staff IDs on cards over USB, used with `rfid_student_manager.py`. |

Install the ESP32 board package in the Arduino IDE first.

---

## Gate (`parktags_eto_na`)

### What it does
- Reads four MFRC522 readers: student entrance (S1), vehicle entrance (V1), vehicle exit (V2), student exit (S2).
- Pairs a student card with a vehicle card, checks eligibility in Firebase, and logs the access.
- Opens the gate servo for 3 seconds on an allowed entry/exit.
- Sends an SMS to the contact number on the student's profile (optional, via iProg SMS). No number on file means no SMS.
- Accepts an admin override card (`ADMIN_CARD_ID` in the sketch).
- Talks to `rfid_offline_logger.py` over USB serial (115200 baud) with the commands `PING`, `SCAN` and `STOP`.

### Hardware
4× MFRC522 readers, 1 servo, ESP32 dev board, RFID cards/tags (student ID is stored in block 4).

| Signal | ESP32 pin |
|---|---|
| RST (shared by all readers) | 22 |
| S1 student entrance, SS | 4 |
| V1 vehicle entrance, SS | 5 |
| V2 vehicle exit, SS | 17 |
| S2 student exit, SS | 16 |
| Servo signal | 21 |

SCK, MOSI and MISO of all readers go to the ESP32's default SPI pins. Power the readers from 3.3V.

### Build and flash
1. Install the libraries (Library Manager): **MFRC522**, **Firebase ESP Client**, **ESP32Servo**.
2. In `parktags_eto_na/`, copy `secrets.h.example` to `secrets.h` and fill it in:

   | Value | Where it comes from |
   |---|---|
   | `WIFI_SSID`, `WIFI_PASSWORD` | Your WiFi |
   | `API_KEY`, `DATABASE_URL` | Your Firebase web app config |
   | `USER_EMAIL`, `USER_PASSWORD` | A Firebase Authentication user for the device (give it a role in `roles/`) |
   | `SMS_API_URL`, `SMS_API_TOKEN` | Your [iProg SMS](https://sms.iprogtech.com) account (any text if you don't use SMS) |

3. Optional: change `ADMIN_CARD_ID` near the top of the sketch.
4. Select your ESP32 board and port, upload, then open the Serial Monitor at 115200 baud.

If `secrets.h` is missing, the build stops with a message telling you to create it.

---

## Card writer (`card_writer`)

A single MFRC522 reader on an ESP32. No WiFi or credentials needed.

### Hardware
| Signal | ESP32 pin |
|---|---|
| SS | 5 |
| RST | 22 |
| SCK | 18 |
| MISO | 19 |
| MOSI | 23 |

Power the reader from 3.3V.

### Build and flash
1. Install the **MFRC522** library.
2. Open `card_writer/card_writer.ino`, select your board and port, and upload.
3. Close the Serial Monitor and run `tools/rfid_student_manager.py`.

### Serial commands (115200 baud)
| Command | Action |
|---|---|
| `PING` | Replies `READY|PONG` |
| `WRITE:<id>` | Waits for a card, writes the ID (1 to 16 characters, no `|`) to block 4, and verifies it |
| `READ` | Waits for a card and reads the stored ID |
| `RESET` | Waits for a card and clears the stored ID |
| `SCAN` | Continuously reports cards that are tapped |
| `STOP` | Back to idle |

Replies are lines starting with `STATUS|` or `RESULT|`.
