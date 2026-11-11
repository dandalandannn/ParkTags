
import { session } from "./auth.js";
import { OTHER_TYPE, RELATIONSHIPS, UNLISTED_VEHICLE, VEHICLE_TYPES, YEAR_MAX, YEAR_MIN } from "./constants.js";
import { deriveActivityMode, importOfflineLogs, importUsers, registerUser, saveActivity, saveVehicle, updateUserProfile } from "./services.js";
import { field, formActions, handleSubmit, openModal, options, toast } from "./ui.js";
import { photoPicker, savePhoto } from "./photos.js";
import { checkField, h, isStaff, isStaffId, mount, plateRequired, readOfflineWorkbook, readUserWorkbook, resolveOfflineLog } from "./utils.js";

/* ---------------- form-building helpers ---------------- */

const row2 = (...fields) => h("div", { class: "row2" }, fields);
const input = (name, attrs = {}) => h("input", { name, ...attrs });

function setEnabled(node, enabled) {
  node.hidden = !enabled;
  node.querySelectorAll("input, select, textarea").forEach((control) => (control.disabled = !enabled));
}


function validated(control, fieldName, getContext = () => ({})) {
  const run = () => control.setCustomValidity(checkField(fieldName, control.value, getContext()));
  control.addEventListener("input", run);
  control.addEventListener("change", run);
  control.revalidate = run;
  run();
  return control;
}

const VEHICLE_TYPE_OPTIONS = [["car", "Car"], ["motorcycle", "Motorcycle"], ["bike", "Bike"], ["ebike", "E-bike"], [OTHER_TYPE, "Other"]];

function personFields(values = {}, withId = false) {
  const staffNow = () => (withId ? isStaffId(idInput.value) : isStaff(values.id || "", values));

  const idInput = validated(input("id", { required: true, minlength: 3, maxlength: 20, autocomplete: "off", value: values.id }), "id");
  const yearInput = validated(input("year", { type: "number", min: YEAR_MIN, max: YEAR_MAX, step: 1, value: values.year }), "year", () => ({ staff: staffNow() }));
  const yearField = field("Year level", yearInput, `${YEAR_MIN}–${YEAR_MAX}`);

  const setStaff = () => {
    const staff = staffNow();
    yearInput.required = !staff;
    yearField.querySelector("span").textContent = staff ? "Year level (optional for staff)" : "Year level";
    yearInput.revalidate();
  };
  if (withId) idInput.addEventListener("input", setStaff);

  const nodes = [
    field("Full name", validated(input("name", { required: true, minlength: 2, maxlength: 80, autocomplete: "off", value: values.name }), "name"), "Letters, spaces, periods, apostrophes or hyphens."),
    withId && field("Student / Staff ID", idInput, "3–20 letters, numbers, - or _. Staff IDs start with E."),
    row2(field("Course / Department", validated(input("course", { required: true, maxlength: 60, value: values.course }), "course")), yearField),
    field("Email", validated(input("email", { type: "email", required: true, maxlength: 100, value: values.email }), "email")),
    field("Contact number", validated(input("phone", { type: "tel", required: true, maxlength: 20, value: values.phone }), "phone"), "e.g. 0917 123 4567 or +63 917 123 4567"),
    h("h4", {}, "Emergency contact"),
    field("Name", validated(input("emergencyName", { required: true, minlength: 2, maxlength: 80, value: values.emergencyName }), "emergencyName")),
    row2(
      field("Phone", validated(input("emergencyPhone", { type: "tel", required: true, maxlength: 20, value: values.emergencyPhone }), "emergencyPhone")),
      field("Relationship", validated(h("select", { name: "emergencyRelationship", required: true, value: values.emergencyRelationship || "" }, options(RELATIONSHIPS, "Select relationship…")), "emergencyRelationship"))),
  ];
  setStaff();
  return { nodes, idInput };
}

