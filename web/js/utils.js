import { BREAKDOWN_ORDER, DEFAULT_SLOT_LIMITS, NOT_PARKED, OTHER_TYPE, PLATE_OPTIONAL_TYPES, RELATIONSHIPS, SLOT_LABELS, SLOT_TYPES, STAFF_PREFIX, VEHICLE_LABELS, VEHICLE_TYPES, YEAR_MAX, YEAR_MIN } from "./constants.js";

/* ---------------- DOM helper ---------------- */


export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, val] of Object.entries(props || {})) {
    if (val == null || val === false) continue;
    if (key === "class") el.className = val;
    else if (key === "value") value = val;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), val);
    else el.setAttribute(key, val === true ? "" : val);
  }
  const append = (child) => {
    if (child == null || child === false) return;
    if (Array.isArray(child)) child.forEach(append);
    else el.append(child instanceof Node ? child : String(child));
  };
  children.forEach(append);
  if (value !== undefined) el.value = value; // after children, so <select> options exist
  return el;
}

export function mount(slot, ...children) {
  slot.replaceChildren(...children.flat(Infinity).filter((child) => child != null && child !== false));
}

/* ---------------- dates ---------------- */

export const toDateKey = (date = new Date()) => date.toLocaleDateString("en-CA"); // local YYYY-MM-DD
export const today = () => toDateKey();

