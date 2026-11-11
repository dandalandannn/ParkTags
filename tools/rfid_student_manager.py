import tkinter as tk
from tkinter import ttk, messagebox
import threading
import queue

import serial
import serial.tools.list_ports

BAUD = 115200
ESP_RESET_DELAY_MS = 2000    
PENDING_TIMEOUT_MS = 20000    


class RFIDStudentManager:
    def __init__(self, root):
        self.root = root
        self.root.title("RFID Manager")
        self.root.geometry("620x640")
        self.root.minsize(540, 600)
        self.root.configure(bg="#f1f5f3")

        self.ser = None
        self.reader_thread = None
        self.stop_event = threading.Event()
        self.generation = 0         
        self.connecting = False
        self.events = queue.Queue()   
        self.pending = False
        self.pending_timer = None

        self.student_id = tk.StringVar()
        self.port = tk.StringVar()
        self.uid = tk.StringVar(value="Waiting for card")
        self.stored_id = tk.StringVar(value="Not read yet")
        self.connection = tk.StringVar(value="Disconnected")
        self.status = tk.StringVar(value="Connect to your ESP32 to begin.")

        self.build_ui()
        self.refresh_ports()

        self.root.after(100, self.process_events)
        self.root.protocol("WM_DELETE_WINDOW", self.close)

    # ------------------------------------------------------------------ UI
    def build_ui(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TCombobox", padding=6, fieldbackground="white")

        header = tk.Frame(self.root, bg="#176b52", height=100)
        header.pack(fill="x")
        header.pack_propagate(False)

        tk.Label(
            header, text="RFID Manager",
            font=("Segoe UI", 21, "bold"), fg="white", bg="#176b52"
        ).pack(anchor="w", padx=24, pady=(18, 2))

        tk.Label(
            header, text="ESP32  •  MFRC522  •  User ID Block 4",
            font=("Segoe UI", 10), fg="#d9eee5", bg="#176b52"
        ).pack(anchor="w", padx=25)

        body = tk.Frame(self.root, bg="#f1f5f3")
        body.pack(fill="both", expand=True, padx=22, pady=16)

        # Connection card
        card = self.card(body, "USB SERIAL CONNECTION")
        connect_row = tk.Frame(card, bg="white")
        connect_row.pack(fill="x", padx=12, pady=10)

        self.port_box = ttk.Combobox(
            connect_row, textvariable=self.port, state="readonly", width=15
        )
        self.port_box.pack(side="left", padx=(0, 8))

        self.refresh_btn = tk.Button(
            connect_row, text="Refresh", command=self.refresh_ports,
            bg="#e8efeb", relief="flat", padx=10
        )
        self.refresh_btn.pack(side="left", padx=(0, 8))

        self.connect_btn = tk.Button(
            connect_row, text="Connect", command=self.toggle_connection,
            bg="#176b52", fg="white", relief="flat", padx=15, pady=5
        )
        self.connect_btn.pack(side="left")

        tk.Label(
            body, textvariable=self.connection, bg="#f1f5f3",
            fg="#52665b", font=("Segoe UI", 9)
        ).pack(anchor="w", pady=(0, 12))

        card = self.card(body, "USER ID TO WRITE")
        self.id_entry = tk.Entry(
            card, textvariable=self.student_id,
            font=("Segoe UI", 14), relief="solid", bd=1
        )
        self.id_entry.pack(fill="x", padx=14, pady=(12, 5), ipady=7)
        self.id_entry.bind("<Return>", lambda e: self.write_card())

        tk.Label(
            card, text="1–16 ASCII characters. No spaces or | character.",
            bg="white", fg="#75857c", font=("Segoe UI", 9)
        ).pack(anchor="w", padx=14, pady=(0, 10))

        buttons = tk.Frame(body, bg="#f1f5f3")
        buttons.pack(fill="x", pady=(0, 14))

        self.write_btn = tk.Button(
            buttons, text="Write", command=self.write_card,
            bg="#176b52", fg="white", activebackground="#12543f",
            relief="flat", font=("Segoe UI", 11, "bold"), pady=11
        )
        self.write_btn.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.read_btn = tk.Button(
            buttons, text="Read", command=self.read_card,
            bg="white", fg="#176b52", activebackground="#e8efeb",
            relief="solid", bd=1, font=("Segoe UI", 11, "bold"), pady=11
        )
        self.read_btn.pack(side="left", fill="x", expand=True, padx=(6, 6))

        self.cancel_btn = tk.Button(
            buttons, text="Cancel", command=self.cancel_pending,
            bg="#fdeaea", fg="#9b2c2c", activebackground="#f8d4d4",
            relief="flat", font=("Segoe UI", 11, "bold"), pady=11,
            state="disabled"
        )
        self.cancel_btn.pack(side="left", fill="x", expand=True, padx=(6, 0))

        # Card data card
        card = self.card(body, "CARD INFORMATION")
        self.info_row(card, "ACTUAL CARD UID", self.uid)
        ttk.Separator(card).pack(fill="x", padx=14)
        self.info_row(card, "STORED USER ID · BLOCK 4", self.stored_id)

        # Status card
        card = self.card(body, "STATUS")
        tk.Label(
            card, textvariable=self.status, bg="white", fg="#294f3d",
            font=("Segoe UI", 10), anchor="w", justify="left",
            wraplength=520, padx=14, pady=12
        ).pack(fill="x")

        tk.Label(
            body,
            text="Keep the RFID card on the reader until the operation finishes.",
            bg="#f1f5f3", fg="#75857c", font=("Segoe UI", 9), wraplength=520
        ).pack(anchor="w", pady=(0, 4))

    def card(self, parent, title):
        """Section title + a bordered white frame; returns the frame."""
        tk.Label(
            parent, text=title, bg="#f1f5f3", fg="#52665b",
            font=("Segoe UI", 9, "bold")
        ).pack(anchor="w", pady=(0, 5))

        frame = tk.Frame(
            parent, bg="white",
            highlightbackground="#d5dfd9", highlightthickness=1
        )
        frame.pack(fill="x", pady=(0, 12))
        return frame

    def info_row(self, parent, title, variable):
        frame = tk.Frame(parent, bg="white")
        frame.pack(fill="x", padx=14, pady=10)

        tk.Label(
            frame, text=title, bg="white", fg="#75857c",
            font=("Segoe UI", 9, "bold")
        ).pack(anchor="w")

        tk.Label(
            frame, textvariable=variable, bg="white", fg="#172b25",
            font=("Consolas", 12, "bold"), anchor="w", wraplength=500
        ).pack(fill="x", anchor="w", pady=(4, 0))

    # --------------------------------------------------------------- ports
    def refresh_ports(self):
        ports = [p.device for p in serial.tools.list_ports.comports()]
        self.port_box["values"] = ports

        if ports and self.port.get() not in ports:
            self.port.set(ports[0])
        elif not ports:
            self.port.set("")
            self.status.set("No COM ports found. Connect your ESP32 by USB.")

    # ---------------------------------------------------------- connection
    def toggle_connection(self):
        if self.connecting:
            return

        if self.ser and self.ser.is_open:
            self.disconnect("USB connection closed.")
            return

        selected = self.port.get()
        if not selected:
            messagebox.showwarning(
                "No port selected",
                "Connect the ESP32 and select its COM port."
            )
            return

        try:
            ser = serial.Serial(
                selected, BAUD, timeout=0.2, write_timeout=1
            )
        except (serial.SerialException, OSError) as exc:
            messagebox.showerror("Connection error", str(exc))
            self.connection.set("Disconnected")
            return

        self.connecting = True
        self.generation += 1
        gen = self.generation
        self.connect_btn.config(state="disabled")
        self.refresh_btn.config(state="disabled")
        self.connection.set(f"Connecting to {selected}...")
        self.status.set("Waiting for ESP32 to restart...")
        self.root.after(
            ESP_RESET_DELAY_MS, lambda: self.finish_connect(ser, selected, gen)
        )

    def finish_connect(self, ser, selected, gen):
        self.connecting = False
        self.refresh_btn.config(state="normal")
        self.connect_btn.config(state="normal")

        if gen != self.generation:
            try:
                ser.close()
            except (serial.SerialException, OSError):
                pass
            return

        try:
            ser.reset_input_buffer()
        except (serial.SerialException, OSError) as exc:
            try:
                ser.close()
            except (serial.SerialException, OSError):
                pass
            messagebox.showerror("Connection error", str(exc))
            self.connection.set("Disconnected")
            return

        self.ser = ser
        self.stop_event = threading.Event()
        self.reader_thread = threading.Thread(
            target=self.serial_reader,
            args=(ser, self.stop_event, gen),
            daemon=True
        )
        self.reader_thread.start()

        self.connect_btn.config(text="Disconnect")
        self.connection.set(f"Connected to {selected}")
        self.status.set("USB connected. Ready to scan.")
        self.send_command("PING")

    def disconnect(self, message="USB connection closed."):
        self.generation += 1         
        self.connecting = False
        self.stop_event.set()

        ser, self.ser = self.ser, None
        try:
            if ser:
                ser.close()
        except (serial.SerialException, OSError):
            pass

        if self.reader_thread and self.reader_thread is not threading.current_thread():
            self.reader_thread.join(timeout=0.5)
        self.reader_thread = None

        try:
            while True:
                self.events.get_nowait()
        except queue.Empty:
            pass

        self.end_pending()
        self.connect_btn.config(text="Connect", state="normal")
        self.refresh_btn.config(state="normal")
        self.connection.set("Disconnected")
        self.status.set(message)

    def send_command(self, command):
        if not self.ser or not self.ser.is_open:
            messagebox.showwarning("Not connected", "Connect to the ESP32 first.")
            return False

        try:
            self.ser.write((command + "\n").encode("ascii"))
            return True
        except (serial.SerialException, OSError) as exc:
            self.disconnect(f"Serial communication error: {exc}")
            return False

    # ------------------------------------------------------ pending state
    def begin_pending(self, status_text):
        self.pending = True
        self.set_busy(True)
        self.status.set(status_text)
        self.pending_timer = self.root.after(
            PENDING_TIMEOUT_MS, self.on_pending_timeout
        )

    def end_pending(self):
        self.pending = False
        if self.pending_timer is not None:
            self.root.after_cancel(self.pending_timer)
            self.pending_timer = None
        self.set_busy(False)

    def on_pending_timeout(self):
        self.pending_timer = None
        if self.pending:
            self.end_pending()
            self.status.set(
                "ERROR: Timed out waiting for the card or ESP32. Try again."
            )

    def cancel_pending(self):
        if self.pending:
            self.end_pending()
            self.status.set("Operation cancelled.")

    def set_busy(self, busy):
        state = "disabled" if busy else "normal"
        self.write_btn.config(state=state)
        self.read_btn.config(state=state)
        self.cancel_btn.config(state="normal" if busy else "disabled")

    # ---------------------------------------------------------- commands
    def write_card(self):
        if self.pending:
            return

        sid = self.student_id.get().strip()

        if not sid or any(c.isspace() for c in sid):
            messagebox.showwarning(
                "Invalid User ID", "Enter 1–16 characters without spaces."
            )
            return

        if not (sid.isascii() and sid.isprintable()):
            messagebox.showwarning(
                "Invalid User ID",
                "Use plain ASCII characters only (a block holds 16 bytes)."
            )
            return

        if len(sid) > 16:
            messagebox.showwarning(
                "Invalid User ID", "Maximum length is 16 characters."
            )
            return

        if "|" in sid:
            messagebox.showwarning(
                "Invalid User ID", "The | character is not allowed."
            )
            return

        if sid.lower() == "reset":
            if messagebox.askyesno(
                "Reset User ID?",
                "Erase the user ID stored in Block 4? "
                "The card's actual UID will not change."
            ):
                if self.send_command("RESET"):
                    self.begin_pending(
                        "Reset requested. Present the card to erase its user ID."
                    )
            return

        if self.send_command("WRITE:" + sid):
            self.begin_pending(f"Ready to write {sid}. Present the card to the reader.")

    def read_card(self):
        if self.pending:
            return

        if self.send_command("READ"):
            self.begin_pending("Ready to read. Present the card to the reader.")

    # ------------------------------------------------------------- serial
    def serial_reader(self, ser, stop_event, gen):
        """Runs in a background thread. Uses its own port reference so that
        disconnect() setting self.ser = None can't break it."""
        while not stop_event.is_set():
            try:
                raw = ser.readline()
            except (serial.SerialException, OSError, TypeError, ValueError):
                if not stop_event.is_set():
                    self.events.put((gen, "SYS|DISCONNECTED"))
                break

            line = raw.decode("utf-8", errors="replace").strip()
            if line:
                self.events.put((gen, line))

    def process_events(self):
        try:
            while True:
                gen, line = self.events.get_nowait()
                if gen == self.generation:
                    self.handle_line(line)
        except queue.Empty:
            pass

        self.root.after(100, self.process_events)

    def handle_line(self, line):
        if line == "SYS|DISCONNECTED":
            self.disconnect("USB connection lost. Check the cable and reconnect.")
            return

        if line.startswith("READY|"):
            if not self.pending:
                self.status.set("ESP32 ready.")
            return

        if line.startswith("DEBUG|"):
            return

        if line.startswith("STATUS|"):
            message = line[7:]

            if message == "WAITING_WRITE":
                self.status.set("Writing requested. Present the card to the reader.")
            elif message == "WAITING_READ":
                self.status.set("Reading requested. Present the card to the reader.")
            elif message == "WAITING_RESET":
                self.status.set(
                    "Reset requested. Present the card to the reader."
                )
            elif message.startswith("ERROR:"):
                self.end_pending()
                self.status.set(message)
            else:
                self.status.set(message)
            return

        if line.startswith("RESULT|"):
            fields = line.split("|", 5)

            if len(fields) != 6:
                self.end_pending()
                self.status.set("Received an invalid response from ESP32.")
                return

            _, operation, uid, student_id, result, message = fields

            if uid:
                self.uid.set(uid)

            if student_id:
                self.stored_id.set(student_id)
            elif operation in ("READ", "RESET"):
                self.stored_id.set("No user ID stored")

            self.status.set(
                ("SUCCESS: " if result == "OK" else "ERROR: ") + message
            )
            self.end_pending()

    # -------------------------------------------------------------- close
    def close(self):
        self.stop_event.set()
        try:
            if self.ser and self.ser.is_open:
                self.ser.close()
        except (serial.SerialException, OSError):
            pass

        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    app = RFIDStudentManager(root)
    root.mainloop()