function vehicleTypeFields(values = {}) {
  const listeners = [];
  const select = validated(h("select", { name: "vehicleType", required: true, value: values.vehicleType || "" }, options(VEHICLE_TYPE_OPTIONS, "Select…")), "vehicleType");
  const custom = validated(input("customType", { required: true, maxlength: 20, value: values.customType }), "customType", () => ({ vehicleType: select.value }));
  const customField = field("Specify type", custom);
  const resolved = () => (select.value === OTHER_TYPE ? custom.value : select.value);

  const sync = (parentEnabled = true) => {
    const showCustom = parentEnabled && select.value === OTHER_TYPE;
    customField.hidden = !showCustom;
    custom.disabled = !showCustom;
    custom.revalidate();
  };
  const changed = () => { sync(); listeners.forEach((fn) => fn()); };
  select.addEventListener("change", changed);
  custom.addEventListener("input", () => listeners.forEach((fn) => fn()));
  sync();
  return { node: h("div", {}, field("Vehicle type", select), customField), sync, resolved, onChange: (fn) => listeners.push(fn) };
}

function plateFieldFor(typeFields, value = "") {
  const plate = validated(input("plate", { maxlength: 10, autocomplete: "off", value }), "plate", () => ({ resolvedType: typeFields.resolved() }));
  const node = field("Plate number", plate);
  const update = () => {
    const required = plateRequired(typeFields.resolved());
    plate.required = required;
    node.querySelector("span").textContent = required ? "Plate number" : "Plate number (optional for bikes)";
    plate.revalidate();
  };
  typeFields.onChange(update);
  update();
  return { node, input: plate, update };
}

function vehicleFields(values = {}, withId = true) {
  const typeFields = vehicleTypeFields(values);
  const plate = plateFieldFor(typeFields, values.plate);
  const nodes = [
    withId && field("RFID tag / Vehicle ID", validated(input("vehicleId", { required: true, minlength: 3, maxlength: 40, value: values.vehicleId }), "vehicleId"), "3–40 characters, no spaces. Must be unique."),
    typeFields.node,
    row2(field("Brand", validated(input("brand", { required: true, maxlength: 30, value: values.brand }), "brand")), field("Model", validated(input("model", { required: true, maxlength: 30, value: values.model }), "model"))),
    row2(plate.node, field("Color", validated(input("color", { required: true, maxlength: 20, value: values.color }), "color"))),
    field("Registration expiry", validated(input("expiry", { type: "date", required: true, value: values.expiry }), "expiry")),
  ];
  return { nodes, typeFields };
}

function vehicleFormValues(vehicleId = "", vehicle = {}) {
  const type = vehicle.type;
  const isStandard = VEHICLE_TYPES.includes(type);
  return {
    vehicleId,
    vehicleType: !type ? "" : isStandard ? type : OTHER_TYPE,
    customType: type && !isStandard ? type : "",
    brand: vehicle.brand || "",
    model: vehicle.model || "",
    plate: vehicle.plate_number || "",
    color: vehicle.color || "",
    expiry: vehicle.registration_expiry || "",
    status: vehicle.current_status || "not parked",
  };
}

/* ---------------- user modals ---------------- */

export function openAddUserModal() {
  const person = personFields({}, true);
  const vehicle = vehicleFields({});

  const photo = photoPicker();

  const form = h("form", {}, photo.node, person.nodes, h("h4", {}, "Vehicle"), vehicle.nodes, formActions(() => close(), "Add user"));
  const close = openModal("Add user", form);
  handleSubmit(form, async (values) => {
    const message = await registerUser(values);
    if (!photo.value()) return message;
    try {
      await savePhoto(values.id.trim(), photo.value());
      return message;
    } catch {
      return `${message}, but the photo could not be saved. Add it from the user’s profile.`;
    }
  }, close);
}

