import { session } from "./auth.js";
import { INCIDENT_ALERT_MS, MAX_INCIDENT_TEXT, MAX_REMARKS, UNLISTED_VEHICLE } from "./constants.js";
import { reportIncident, saveLogRemarks } from "./services.js";
import { field, formActions, handleSubmit, identityCard, openModal, options } from "./ui.js";
import { checkField, h } from "./utils.js";

const MAX_ALERTS = 5;

export const isIncidentAlert = (row) => !!row.incident && (row.timestamp ?? 0) >= Date.now() - INCIDENT_ALERT_MS;

export function incidentAlerts(activities, onRemarks = openRemarksModal) {
  const flagged = activities.filter(isIncidentAlert);
  if (!flagged.length) return null;
  return h("section", { class: "card incident" },
    h("h2", {}, `⚠ Vehicle${flagged.length === 1 ? "" : "s"} with an open incident report entering campus`, h("a", { href: "#/incidents" }, "All incidents →")),
    h("div", { class: "ident-list" }, flagged.slice(0, MAX_ALERTS).map((r) => identityCard(r, { onRemarks }))),
    flagged.length > MAX_ALERTS && h("p", { class: "mut" }, `And ${flagged.length - MAX_ALERTS} more in Activity.`));
}

export function openRemarksModal(row) {
  const form = h("form", {},
    h("p", { class: "note" }, h("b", {}, row.name), ` · ${row.plate} · ${row.label} · ${row.time}`,
      row.incident && [h("br"), h("b", {}, "Incident report: "), row.incident.remarks]),
    field("Remarks", h("textarea", { name: "remarks", rows: 4, maxlength: MAX_REMARKS, required: true, value: row.remarks || "" }),
      `Saved on this entry in the activity log (up to ${MAX_REMARKS} characters).`),
    formActions(() => close(), "Save remarks"));
  const close = openModal("Add remarks", form);
  handleSubmit(form, ({ remarks }) => saveLogRemarks(row.id, remarks, session.user?.email || null), close);
}


export function openIncidentModal({ students }) {
  let lastId = null;
  const idInput = h("input", { name: "studentId", list: "incident-ids", maxlength: 20, autocomplete: "off" });
  const idField = field("Student / Staff ID (optional)", idInput);
  const idList = h("datalist", { id: "incident-ids" }, Object.entries(students).map(([id, s]) => h("option", { value: id }, s.name)));
  const vehicleSelect = h("select", { name: "vehicleId", required: true });
  const vehicleField = field("Vehicle", vehicleSelect);
  const plateInput = h("input", { name: "plate", maxlength: 10, autocomplete: "off" });
  const plateField = field("Plate number", plateInput, "2–10 letters or numbers.");
  const text = h("textarea", { name: "remarks", rows: 4, maxlength: MAX_INCIDENT_TEXT, required: true });

  const form = h("form", {},
    h("p", { class: "note" }, "While a report is open, this vehicle is flagged for the guard each time it is logged entering the campus."),
    idField, idList, vehicleField, plateField,
    field("What happened", text, `Up to ${MAX_INCIDENT_TEXT} characters.`),
    formActions(() => close(), "Report incident"));

  function fillVehicles(student) {
    const items = Object.entries(student?.vehicles || {}).map(([id, v]) => [id, `${v.plate_number || "No plate"} · ${v.brand} ${v.model}`]);
    items.push([UNLISTED_VEHICLE, "Another vehicle (enter plate)…"]);
    vehicleSelect.replaceChildren(...options(items, "Select vehicle…").flat(2).filter(Boolean));
  }

  function sync() {
    const id = idInput.value.trim();
    const student = students[id];
    if (id !== lastId) { lastId = id; if (student) fillVehicles(student); }
    const showVehicle = !!student;
    vehicleField.hidden = !showVehicle;
    vehicleSelect.disabled = !showVehicle;
    const needsPlate = !student || vehicleSelect.value === UNLISTED_VEHICLE;
    plateField.hidden = !needsPlate;
    plateInput.disabled = !needsPlate;
    plateInput.required = needsPlate;
    plateInput.setCustomValidity(needsPlate ? checkField("plate", plateInput.value) : "");
    idField.hintEl.textContent = student ? student.name : id ? "" : "Leave blank to report an unregistered vehicle by plate.";
    idInput.setCustomValidity(id && !student ? "No registered user has that ID. Clear it to report by plate only." : "");
  }

  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  const close = openModal("Report an incident", form);
  sync();
  handleSubmit(form, (values) =>
    reportIncident({ values: { studentId: "", vehicleId: "", plate: "", ...values }, students, reportedBy: session.user?.email || null }), close);
}
