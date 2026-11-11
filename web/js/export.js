import { toast } from "./ui.js";
import { h, isStaff, today, vehicleTypeLabel } from "./utils.js";



export function exportToExcel({ filename, sheet, columns, rows }) {
  const xlsx = window.XLSX;
  if (!xlsx) throw new Error("Excel writer did not load. Check your internet connection and reload the page.");
  if (!rows.length) throw new Error("There is nothing to export. Adjust the filters and try again.");
  const data = [columns.map((c) => c.header), ...rows.map((row) => columns.map((c) => c.value(row) ?? ""))];
  const worksheet = xlsx.utils.aoa_to_sheet(data);
  worksheet["!cols"] = columns.map((c, i) => ({ wch: Math.min(45, Math.max(c.header.length, ...data.slice(1, 300).map((r) => String(r[i]).length)) + 2) }));
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, sheet.slice(0, 31));
  xlsx.writeFile(workbook, `${filename}-${today()}.xlsx`);
  return `Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`;
}

export const exportButton = (getSpec) =>
  h("button", {
    class: "btn",
    onclick: () => {
      try { toast(exportToExcel(getSpec())); } catch (error) { toast(error.message || "Could not export", "err"); }
    },
  }, "Export Excel");

/* ---------------- column sets ---------------- */

const timestampOf = (log) =>
  log.timestamp
    ? new Date(log.timestamp).toLocaleString("sv-SE", { ...(log.isUTC && { timeZone: "Asia/Manila" }), hour12: false }).slice(0, 16)
    : log.timestamp_human || "";
const KIND_LABEL = { student: "Student", staff: "Staff", visitor: "Visitor", pending: "Unidentified" };
const blankIfNA = (value) => (value === "N/A" ? "" : value);

export const ACTIVITY_COLUMNS = [
  { header: "Date & time", value: timestampOf },
  { header: "User ID", value: (r) => r.student_id || "" },
  { header: "Name", value: (r) => r.name },
  { header: "User type", value: (r) => KIND_LABEL[r.kind] || "" },
  { header: "Vehicle ID", value: (r) => r.card_uid || "" },
  { header: "Vehicle type", value: (r) => (r.vehicleType === "N/A" ? "" : vehicleTypeLabel(r.vehicleType)) },
  { header: "Plate", value: (r) => blankIfNA(r.plate) },
  { header: "Result", value: (r) => r.label },
  { header: "Source", value: (r) => (r.manual ? "Manual entry" : "Gate scan") },
  { header: "Reader", value: (r) => r.reader || "" },
  { header: "Recorded by", value: (r) => r.recorded_by || "" },
  { header: "Remarks", value: (r) => r.remarks || "" },
  { header: "Open incident", value: (r) => (r.incident ? r.incident.remarks : "") },
  { header: "Pending details", value: (r) => (r.needs_details ? "Yes" : "") },
  { header: "Log ID", value: (r) => r.id },
];

const vehicleSummary = (u) =>
  Object.entries(u.vehicles || {}).map(([id, v]) => `${vehicleTypeLabel(v.type)} ${v.plate_number || "no plate"} (${id})`).join("; ");

export const USER_COLUMNS = [
  { header: "ID", value: (u) => u.id },
  { header: "Name", value: (u) => u.name || "" },
  { header: "Type", value: (u) => (u.kind === "staff" ? "Staff" : "Student") },
  { header: "Course / Department", value: (u) => u.course || u.department || "" },
  { header: "Year level", value: (u) => (u.kind === "staff" ? "" : u.year_level || "") },
  { header: "Email", value: (u) => u.email || "" },
  { header: "Contact number", value: (u) => u.contact_number || "" },
  { header: "Emergency contact name", value: (u) => u.emergency_contact?.name || "" },
  { header: "Emergency contact phone", value: (u) => u.emergency_contact?.phone || "" },
  { header: "Emergency contact relationship", value: (u) => u.emergency_contact?.relationship || "" },
  { header: "Vehicles", value: (u) => u.vehicleCount },
  { header: "Vehicle details", value: vehicleSummary },
  { header: "Parked now", value: (u) => (u.vehicleCount ? (u.parked ? "Yes" : "No") : "No vehicle") },
  { header: "Date registered", value: (u) => u.date_registered || "" },
  { header: "Last updated", value: (u) => u.last_updated || "" },
];

const ARCHIVED = [
  { header: "Archived on", value: (r) => r.archived_at || "" },
  { header: "Reason", value: (r) => r.archived_reason || "" },
];

export const ARCHIVE_COLUMNS = {
  users: [
    { header: "ID", value: (u) => u.id },
    { header: "Name", value: (u) => u.name || "" },
    { header: "Type", value: (u) => (isStaff(u.id, u) ? "Staff" : "Student") },
    { header: "Course / Department", value: (u) => u.course || u.department || "" },
    { header: "Year level", value: (u) => u.year_level || "" },
    { header: "Email", value: (u) => u.email || "" },
    { header: "Contact number", value: (u) => u.contact_number || "" },
    { header: "Vehicles", value: (u) => Object.keys(u.vehicles || {}).length },
    { header: "Date registered", value: (u) => u.date_registered || "" },
    ...ARCHIVED,
  ],
  vehicles: [
    { header: "Vehicle ID", value: (v) => v.vehicleId },
    { header: "Owner ID", value: (v) => v.studentId },
    { header: "Type", value: (v) => (v.type ? vehicleTypeLabel(v.type) : "") },
    { header: "Brand", value: (v) => v.brand || "" },
    { header: "Model", value: (v) => v.model || "" },
    { header: "Plate", value: (v) => v.plate_number || "" },
    { header: "Color", value: (v) => v.color || "" },
    { header: "Registration expiry", value: (v) => v.registration_expiry || "" },
    ...ARCHIVED,
  ],
  cards: [
    { header: "Card UID", value: (c) => c.id },
    { header: "Label", value: (c) => c.label || "" },
    { header: "Added", value: (c) => c.created || "" },
    { header: "Added by", value: (c) => c.created_by || "" },
    ...ARCHIVED,
  ],
  accounts: [
    { header: "Email", value: (a) => a.email || "" },
    { header: "Role", value: (a) => a.role || "" },
    ...ARCHIVED,
  ],
};