export function openEditProfileModal(studentId, student) {
  const emergency = student.emergency_contact || {};
  const person = personFields({
    name: student.name || "", id: studentId, course: student.course || "", year: student.year_level ? String(student.year_level) : "",
    email: student.email || "", phone: student.contact_number || "",
    emergencyName: emergency.name || "", emergencyPhone: emergency.phone || "", emergencyRelationship: emergency.relationship || "",
    department: student.department,
  });
  const form = h("form", {}, person.nodes, formActions(() => close(), "Save"));
  const close = openModal("Edit profile", form);
  handleSubmit(form, (values) => updateUserProfile(studentId, values, student), close);
}

export function openVehicleModal({ studentId, vehicleId, vehicles }) {
  const isEditing = !!vehicleId;
  const values = vehicleFormValues(vehicleId, isEditing ? vehicles?.[vehicleId] : {});
  const vehicle = vehicleFields(values);

  const form = h("form", {}, vehicle.nodes,
    isEditing && field("Status", h("select", { name: "status", value: values.status }, options([["parked", "Parked"], ["not parked", "Not parked"]]))),
    formActions(() => close(), isEditing ? "Save" : "Add vehicle"));
  const close = openModal(isEditing ? "Edit vehicle" : "Add vehicle", form);
  handleSubmit(form, (formValues) => saveVehicle({ studentId, originalVehicleId: vehicleId, values: formValues }), close);
}

/* ---------------- manual activity entry ---------------- */

/** "Now" in the format <input type="datetime-local"> expects, used as its max. */
const nowForInput = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);


export function openActivityModal({ students, pendingLog = null }) {
  let kind = "student";
  let lastStudentId = null;

  const kindButtons = Object.fromEntries([["student", "Student / Staff"], ["visitor", "Visitor"]].map(([key, label]) =>
    [key, h("button", { type: "button", class: "btn", onclick: () => { kind = key; sync(); } }, label)]));

  const studentInput = input("studentId", { list: "student-ids", required: true, maxlength: 20, autocomplete: "off" });
  const studentField = field("Student / Staff ID", studentInput);
  const idList = h("datalist", { id: "student-ids" }, Object.entries(students).map(([id, s]) => h("option", { value: id }, s.name)));
  const unregisteredNote = h("p", { class: "note" }, "Not registered yet — that’s fine. The entry is saved with the details below and picks up their registered name once they’re registered.");
  const vehicleSelect = h("select", { name: "vehicleId", required: true });
  const vehicleField = field("Vehicle", vehicleSelect);
  const personSection = h("div", {}, studentField, idList, unregisteredNote, vehicleField);

  const nameField = field("Full name", validated(input("visitorName", { required: true, minlength: 2, maxlength: 80 }), "name"));
  const typeFields = vehicleTypeFields();
  const plate = plateFieldFor(typeFields);
  const typedVehicle = h("div", {}, typeFields.node, plate.node);
  const timeInput = input("timestamp", { type: "datetime-local", max: nowForInput() });

  const form = h("form", {},
    pendingLog && h("p", { class: "note" }, "Gate card tap · ", h("b", {}, pendingLog.label), ` · ${pendingLog.time}`, h("br"),
      `Card ${pendingLog.card_uid || "N/A"}. Add who came through so the log is complete.`),
    h("div", { class: "seg" }, Object.values(kindButtons)),
    personSection, nameField, typedVehicle,
    row2(
      field("Entry or exit", h("select", { name: "accessType", value: pendingLog?.access_type === "EXIT" ? "EXIT" : "ENTRANCE" }, options([["ENTRANCE", "Entry"], ["EXIT", "Exit"]]))),
      !pendingLog && field("Time", timeInput, "Leave blank for now. Can’t be in the future.")),
    field("Remarks (optional)", h("textarea", { name: "remarks", rows: 2, maxlength: 300 })),
    formActions(() => close(), pendingLog ? "Save details" : "Record"));

  function fillVehicleOptions(student) {
    const previous = vehicleSelect.value;
    const vehicleOptions = Object.entries(student?.vehicles || {}).map(([id, v]) => [id, `${v.plate_number} · ${v.brand} ${v.model}`]);
    if (student) vehicleOptions.push([UNLISTED_VEHICLE, "Vehicle not registered…"]);
    vehicleSelect.replaceChildren(...options(vehicleOptions, student ? "Select vehicle…" : "Enter an ID first").flat(2).filter(Boolean));
    vehicleSelect.value = vehicleOptions.some(([id]) => id === previous) ? previous : "";
  }

  function sync() {
    Object.entries(kindButtons).forEach(([key, button]) => button.classList.toggle("on", key === kind));

    const studentId = studentInput.value.trim();
    if (studentId !== lastStudentId) {
      lastStudentId = studentId;
      fillVehicleOptions(students[studentId]);
    }
    const mode = deriveActivityMode({ kind, studentId, vehicleId: vehicleSelect.value }, students);

    setEnabled(personSection, !mode.isVisitor);
    if (!mode.isVisitor) {
      unregisteredNote.hidden = !mode.isUnregisteredPerson;
      setEnabled(vehicleField, !mode.isUnregisteredPerson);
      studentField.hintEl.textContent = mode.student?.name || "";
    }
    nameField.querySelector("span").textContent = mode.isVisitor ? "Visitor name" : "Full name";
    setEnabled(nameField, mode.needsTypedName);
    setEnabled(typedVehicle, mode.needsTypedVehicle);
    typeFields.sync(mode.needsTypedVehicle);
    plate.update();
    studentInput.setCustomValidity(studentId && !students[studentId] ? checkField("id", studentId) : "");
  }

  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  const close = openModal(pendingLog ? "Complete pending manual entry" : "Manual entry", form);
  sync();

  const blank = { studentId: "", vehicleId: "", visitorName: "", vehicleType: "", customType: "", plate: "", remarks: "", timestamp: "" };
  handleSubmit(form, (formValues) =>
    saveActivity({ values: { ...blank, ...formValues, kind }, students, pendingLog, recordedBy: session.user?.email || null }), close);
}

