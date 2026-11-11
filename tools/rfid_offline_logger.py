import json
import os
import queue
import re
import secrets
import threading
import tkinter as tk
import zipfile
from datetime import datetime
from tkinter import filedialog, messagebox, ttk
from xml.sax.saxutils import escape

import serial
import serial.tools.list_ports

BAUD = 115200
ESP_RESET_DELAY_MS = 2000
SCAN_START_TIMEOUT_MS = 4000

REASON = "Network Unavailable"
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "offline_logs.json")

EXPORT_HEADERS = ["Log ID", "Timestamp", "Direction", "Card UID", "User ID", "Plate / Vehicle UID", "Remarks"]
EXPORT_WIDTHS = [24, 20, 12, 18, 18, 24, 22]
DIRECTION_LABELS = {"ENTRANCE": "Entry", "EXIT": "Exit"}

VEHICLE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]{1,39}$")

GREEN = "#176b52"
GREEN_DARK = "#12543f"
BG = "#f1f5f3"


# ---------------------------------------------------------------- data helpers
def normalize_vehicle(text):
    """'abc  123' -> 'ABC 123'"""
    return " ".join(str(text).split()).upper()


def vehicle_error(text):
    """Returns an error message, or '' when the plate / vehicle UID is acceptable."""
    if not text:
        return "Enter the plate number or vehicle UID."
    if not VEHICLE_PATTERN.match(text):
        return ("Use 2–40 characters: letters, numbers, spaces, hyphens or underscores "
                "(it must start with a letter or number).")
    return ""


def new_record(direction, card_uid, user_id, vehicle, when):
    return {
        "id": f"{when:%Y%m%d-%H%M%S}-{secrets.token_hex(2).upper()}",
        "timestamp": when.strftime("%Y-%m-%d %H:%M:%S"),
        "direction": direction,
        "card_uid": card_uid,
        "user_id": user_id,
        "vehicle": vehicle,
        "exported": False,
    }


def export_rows(records):
    """Oldest first, in the column order of EXPORT_HEADERS."""
    ordered = sorted(records, key=lambda r: r["timestamp"])
    return [
        [r["id"], r["timestamp"], DIRECTION_LABELS.get(r["direction"], r["direction"]),
         r["card_uid"], r["user_id"], r["vehicle"], REASON]
        for r in ordered
    ]


def parse_scan_line(line):
    """'RESULT|SCAN|04A1B2C3|2023-001|OK|msg' -> ('04A1B2C3', '2023-001', True, 'msg'); None if not a scan result."""
    fields = line.split("|", 5)
    if len(fields) != 6 or fields[0] != "RESULT" or fields[1] != "SCAN":
        return None
    _, _, uid, user_id, result, message = fields
    return uid, user_id, result == "OK", message


class LogStore:
    """The offline logs, kept in a JSON file next to the script and rewritten after every change."""

    def __init__(self, path):
        self.path = path
        self.records = []
        self.load_note = ""
        self.load()

    def load(self):
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            if not isinstance(data, list):
                raise ValueError("not a list")
            self.records = [r for r in data if isinstance(r, dict) and r.get("id") and r.get("timestamp")]
        except FileNotFoundError:
            self.records = []
        except (OSError, ValueError):
            # Never silently discard a log file we can't read: keep a copy and start a new one.
            backup = f"{self.path}.unreadable-{datetime.now():%Y%m%d-%H%M%S}"
            try:
                os.replace(self.path, backup)
                self.load_note = f"The saved log file could not be read. A copy was kept as {os.path.basename(backup)}."
            except OSError:
                self.load_note = "The saved log file could not be read."
            self.records = []

    def save(self):
        temp = self.path + ".tmp"
        with open(temp, "w", encoding="utf-8") as handle:
            json.dump(self.records, handle, ensure_ascii=False, indent=1)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, self.path)

    def add(self, record):
        self.records.append(record)
        self.save()

    def delete(self, ids):
        ids = set(ids)
        self.records = [r for r in self.records if r["id"] not in ids]
        self.save()

    def mark_exported(self, ids):
        ids = set(ids)
        for record in self.records:
            if record["id"] in ids:
                record["exported"] = True
        self.save()

    def clear(self):
        self.records = []
        self.save()

    @property
    def pending_count(self):
        return sum(1 for r in self.records if not r.get("exported"))


