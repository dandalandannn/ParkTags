# Desktop tools

Python/Tkinter apps that talk to an ESP32 over USB serial (115200 baud).

```bash
pip install -r requirements.txt
```
Tkinter ships with most Python installs (Debian/Ubuntu: `sudo apt install python3-tk`).

## `rfid_offline_logger.py`
Logs gate scans when the network (or Firebase) is unavailable, and exports them to Excel.

- Connect the **gate ESP32** (running the sketch in [`../firmware/`](../firmware/)) over USB.
- Pick the COM port, connect, enter the plate number or vehicle UID, and start scanning. The app sends `SCAN`; the gate reads student cards on the S1/S2 readers.
- Logs are kept in `offline_logs.json` next to the script. Export them to Excel from the app.

## `rfid_student_manager.py`
Writes a student/staff ID to a card (block 4), the same format the gate reads.

- Connect an ESP32 + MFRC522 running the [card writer sketch](../firmware/card_writer/card_writer.ino) over USB. This is a separate device from the gate.
- Pick the COM port, type the ID, press write, then tap the card on the reader.