/* ---------------- Excel import ---------------- */

const MAX_VISIBLE_ISSUES = 8;

export function openImportModal() {
  let records = [];
  const fileInput = h("input", { type: "file", accept: ".xlsx,.xls" });
  const preview = h("div", {});
  const importButton = h("button", { class: "btn pri", disabled: true }, "Import 0 user(s)");

  function showPreview(fileName, valid, issues) {
    records = valid;
    importButton.disabled = !valid.length;
    importButton.textContent = `Import ${valid.length} user(s)`;
    mount(preview,
      fileName && h("p", { class: "mut" }, `${fileName} · ${valid.length} valid row(s) · ${issues.length} invalid row(s)`),
      issues.length > 0 && h("div", { class: "import-errors" },
        h("b", {}, "Rows needing correction"),
        issues.slice(0, MAX_VISIBLE_ISSUES).map(({ row, errors }) => h("div", {}, `Row ${row}: ${errors.join(", ")}`)),
        issues.length > MAX_VISIBLE_ISSUES && h("small", {}, `And ${issues.length - MAX_VISIBLE_ISSUES} more…`)),
      valid.length > 0 && h("p", { class: "note" }, `${valid.length} valid record(s) are ready. Existing IDs will be skipped during import.`));
  }

  fileInput.addEventListener("change", async () => {
    showPreview("", [], []);
    const file = fileInput.files[0];
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) return toast("Choose an Excel .xlsx or .xls file", "err");
    try {
      const { valid, issues } = await readUserWorkbook(file);
      showPreview(file.name, valid, issues);
    } catch (error) {
      showPreview(file.name, [], []);
      toast(error.message || "Could not read workbook", "err");
    }
  });

  const form = h("form", {},
    h("p", { class: "note" }, "Upload an Excel workbook (.xlsx or .xls). The first worksheet must have one user per row. Required columns: ",
      h("b", {}, "ID, Name, Course, Email, Phone, Emergency Name, Emergency Phone, Relationship"),
      ". Year level is 1–4 (optional for staff). Optional vehicle columns: Vehicle ID, Vehicle Type (car, motorcycle, bike, ebike or other), Brand, Model, Plate (optional for bikes), Color, Expiry. Each row can have one vehicle; Vehicle IDs and plates must be unique."),
    field("Excel file", fileInput), preview,
    h("div", { class: "mact" }, h("button", { type: "button", class: "btn", onclick: () => close() }, "Cancel"), importButton));
  const close = openModal("Import users from Excel", form);

  handleSubmit(form, () => {
    if (!records.length) throw new Error("There are no valid rows to import");
    return importUsers(records);
  }, close, "Importing…");
}