export function formatLogTimestamp(log) {
  if (!log.timestamp) return log.timestamp_human || "N/A";
  return new Date(log.timestamp).toLocaleString("en-PH", {
    ...(log.isUTC && { timeZone: "Asia/Manila" }),
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const formatDateTime = (ms) => (ms ? new Date(ms).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—");

/* ---------------- vehicle types ---------------- */

const TYPE_ALIASES = {
  car: "car", motorcycle: "motorcycle", motorbike: "motorcycle",
  bike: "bike", bicycle: "bike", ebike: "ebike", electricbike: "ebike", electricbicycle: "ebike",
};

export function normalizeVehicleType(raw) {
  const text = String(raw ?? "").trim();
  return TYPE_ALIASES[text.toLowerCase().replace(/[^a-z]/g, "")] || text;
}
export const vehicleBucket = (type) => {
  const normalized = normalizeVehicleType(type);
  return VEHICLE_TYPES.includes(normalized) ? normalized : "other";
};
export const vehicleTypeLabel = (type) => (vehicleBucket(type) === "other" ? type || "Other" : VEHICLE_LABELS[vehicleBucket(type)]);
export const plateRequired = (type) => !PLATE_OPTIONAL_TYPES.includes(normalizeVehicleType(type));
export const normalizePlate = (plate) => String(plate || "").toUpperCase().replace(/[\s-]/g, "");


const PERSON_NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
export function isValidPersonName(name) {
  const value = String(name ?? "").trim();
  return value.length >= 2 && value.length <= 80 && PERSON_NAME.test(value) && !/\s{2,}/.test(value);
}
export const isValidFirebaseKey = (key) => !!key && !/[.$#[\]/]/.test(key);
export const isValidEmail = (email) => email.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
export const isValidPhone = (phone) => /^\+?[0-9 ()-]+$/.test(phone) && phone.replace(/\D/g, "").length >= 7 && phone.replace(/\D/g, "").length <= 15;

const FIELD_LABELS = {
  name: "Full name", id: "Student / Staff ID", course: "Course / department", year: "Year level", email: "Email",
  phone: "Contact number", emergencyName: "Emergency contact name", emergencyPhone: "Emergency contact phone",
  emergencyRelationship: "Emergency contact relationship", vehicleId: "Vehicle ID", vehicleType: "Vehicle type",
  customType: "Vehicle type", brand: "Brand", model: "Model", plate: "Plate number", color: "Color", expiry: "Registration expiry",
};
const NAME_MESSAGE = "must be 2–80 letters; only spaces, periods, apostrophes and hyphens are allowed.";
const ok = (valid, message) => (valid ? "" : message);

const RULES = {
  name: (v) => ok(isValidPersonName(v), `Full name ${NAME_MESSAGE}`),
  emergencyName: (v) => ok(isValidPersonName(v), `Emergency contact name ${NAME_MESSAGE}`),
  id: (v) => ok(/^[A-Za-z0-9_-]{3,20}$/.test(v), "ID must be 3–20 characters: letters, numbers, hyphens or underscores (no spaces)."),
  course: (v) => ok(/^[\p{L}\p{N}][\p{L}\p{N} .,&()'\/-]{1,59}$/u.test(v), "Course / department must be 2–60 characters (letters, numbers and basic punctuation)."),
  year: (v) => ok(/^\d+$/.test(v) && +v >= YEAR_MIN && +v <= YEAR_MAX, `Year level must be a whole number from ${YEAR_MIN} to ${YEAR_MAX}.`),
  email: (v) => ok(isValidEmail(v), "Enter a valid email address, like name@example.com."),
  phone: (v) => ok(isValidPhone(v), "Enter a valid phone number: 7–15 digits (+, spaces, dashes and brackets are allowed)."),
  emergencyPhone: (v) => ok(isValidPhone(v), "Enter a valid emergency phone number: 7–15 digits (+, spaces, dashes and brackets are allowed)."),
  emergencyRelationship: (v) => ok(RELATIONSHIPS.includes(v), "Choose a relationship from the list."),
  vehicleId: (v) => ok(isValidFirebaseKey(v) && /^\S{3,40}$/.test(v), "Vehicle ID must be 3–40 characters with no spaces and none of . $ # [ ] /"),
  vehicleType: (v) => ok(/^[\p{L}][\p{L} -]{1,19}$/u.test(v), "Vehicle type must be 2–20 letters."),
  customType: (v) => ok(/^[\p{L}][\p{L} -]{1,19}$/u.test(v), "Specify the vehicle type using 2–20 letters."),
  brand: (v) => ok(/^[\p{L}\p{N}][\p{L}\p{N} .'\/&+-]{0,29}$/u.test(v), "Brand must be 1–30 characters (letters, numbers and basic punctuation)."),
  model: (v) => ok(/^[\p{L}\p{N}][\p{L}\p{N} .'\/&+-]{0,29}$/u.test(v), "Model must be 1–30 characters (letters, numbers and basic punctuation)."),
  plate: (v) => ok(/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(v), "Plate number must be 2–10 characters: letters, numbers, spaces or hyphens."),
  color: (v) => ok(/^\p{L}[\p{L} -]{1,19}$/u.test(v), "Color must be 2–20 letters (spaces and hyphens are allowed)."),
  expiry: (v) => {
    const date = new Date(`${v}T00:00:00`);
    const latest = new Date();
    latest.setFullYear(latest.getFullYear() + 10);
    return ok(/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(date.getTime()) && date >= new Date("2000-01-01T00:00:00") && date <= latest,
      "Enter a valid registration expiry date (between the year 2000 and 10 years from now).");
  },
};

function isRequired(field, ctx) {
  if (field === "year") return !ctx.staff; // staff may leave year level blank
  if (field === "plate") return plateRequired(ctx.resolvedType ?? ctx.vehicleType); // bikes/e-bikes may have no plate
  if (field === "customType") return ctx.vehicleType === OTHER_TYPE;
  return true;
}

export function checkField(field, value, ctx = {}) {
  const text = String(value ?? "").trim();
  if (!text) return isRequired(field, ctx) ? `${FIELD_LABELS[field]} is required.` : "";
  return RULES[field](text, ctx);
}
export function personErrors(values, { staff = isStaff(values.id || "", values) } = {}) {
  const ctx = { staff };
  return ["name", "id", "course", "year", "email", "phone", "emergencyName", "emergencyPhone", "emergencyRelationship"]
    .filter((field) => field !== "id" || values.id !== undefined)
    .map((field) => checkField(field, values[field], ctx))
    .filter(Boolean);
}

export function vehicleErrors(values, { withId = true, requireExpiry = true } = {}) {
  const ctx = { vehicleType: values.vehicleType, resolvedType: resolveVehicleType(values) };
  const fields = [withId && "vehicleId", "vehicleType", values.vehicleType === OTHER_TYPE && "customType", "brand", "model", "plate", "color", (requireExpiry || values.expiry) && "expiry"];
  return fields.filter(Boolean).map((field) => checkField(field, values[field], ctx)).filter(Boolean);
}

export function assertValid(errors) {
  if (errors.length) throw new Error(errors[0]);
}

/* ---------------- users & vehicles ---------------- */

export const isStaffId = (id) => String(id || "").trim().startsWith(STAFF_PREFIX);
export const isStaff = (id, student = {}) => isStaffId(id) || !!student.department;
export const vehiclesOf = (student) => Object.values(student?.vehicles || {});
export const hasParkedVehicle = (student) => vehiclesOf(student).some((v) => v.current_status === "parked");
export const initialsOf = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export const toRows = (map) => Object.entries(map || {}).map(([id, record]) => ({ ...record, id }));
export function stripArchiveStamp(record) {
  const { archived_at, archived_reason, ...rest } = record;
  return rest;
}

export const resolveVehicleType = (v) => (v.vehicleType === OTHER_TYPE ? (v.customType || "").trim() : v.vehicleType);
export const toVehicleRecord = (v, status = NOT_PARKED) => ({
  type: normalizeVehicleType(resolveVehicleType(v)),
  brand: v.brand.trim(),
  model: v.model.trim(),
  plate_number: (v.plate || "").trim().toUpperCase(),
  color: v.color.trim(),
  registration_expiry: v.expiry,
  is_active: true,
  current_status: status,
});

export const toPersonRecord = (v) => ({
  name: v.name.trim(),
  course: v.course.trim(),
  email: v.email.trim(),
  contact_number: v.phone.trim(),
  year_level: v.year ? Number(v.year) : null,
  last_updated: today(),
  emergency_contact: { name: v.emergencyName.trim(), phone: v.emergencyPhone.trim(), relationship: v.emergencyRelationship.trim() },
});

/* ---------------- display rows ---------------- */

export function buildUserRows(students) {
  return Object.entries(students || {})
    .map(([id, s]) => ({ ...s, id, kind: isStaff(id, s) ? "staff" : "student", vehicleCount: vehiclesOf(s).length, parked: hasParkedVehicle(s) }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
export const countVehicles = (users) => users.reduce((n, u) => n + u.vehicleCount, 0);
export const countParkedUsers = (users) => users.filter((u) => u.parked).length;
export const countParkedVehicles = (students) =>
  Object.values(students).flatMap(vehiclesOf).filter((v) => v.current_status === "parked").length;
export const recentlyRegistered = (users, limit) =>
  [...users].sort((a, b) => (b.date_registered || "").localeCompare(a.date_registered || "")).slice(0, limit);

function directionLabel(log) {
  if (!log.granted) return "Denied";
  if (log.access_type === "EXIT") return "Exit";
  if (log.access_type === "ENTRANCE") return "Entry";
  return log.access_type || "Unknown";
}

/** The open incident report (if any) that applies to this vehicle: same registered vehicle, or same plate. */
export function openIncidentFor(openIncidents, studentId, vehicleId, plate) {
  const normalized = normalizePlate(plate);
  return openIncidents.find((i) =>
    (i.vehicle_id && i.student_id === studentId && i.vehicle_id === vehicleId) || (i.plate && normalized && i.plate === normalized)) || null;
}

export function toActivityRow(id, log, students, openIncidents = []) {
  const student = students[log.student_id];
  const vehicle = student?.vehicles?.[log.card_uid];
  const visitor = log.visitor_data;
  const needsDetails = !!(log.needs_details || log.user_type === "admin");
  const isVisitor = log.user_type === "visitor";
  const isManual = !!(log.manual_entry || log.manual_card || log.reader === "MANUAL" || log.user_type === "admin");
  const vehicleType = isVisitor ? visitor?.vehicle_type : vehicle?.type || visitor?.vehicle_type;
  const plate = isVisitor ? visitor?.plate_number : vehicle?.plate_number || visitor?.plate_number;
  return {
    ...log,
    id,
    hasPhoto: !!student?.has_photo,
    incident: log.granted && log.access_type === "ENTRANCE" && !needsDetails ? openIncidentFor(openIncidents, log.student_id, log.card_uid, plate) : null,
    needs_details: needsDetails,
    manual: isManual,
    unregistered: isManual && !isVisitor && !needsDetails && !student,
    name: needsDetails ? "Unidentified" : isVisitor ? visitor?.name || "Visitor" : student?.name || visitor?.name || "N/A",
    vehicleType: vehicleType || "N/A",
    plate: plate || "N/A",
    kind: needsDetails ? "pending" : isVisitor ? "visitor" : isStaff(log.student_id || "", student) ? "staff" : "student",
    label: directionLabel(log),
    time: formatLogTimestamp(log),
    date: log.timestamp ? toDateKey(new Date(log.timestamp)) : "",
  };
}
export function buildActivityRows(logs, students, incidents = []) {
  const open = incidents.filter((i) => i.status === "open");
  return Object.entries(logs || {}).map(([id, log]) => toActivityRow(id, log, students, open)).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

export const buildVehicleRows = (students) =>
  Object.entries(students || {})
    .flatMap(([studentId, student]) =>
      Object.entries(student.vehicles || {}).map(([vehicleId, vehicle]) => ({
        ...vehicle, id: `${studentId}/${vehicleId}`, vehicleId, studentId,
        ownerName: student.name || "N/A", bucket: vehicleBucket(vehicle.type), parked: vehicle.current_status === "parked",
      })))
    .sort((a, b) => a.ownerName.localeCompare(b.ownerName) || a.vehicleId.localeCompare(b.vehicleId));

/** One row per slot type: how many are parked, the limit (null = no limit) and how many slots are left. */
export function buildSlotRows(parkedRows, limits) {
  const counts = countByBucket(parkedRows);
  return SLOT_TYPES.map((key) => {
    const raw = limits?.[key] ?? DEFAULT_SLOT_LIMITS[key];
    const limit = Number.isFinite(raw) ? raw : null;
    const parked = counts[key];
    return { key, label: SLOT_LABELS[key], parked, limit, available: limit === null ? null : Math.max(0, limit - parked), full: limit !== null && parked >= limit };
  });
}

export function countByBucket(vehicleRows) {
  const counts = { motorcycle: 0, car: 0, bike: 0, ebike: 0, other: 0 };
  vehicleRows.forEach((row) => { counts[row.bucket] += 1; });
  return counts;
}

export const breakdownText = (counts) => BREAKDOWN_ORDER.map((key) => `${VEHICLE_LABELS[key]} ${counts[key]}`).join(" · ");

/* ---------------- filters ---------------- */

export const matchesText = (query, fields) => {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((f) => String(f ?? "").toLowerCase().includes(needle));
};
export const inRange = (value, from, to) => (!from || value >= from) && (!to || value <= to);

export const defaultUserFilters = { kind: "all", course: "all", year: "all", from: "", to: "" };
export const filterUsers = (users, query, f) =>
  users.filter((u) =>
    matchesText(query, [u.name, u.id, u.email]) &&
    (f.kind === "all" || u.kind === f.kind) &&
    (f.course === "all" || u.course === f.course) &&
    (f.year === "all" || String(u.year_level) === f.year) &&
    inRange(u.date_registered || "", f.from, f.to));

export const defaultVehicleFilters = { type: "all", status: "all" };
export const filterVehicles = (rows, query, f) =>
  rows.filter((r) =>
    matchesText(query, [r.vehicleId, r.plate_number, r.ownerName, r.studentId, r.brand, r.model]) &&
    (f.type === "all" || r.bucket === f.type) &&
    (f.status === "all" || r.parked === (f.status === "parked")));


export const defaultIncidentFilters = { status: "open" };
export const filterIncidents = (rows, query, f) =>
  rows.filter((r) =>
    matchesText(query, [r.owner_name, r.student_id, r.vehicle_id, r.plate, r.remarks, r.created_by]) &&
    (f.status === "all" || r.status === f.status));

export const defaultManualFilters = { source: "all", kind: "all", result: "all", vehicle: "all", from: "", to: "" };

export function parseHash(hash) {
  const [path, queryString = ""] = String(hash || "").replace(/^#/, "").split("?");
  return { path: path || "/", query: Object.fromEntries(new URLSearchParams(queryString)) };
}

export const defaultActivityFilters = { source: "all", kind: "all", result: "granted", vehicle: "all", from: "", to: "" };
function matchesResult(row, result) {
  if (result === "all") return true;
  if (result === "granted") return row.granted;
  if (result === "DENIED") return !row.granted;
  if (result === "PENDING") return row.needs_details;
  return row.granted && row.access_type === result; 
}
function matchesVehicle(row, vehicle) {
  if (vehicle === "all") return true;
  const bucket = vehicleBucket(row.vehicleType);
  return vehicle === "Other" ? bucket === "other" : bucket === vehicle;
}
export const filterActivities = (rows, query, f) =>
  rows.filter((r) =>
    matchesText(query, [r.name, r.student_id, r.plate]) &&
    (f.kind === "all" || r.kind === f.kind) &&
    (f.source === "all" || r.manual === (f.source === "manual")) &&
    matchesResult(r, f.result) &&
    matchesVehicle(r, f.vehicle) &&
    inRange(r.date, f.from, f.to));

/* ---------------- Excel import ---------------- */

const COLUMN_ALIASES = {
  id: ["id", "studentid", "staffid", "studentstaffid", "student staff id", "student / staff id", "user id"],
  name: ["name", "fullname", "user name"],
  course: ["course", "department", "coursedepartment"],
  year: ["year", "yearlevel", "year level"],
  email: ["email", "emailaddress"],
  phone: ["phone", "contactnumber", "contact number", "mobile"],
  emergencyName: ["emergencyname", "emergencycontactname", "emergency contact name"],
  emergencyPhone: ["emergencyphone", "emergencycontactphone", "emergency contact phone"],
  emergencyRelationship: ["relationship", "emergencyrelationship", "emergency contact relationship"],
  vehicleId: ["vehicleid", "rfid", "rfidtag", "vehicle id", "rfid tag"],
  vehicleType: ["vehicletype", "vehicle type", "type"],
  brand: ["brand", "vehiclebrand"],
  model: ["model", "vehiclemodel"],
  plate: ["plate", "platenumber", "plate number"],
  color: ["color", "vehiclecolor"],
  expiry: ["expiry", "registrationexpiry", "registration expiry"],
};
const normalizeHeader = (x) => String(x ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, " ");
const HEADER_TO_FIELD = new Map(Object.entries(COLUMN_ALIASES).flatMap(([field, aliases]) => aliases.map((a) => [normalizeHeader(a), field])));

function mapRow(rawRow, row) {
  const record = Object.fromEntries(Object.keys(COLUMN_ALIASES).map((k) => [k, ""]));
  for (const [header, value] of Object.entries(rawRow)) {
    const field = HEADER_TO_FIELD.get(normalizeHeader(header));
    if (field) record[field] = String(value ?? "").trim();
  }
  return { ...record, row };
}

export function validateImportRecord(record) {
  const errors = personErrors(record);
  if (record.vehicleId) errors.push(...vehicleErrors({ ...record, customType: "" }, { requireExpiry: false }));
  return errors;
}

export async function readUserWorkbook(file) {
  const xlsx = window.XLSX;
  if (!xlsx) throw new Error("Excel reader did not load. Check your internet connection and reload the page.");
  const workbook = xlsx.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The workbook has no worksheet");
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!rawRows.length) throw new Error("The worksheet is empty");

  const seenIds = new Set(), seenVehicleIds = new Set(), seenPlates = new Set(), valid = [], issues = [];
  rawRows.forEach((raw, index) => {
    const record = mapRow(raw, index + 2); 
    const errors = validateImportRecord(record);
    if (seenIds.has(record.id)) errors.push("Duplicate ID in this file");
    if (record.vehicleId && seenVehicleIds.has(record.vehicleId)) errors.push("Duplicate vehicle ID in this file");
    const plate = normalizePlate(record.plate);
    if (plate && seenPlates.has(plate)) errors.push("Duplicate plate number in this file");
    if (record.id) seenIds.add(record.id);
    if (record.vehicleId) seenVehicleIds.add(record.vehicleId);
    if (plate) seenPlates.add(plate);
    if (errors.length) issues.push({ row: record.row, errors });
    else valid.push(record);
  });
  return { valid, issues };
}

/* ---------------- Offline log import ---------------- */


export const OFFLINE_REASON = "Network Unavailable";

const OFFLINE_COLUMN_ALIASES = {
  logId: ["log id", "logid"],
  timestamp: ["timestamp", "time", "date time", "datetime", "date and time"],
  direction: ["direction", "entry or exit", "entry exit", "access type"],
  cardUid: ["card uid", "carduid", "card"],
  userId: ["user id", "userid", "student id", "student staff id"],
  vehicle: ["plate vehicle uid", "plate or vehicle uid", "plate number", "plate", "vehicle uid", "vehicle id", "vehicleid"],
};
const OFFLINE_HEADER_TO_FIELD = new Map(Object.entries(OFFLINE_COLUMN_ALIASES).flatMap(([field, aliases]) => aliases.map((a) => [normalizeHeader(a), field])));
const OFFLINE_DIRECTIONS = { entry: "ENTRANCE", entrance: "ENTRANCE", in: "ENTRANCE", enter: "ENTRANCE", exit: "EXIT", out: "EXIT" };
const MAX_OFFLINE_VEHICLE_LENGTH = 40;


export function parseOfflineTimestamp(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return new Date(text).getTime();
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part || 0));
  const date = new Date(year, month - 1, day, hour, minute, second);
  return date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : NaN;
}


export const offlineLogKey = (row, time) =>
  `OFFLINE_${(row.logId || `${time}-${row.cardUid || "NOCARD"}-${row.vehicle}`).replace(/[.$#[\]/\s]/g, "_")}`.slice(0, 120);

export function parseOfflineRows(rawRows) {
  const seen = new Set(), valid = [], issues = [];
  rawRows.forEach((raw, index) => {
    const row = index + 2; // row 1 is the header
    const record = { logId: "", timestamp: "", direction: "", cardUid: "", userId: "", vehicle: "" };
    for (const [header, value] of Object.entries(raw)) {
      const field = OFFLINE_HEADER_TO_FIELD.get(normalizeHeader(header));
      if (field) record[field] = String(value ?? "").trim();
    }
    if (!Object.values(record).some(Boolean)) return; 
  
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(record.userId)) record.userId = "";

    const errors = [];
    const time = parseOfflineTimestamp(record.timestamp);
    if (Number.isNaN(time)) errors.push("Timestamp is missing or not a valid date and time");
    else if (time > Date.now() + 5 * 60 * 1000) errors.push("Timestamp is in the future");
    const direction = OFFLINE_DIRECTIONS[record.direction.toLowerCase()];
    if (!direction) errors.push("Direction must be Entry or Exit");
    if (!record.vehicle) errors.push("Plate / Vehicle UID is required");
    else if (record.vehicle.length > MAX_OFFLINE_VEHICLE_LENGTH) errors.push(`Plate / Vehicle UID can be at most ${MAX_OFFLINE_VEHICLE_LENGTH} characters`);

    const key = offlineLogKey(record, Number.isNaN(time) ? record.timestamp : time);
    if (seen.has(key)) errors.push("Duplicate log in this file");
    if (errors.length) return issues.push({ row, errors });
    seen.add(key);
    valid.push({ ...record, key, time, direction, row });
  });
  return { valid, issues };
}


export async function readOfflineWorkbook(file) {
  const xlsx = window.XLSX;
  if (!xlsx) throw new Error("Excel reader did not load. Check your internet connection and reload the page.");
  const workbook = xlsx.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The workbook has no worksheet");
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!rawRows.length) throw new Error("The worksheet is empty");
  const result = parseOfflineRows(rawRows);
  if (!result.valid.length && !result.issues.length) throw new Error("No log rows found in the worksheet");
  return result;
}


export function resolveOfflineLog(row, students) {
  const typed = row.vehicle.trim();
  const typedLower = typed.toLowerCase();
  const typedPlate = normalizePlate(typed);
  const findVehicle = (studentId) =>
    Object.entries(students[studentId]?.vehicles || {}).find(([vehicleId, vehicle]) =>
      vehicleId === typed || vehicleId.toLowerCase() === typedLower || (typedPlate && normalizePlate(vehicle.plate_number) === typedPlate))?.[0] || null;

  if (row.userId && students[row.userId]) {
    const vehicleId = findVehicle(row.userId);
    return { studentId: row.userId, vehicleId, match: vehicleId ? "registered" : "unmatched-vehicle" };
  }
  for (const studentId of Object.keys(students)) {
    const vehicleId = findVehicle(studentId);
    if (vehicleId) return { studentId, vehicleId, match: "registered" };
  }
  return { studentId: row.userId || null, vehicleId: null, match: row.userId ? "unregistered-user" : "unidentified" };
}

export function buildOfflineLog(row, resolved, students, recordedBy) {
  const plate = row.vehicle.trim().toUpperCase();
  const plateTag = plate.replace(/\s+/g, "_");
  const base = {
    access_type: row.direction,
    remarks: OFFLINE_REASON,
    recorded_by: recordedBy,
    granted: true,
    reader: "MANUAL",
    manual_entry: true,
    timestamp: row.time,
    manual_card_uid: row.cardUid || null,
    offline_log_id: row.logId || null,
  };
  if (resolved.vehicleId) return { ...base, user_type: "student", student_id: resolved.studentId, card_uid: resolved.vehicleId };
  if (resolved.studentId) {
    return {
      ...base, user_type: "student", student_id: resolved.studentId, card_uid: `MANUAL_${plateTag}`,
      visitor_data: { name: students[resolved.studentId]?.name || "Unknown", vehicle_type: "Unknown", plate_number: plate },
    };
  }
  return {
    ...base, user_type: "visitor", student_id: `VISITOR_${row.time}`, card_uid: `VISITOR_${plateTag}`,
    visitor_data: { name: "Unidentified", vehicle_type: "Unknown", plate_number: plate },
  };
}