# ---------------------------------------------------------------- Excel writer
_XML_ILLEGAL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")
_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _column_letter(index):
    """0 -> A, 25 -> Z, 26 -> AA"""
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _cell(ref, value, style):
    text = escape(_XML_ILLEGAL.sub("", str(value)))
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'


def write_xlsx(path, headers, rows, widths, sheet_name="Offline Logs"):
    """Writes a one-sheet .xlsx using only the standard library. Every cell is text, so card UIDs
    like 04E1 or plates like 1234 are never turned into numbers or dates."""
    sheet_rows = ['<row r="1">' + "".join(_cell(f"{_column_letter(c)}1", h, 1) for c, h in enumerate(headers)) + "</row>"]
    for r, row in enumerate(rows, start=2):
        sheet_rows.append(f'<row r="{r}">' + "".join(_cell(f"{_column_letter(c)}{r}", v, 2) for c, v in enumerate(row)) + "</row>")

    cols = "".join(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>' for i, w in enumerate(widths, start=1))
    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<worksheet xmlns="{_NS}">'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        '<selection pane="bottomLeft"/></sheetView></sheetViews>'
        f"<cols>{cols}</cols><sheetData>{''.join(sheet_rows)}</sheetData></worksheet>"
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<styleSheet xmlns="{_NS}">'
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FF176B52"/><bgColor indexed="64"/></patternFill></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="3">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
        '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
        '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<workbook xmlns="{_NS}" xmlns:r="{_REL_NS}"><sheets>'
        f'<sheet name="{escape(sheet_name)}" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{_REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>'
        f'<Relationship Id="rId2" Type="{_REL_NS}/styles" Target="styles.xml"/></Relationships>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{_REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/styles.xml", styles)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)


# ---------------------------------------------------------------- UI helpers
def direction_toggle(parent, variable, bg):
    """Entry / Exit segmented buttons bound to a StringVar ('ENTRANCE' or 'EXIT')."""
    frame = tk.Frame(parent, bg=bg)
    buttons = {}

    def refresh(*_):
        if not frame.winfo_exists():
            return
        for key, button in buttons.items():
            selected = variable.get() == key
            button.config(
                bg=GREEN if selected else "white",
                fg="white" if selected else GREEN,
                activebackground=GREEN_DARK if selected else "#e8efeb",
                activeforeground="white" if selected else GREEN,
            )

    for key in ("ENTRANCE", "EXIT"):
        button = tk.Button(
            frame, text=DIRECTION_LABELS[key], command=lambda k=key: variable.set(k),
            relief="solid", bd=1, font=("Segoe UI", 11, "bold"), pady=9, width=12
        )
        button.pack(side="left", fill="x", expand=True, padx=(0, 6) if key == "ENTRANCE" else (0, 0))
        buttons[key] = button

    trace_id = variable.trace_add("write", refresh)

    def on_destroy(event):
        if event.widget is frame:
            try:
                variable.trace_remove("write", trace_id)
            except tk.TclError:
                pass

    frame.bind("<Destroy>", on_destroy)
    refresh()
    return frame


class VehicleDialog(tk.Toplevel):
    """Opens when a card is detected and asks for the plate number or vehicle UID only."""

    def __init__(self, app, card_uid, user_id, when):
        super().__init__(app.root)
        self.app = app
        self.card_uid = card_uid
        self.user_id = user_id
        self.when = when
        self.vehicle = tk.StringVar()
        self.error = tk.StringVar()

        self.title("Card detected")
        self.configure(bg=BG)
        self.resizable(False, False)
        self.transient(app.root)
        self.protocol("WM_DELETE_WINDOW", self.cancel)

        header = tk.Frame(self, bg=GREEN)
        header.pack(fill="x")
        tk.Label(header, text="Card detected", font=("Segoe UI", 15, "bold"),
                 fg="white", bg=GREEN).pack(anchor="w", padx=20, pady=(14, 2))
        tk.Label(header, text=f"{when:%b %d, %Y  %I:%M:%S %p}", font=("Segoe UI", 9),
                 fg="#d9eee5", bg=GREEN).pack(anchor="w", padx=21, pady=(0, 12))

        body = tk.Frame(self, bg=BG)
        body.pack(fill="both", expand=True, padx=20, pady=14)

        info = tk.Frame(body, bg="white", highlightbackground="#d5dfd9", highlightthickness=1)
        info.pack(fill="x", pady=(0, 12))
        self.info_row(info, "CARD UID", card_uid or "Unknown")
        ttk.Separator(info).pack(fill="x", padx=12)
        self.info_row(info, "USER ID ON CARD", user_id or "None stored")

        tk.Label(body, text="RECORDING AS", bg=BG, fg="#52665b",
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(0, 5))
        direction_toggle(body, app.direction, BG).pack(fill="x", pady=(0, 12))

        tk.Label(body, text="PLATE NUMBER OR VEHICLE UID", bg=BG, fg="#52665b",
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(0, 5))
        self.entry = tk.Entry(body, textvariable=self.vehicle, font=("Segoe UI", 14), relief="solid", bd=1, width=28)
        self.entry.pack(fill="x", ipady=7)
        tk.Label(body, text="Bike or e-bike without a plate? Type its vehicle UID.",
                 bg=BG, fg="#75857c", font=("Segoe UI", 9)).pack(anchor="w", pady=(5, 0))
        tk.Label(body, textvariable=self.error, bg=BG, fg="#9b2c2c", font=("Segoe UI", 9),
                 wraplength=360, justify="left").pack(anchor="w", pady=(4, 0))

        buttons = tk.Frame(body, bg=BG)
        buttons.pack(fill="x", pady=(10, 0))
        tk.Button(buttons, text="Save log", command=self.save, bg=GREEN, fg="white",
                  activebackground=GREEN_DARK, activeforeground="white", relief="flat",
                  font=("Segoe UI", 11, "bold"), pady=10).pack(side="left", fill="x", expand=True, padx=(0, 6))
        tk.Button(buttons, text="Cancel", command=self.cancel, bg="#fdeaea", fg="#9b2c2c",
                  activebackground="#f8d4d4", relief="flat",
                  font=("Segoe UI", 11, "bold"), pady=10).pack(side="left", fill="x", expand=True, padx=(6, 0))

        self.bind("<Return>", lambda e: self.save())
        self.bind("<Escape>", lambda e: self.cancel())

        self.update_idletasks()
        x = app.root.winfo_rootx() + (app.root.winfo_width() - self.winfo_reqwidth()) // 2
        y = app.root.winfo_rooty() + max(40, (app.root.winfo_height() - self.winfo_reqheight()) // 3)
        self.geometry(f"+{max(0, x)}+{max(0, y)}")

        try:
            self.wait_visibility()
            self.grab_set()
        except tk.TclError:
            pass
        self.lift()
        self.focus_force()
        self.entry.focus_set()

    @staticmethod
    def info_row(parent, title, value):
        frame = tk.Frame(parent, bg="white")
        frame.pack(fill="x", padx=12, pady=8)
        tk.Label(frame, text=title, bg="white", fg="#75857c", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        tk.Label(frame, text=value, bg="white", fg="#172b25", font=("Consolas", 12, "bold"),
                 anchor="w").pack(fill="x", pady=(3, 0))

    def save(self):
        vehicle = normalize_vehicle(self.vehicle.get())
        message = vehicle_error(vehicle)
        if message:
            self.error.set(message)
            self.entry.focus_set()
            return
        self.close()
        self.app.add_log(self.app.direction.get(), self.card_uid, self.user_id, vehicle, self.when)

    def cancel(self):
        self.close()
        self.app.status.set("Cancelled. No log was saved for that card.")

    def close(self):
        self.app.dialog = None
        try:
            self.grab_release()
        except tk.TclError:
            pass
        self.destroy()


# ---------------------------------------------------------------- main app
class OfflineGateLogger:
    def __init__(self, root):
        self.root = root
        self.root.title("ParkTags Offline Logger")
        self.root.geometry("720x820")
        self.root.minsize(640, 700)
        self.root.configure(bg=BG)

        self.store = LogStore(LOG_FILE)
        self.ser = None
        self.reader_thread = None
        self.stop_event = threading.Event()
        self.generation = 0
        self.connecting = False
        self.events = queue.Queue()
        self.awaiting_scan = False
        self.scan_timer = None
        self.dialog = None

        self.port = tk.StringVar()
        self.direction = tk.StringVar(value="ENTRANCE")
        self.connection = tk.StringVar(value="Disconnected")
        self.last_card = tk.StringVar(value="No card detected yet")
        self.status = tk.StringVar(value="Connect to your ESP32 to begin.")
        self.count_text = tk.StringVar()

        self.build_ui()
        self.refresh_ports()
        self.reload_tree()

        if self.store.load_note:
            self.status.set(self.store.load_note)
        elif self.store.records:
            self.status.set(f"{len(self.store.records)} saved log(s) loaded. Connect to your ESP32 to continue.")

        self.root.after(100, self.process_events)
        self.root.protocol("WM_DELETE_WINDOW", self.close)

    # ------------------------------------------------------------------ UI
    def build_ui(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TCombobox", padding=6, fieldbackground="white")
        style.configure("Treeview", rowheight=26, font=("Segoe UI", 10), fieldbackground="white")
        style.configure("Treeview.Heading", font=("Segoe UI", 9, "bold"))

        header = tk.Frame(self.root, bg=GREEN, height=100)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="Offline Gate Logger", font=("Segoe UI", 21, "bold"),
                 fg="white", bg=GREEN).pack(anchor="w", padx=24, pady=(18, 2))
        tk.Label(header, text="ESP32  •  MFRC522  •  For use when the network is unavailable",
                 font=("Segoe UI", 10), fg="#d9eee5", bg=GREEN).pack(anchor="w", padx=25)

        body = tk.Frame(self.root, bg=BG)
        body.pack(fill="both", expand=True, padx=22, pady=14)

        # Connection
        card = self.card(body, "USB SERIAL CONNECTION")
        row = tk.Frame(card, bg="white")
        row.pack(fill="x", padx=12, pady=10)
        self.port_box = ttk.Combobox(row, textvariable=self.port, state="readonly", width=15)
        self.port_box.pack(side="left", padx=(0, 8))
        self.refresh_btn = tk.Button(row, text="Refresh", command=self.refresh_ports,
                                     bg="#e8efeb", relief="flat", padx=10)
        self.refresh_btn.pack(side="left", padx=(0, 8))
        self.connect_btn = tk.Button(row, text="Connect", command=self.toggle_connection,
                                     bg=GREEN, fg="white", relief="flat", padx=15, pady=5)
        self.connect_btn.pack(side="left")
        tk.Label(body, textvariable=self.connection, bg=BG, fg="#52665b",
                 font=("Segoe UI", 9)).pack(anchor="w", pady=(0, 10))

        # Direction
        tk.Label(body, text="RECORDING AS", bg=BG, fg="#52665b",
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(0, 5))
        direction_toggle(body, self.direction, BG).pack(fill="x", pady=(0, 12))

        # Status
        card = self.card(body, "STATUS")
        tk.Label(card, textvariable=self.status, bg="white", fg="#294f3d", font=("Segoe UI", 10),
                 anchor="w", justify="left", wraplength=620, padx=14, pady=10).pack(fill="x")
        tk.Label(card, textvariable=self.last_card, bg="white", fg="#75857c", font=("Consolas", 9),
                 anchor="w", justify="left", wraplength=620, padx=14).pack(fill="x", pady=(0, 10))

        # Logs
        top = tk.Frame(body, bg=BG)
        top.pack(fill="x")
        tk.Label(top, text="OFFLINE LOGS", bg=BG, fg="#52665b",
                 font=("Segoe UI", 9, "bold")).pack(side="left", pady=(0, 5))
        tk.Label(top, textvariable=self.count_text, bg=BG, fg="#75857c",
                 font=("Segoe UI", 9)).pack(side="right", pady=(0, 5))

        table_frame = tk.Frame(body, bg="white", highlightbackground="#d5dfd9", highlightthickness=1)
        table_frame.pack(fill="both", expand=True, pady=(0, 10))
        columns = ("time", "direction", "card", "user", "vehicle", "exported")
        self.tree = ttk.Treeview(table_frame, columns=columns, show="headings", selectmode="extended")
        for key, title, width, anchor in (
            ("time", "Time", 150, "w"), ("direction", "Direction", 70, "w"), ("card", "Card UID", 100, "w"),
            ("user", "User ID", 100, "w"), ("vehicle", "Plate / Vehicle UID", 150, "w"), ("exported", "Exported", 65, "center"),
        ):
            self.tree.heading(key, text=title)
            self.tree.column(key, width=width, anchor=anchor, stretch=key == "vehicle")
        scrollbar = ttk.Scrollbar(table_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self.tree.tag_configure("exported", foreground="#75857c")

        buttons = tk.Frame(body, bg=BG)
        buttons.pack(fill="x")
        self.export_btn = tk.Button(buttons, text="Export to Excel", command=self.export_excel,
                                    bg=GREEN, fg="white", activebackground=GREEN_DARK, activeforeground="white",
                                    relief="flat", font=("Segoe UI", 11, "bold"), pady=11)
        self.export_btn.pack(side="left", fill="x", expand=True, padx=(0, 6))
        tk.Button(buttons, text="Delete selected", command=self.delete_selected, bg="white", fg=GREEN,
                  activebackground="#e8efeb", relief="solid", bd=1,
                  font=("Segoe UI", 11, "bold"), pady=11).pack(side="left", fill="x", expand=True, padx=(6, 6))
        tk.Button(buttons, text="Clear all", command=self.clear_all, bg="#fdeaea", fg="#9b2c2c",
                  activebackground="#f8d4d4", relief="flat",
                  font=("Segoe UI", 11, "bold"), pady=11).pack(side="left", fill="x", expand=True, padx=(6, 0))

    def card(self, parent, title):
        tk.Label(parent, text=title, bg=BG, fg="#52665b", font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(0, 5))
        frame = tk.Frame(parent, bg="white", highlightbackground="#d5dfd9", highlightthickness=1)
        frame.pack(fill="x", pady=(0, 10))
        return frame

    # ---------------------------------------------------------------- logs
    def tree_values(self, record):
        return (
            record["timestamp"], DIRECTION_LABELS.get(record["direction"], record["direction"]),
            record["card_uid"] or "—", record["user_id"] or "—", record["vehicle"],
            "Yes" if record.get("exported") else "No",
        )

    def reload_tree(self):
        self.tree.delete(*self.tree.get_children())
        for record in sorted(self.store.records, key=lambda r: r["timestamp"], reverse=True):
            self.tree.insert("", "end", iid=record["id"], values=self.tree_values(record),
                             tags=("exported",) if record.get("exported") else ())
        self.update_count()

    def update_count(self):
        total = len(self.store.records)
        pending = self.store.pending_count
        self.count_text.set(f"{total} log(s) saved on this computer  ·  {pending} not exported yet")

    def add_log(self, direction, card_uid, user_id, vehicle, when):
        record = new_record(direction, card_uid, user_id, vehicle, when)
        try:
            self.store.add(record)
        except OSError as exc:
            messagebox.showerror(
                "Could not save log",
                f"The log was recorded but could not be written to disk:\n{exc}\n\n"
                "Export to Excel as soon as possible so it isn't lost."
            )
        self.tree.insert("", 0, iid=record["id"], values=self.tree_values(record))
        self.update_count()
        self.status.set(f"SUCCESS: {DIRECTION_LABELS[direction]} logged for {vehicle}. Ready for the next card.")

    def delete_selected(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showinfo("Nothing selected", "Select one or more logs in the list first.")
            return
        if not messagebox.askyesno("Delete logs?", f"Delete {len(selected)} selected log(s)? This can't be undone."):
            return
        try:
            self.store.delete(selected)
        except OSError as exc:
            messagebox.showerror("Could not save changes", str(exc))
        self.reload_tree()
        self.status.set(f"{len(selected)} log(s) deleted.")

    def clear_all(self):
        if not self.store.records:
            messagebox.showinfo("No logs", "There are no logs to clear.")
            return
        pending = self.store.pending_count
        warning = (f"{pending} log(s) have NOT been exported yet and will be lost.\n\n" if pending else "")
        if not messagebox.askyesno("Clear all logs?", f"{warning}Delete all {len(self.store.records)} log(s) from this computer?",
                                   icon="warning"):
            return
        try:
            self.store.clear()
        except OSError as exc:
            messagebox.showerror("Could not save changes", str(exc))
        self.reload_tree()
        self.status.set("All logs cleared.")

    def export_excel(self):
        if not self.store.records:
            messagebox.showinfo("Nothing to export", "There are no offline logs yet.")
            return

        path = filedialog.asksaveasfilename(
            title="Export offline logs",
            defaultextension=".xlsx",
            filetypes=[("Excel workbook", "*.xlsx")],
            initialfile=f"ParkTags-Offline-Logs-{datetime.now():%Y%m%d-%H%M}.xlsx",
        )
        if not path:
            return

        try:
            write_xlsx(path, EXPORT_HEADERS, export_rows(self.store.records), EXPORT_WIDTHS)
        except OSError as exc:
            messagebox.showerror("Export failed", f"Could not write the file:\n{exc}\n\nIf it is open in Excel, close it and try again.")
            return

        count = len(self.store.records)
        try:
            self.store.mark_exported([r["id"] for r in self.store.records])
        except OSError:
            pass
        self.reload_tree()
        self.status.set(f"SUCCESS: Exported {count} log(s) to {os.path.basename(path)}.")
        messagebox.showinfo(
            "Export complete",
            f"{count} log(s) saved to:\n{path}\n\n"
            "When the internet is back, open the ParkTags website → Manual entries → Import offline logs."
        )

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
            messagebox.showwarning("No port selected", "Connect the ESP32 and select its COM port.")
            return

        try:
            ser = serial.Serial(selected, BAUD, timeout=0.2, write_timeout=1)
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
        self.root.after(ESP_RESET_DELAY_MS, lambda: self.finish_connect(ser, selected, gen))

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
            target=self.serial_reader, args=(ser, self.stop_event, gen), daemon=True
        )
        self.reader_thread.start()

        self.connect_btn.config(text="Disconnect")
        self.connection.set(f"Connected to {selected}")
        self.status.set("USB connected. Starting card detection...")
        self.send_command("PING")
        self.start_scan()

    def disconnect(self, message="USB connection closed."):
        self.generation += 1
        self.connecting = False
        self.stop_event.set()

        ser, self.ser = self.ser, None
        try:
            if ser:
                try:
                    ser.write(b"STOP\n")
                except (serial.SerialException, OSError):
                    pass
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

        self.cancel_scan_timer()
        self.awaiting_scan = False
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

    # ------------------------------------------------------- card detection
    def start_scan(self):
        if self.send_command("SCAN"):
            self.awaiting_scan = True
            self.cancel_scan_timer()
            self.scan_timer = self.root.after(SCAN_START_TIMEOUT_MS, self.on_scan_start_timeout)

    def cancel_scan_timer(self):
        if self.scan_timer is not None:
            self.root.after_cancel(self.scan_timer)
            self.scan_timer = None

    def on_scan_start_timeout(self):
        self.scan_timer = None
        if self.awaiting_scan:
            self.awaiting_scan = False
            self.status.set(
                "ERROR: The ESP32 did not start card detection. Upload the updated rfid_esp32.ino, "
                "then disconnect and connect again."
            )

    def on_card(self, uid, user_id):
        self.last_card.set(f"Last card: UID {uid or 'unknown'}  ·  User ID {user_id or 'none stored'}")
        if self.dialog is not None:
            self.status.set("Finish or cancel the current entry before tapping another card.")
            return

        self.root.deiconify()
        self.root.bell()
        self.status.set("Card detected. Enter the plate number or vehicle UID.")
        self.dialog = VehicleDialog(self, uid, user_id, datetime.now())

    # ------------------------------------------------------------- serial
    def serial_reader(self, ser, stop_event, gen):
        """Runs in a background thread with its own port reference, so disconnect() can't break it."""
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
            self.disconnect("USB connection lost. Check the cable and reconnect. Saved logs are safe.")
            return

        if line.startswith("READY|") or line.startswith("DEBUG|"):
            return

        if line.startswith("STATUS|"):
            message = line[7:]
            if message == "WAITING_SCAN":
                self.awaiting_scan = False
                self.cancel_scan_timer()
                self.connection.set(f"Connected to {self.port.get()}  •  Reader ready")
                self.status.set("Ready. Tap a card on the reader.")
            elif message.startswith("ERROR:Unknown command") and self.awaiting_scan:
                self.awaiting_scan = False
                self.cancel_scan_timer()
                self.status.set(
                    "ERROR: This ESP32 is running the old sketch. Upload the updated rfid_esp32.ino, "
                    "then disconnect and connect again."
                )
            elif message.startswith("ERROR:"):
                self.status.set(message)
            return

        scan = parse_scan_line(line)
        if scan is None:
            return

        uid, user_id, ok, message = scan
        if not ok:
            self.status.set("ERROR: " + message)
            return
        self.on_card(uid, user_id)

    # -------------------------------------------------------------- close
    def close(self):
        self.stop_event.set()
        try:
            if self.ser and self.ser.is_open:
                try:
                    self.ser.write(b"STOP\n")
                except (serial.SerialException, OSError):
                    pass
                self.ser.close()
        except (serial.SerialException, OSError):
            pass
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    app = OfflineGateLogger(root)
    root.mainloop()