/* ---------------- offline log import ---------------- */

export function openOfflineImportModal({ students, existingIds }) {
  let records = [];
  const fileInput = h("input", { type: "file", accept: ".xlsx,.xls" });
  const preview = h("div", {});
  const importButton = h("button", { class: "btn pri", disabled: true }, "Import 0 log(s)");

  function showPreview(fileName, valid, issues) {
    const fresh = valid.filter((row) => !existingIds.has(row.key));
    const tally = { registered: 0, unmatched: 0, unidentified: 0 };
    fresh.forEach((row) => {
      const { match } = resolveOfflineLog(row, students);
      tally[match === "registered" ? "registered" : match === "unidentified" ? "unidentified" : "unmatched"] += 1;
    });
    records = valid;
    importButton.disabled = !fresh.length;
    importButton.textContent = `Import ${fresh.length} log(s)`;
    mount(preview,
      fileName && h("p", { class: "mut" }, `${fileName} · ${valid.length} valid row(s) · ${issues.length} invalid row(s)`),
      issues.length > 0 && h("div", { class: "import-errors" },
        h("b", {}, "Rows needing correction"),
        issues.slice(0, MAX_VISIBLE_ISSUES).map(({ row, errors }) => h("div", {}, `Row ${row}: ${errors.join(", ")}`)),
        issues.length > MAX_VISIBLE_ISSUES && h("small", {}, `And ${issues.length - MAX_VISIBLE_ISSUES} more…`)),
      valid.length > 0 && h("p", { class: "note" },
        `${fresh.length} new log(s) ready: ${tally.registered} matched to a registered vehicle, ${tally.unmatched} with a vehicle that isn’t registered to that user, ${tally.unidentified} with no registered user or vehicle found.`,
        valid.length > fresh.length && ` ${valid.length - fresh.length} already imported earlier will be skipped.`));
  }

  fileInput.addEventListener("change", async () => {
    showPreview("", [], []);
    const file = fileInput.files[0];
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) return toast("Choose an Excel .xlsx or .xls file", "err");
    try {
      const { valid, issues } = await readOfflineWorkbook(file);
      showPreview(file.name, valid, issues);
    } catch (error) {
      showPreview(file.name, [], []);
      toast(error.message || "Could not read workbook", "err");
    }
  });

  const form = h("form", {},
    h("p", { class: "note" }, "Upload the Excel file exported by the offline gate logger. Each row is saved as a manual entry with the remark ",
      h("b", {}, "Network Unavailable"), ", dated when it was recorded at the gate. Columns: ",
      h("b", {}, "Log ID, Timestamp, Direction, Card UID, User ID, Plate / Vehicle UID"),
      ". Importing the same file twice is safe: rows already imported are skipped."),
    field("Excel file", fileInput), preview,
    h("div", { class: "mact" }, h("button", { type: "button", class: "btn", onclick: () => close() }, "Cancel"), importButton));
  const close = openModal("Import offline logs", form);

  handleSubmit(form, () => {
    if (!records.length) throw new Error("There are no valid rows to import");
    return importOfflineLogs(records, session.user?.email || null);
  }, close, "Importing…");
}
