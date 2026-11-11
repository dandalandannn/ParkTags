import { MAX_SLOT_LIMIT } from "./constants.js";
import { saveSlotLimits } from "./services.js";
import { badge, field, formActions, handleSubmit, openModal } from "./ui.js";
import { h } from "./utils.js";

function slotTile(row) {
  const unlimited = row.limit === null;
  const percent = unlimited || !row.limit ? 0 : Math.min(100, Math.round((row.parked / row.limit) * 100));
  const tone = unlimited ? "" : row.full ? " full" : percent >= 90 ? " warn" : "";
  return h("div", { class: `slot${tone}` },
    h("span", {}, row.label, row.full && [" ", badge("Full", "bad")]),
    h("b", {}, unlimited ? "No limit" : row.available),
    h("small", {}, unlimited ? `${row.parked} parked` : `available · ${row.parked} of ${row.limit} parked`),
    !unlimited && h("div", { class: "meter", role: "progressbar", "aria-label": `${row.label} slots in use`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent },
      h("i", { style: `width:${percent}%` })));
}

/** Parking capacity card for the Dashboard (editable) and the Gate page (read-only). */
export function slotsCard(rows, { onEdit } = {}) {
  const limited = rows.filter((r) => r.limit !== null);
  const available = limited.reduce((sum, r) => sum + r.available, 0);
  const total = limited.reduce((sum, r) => sum + r.limit, 0);
  return h("section", { class: "card" },
    h("h2", {}, "Parking slots", onEdit && h("button", { class: "btn sm", onclick: onEdit }, "Edit limits")),
    h("p", { class: "mut slots-sum" }, h("b", {}, available), ` of ${total} slots available. Counts use registered vehicles currently marked “parked”.`),
    h("div", { class: "slots" }, rows.map(slotTile)));
}

export function openSlotLimitsModal(rows) {
  const controls = rows.map((row) => {
    const isOther = row.key === "other";
    const control = h("input", {
      name: row.key, type: "number", min: 0, max: MAX_SLOT_LIMIT, step: 1, inputmode: "numeric",
      required: !isOther, value: row.limit ?? "", placeholder: isOther ? "No limit" : "",
    });
    return field(row.label, control, isOther ? "Leave blank for no limit." : "");
  });
  const form = h("form", {},
    h("p", { class: "note" }, "Set how many vehicles of each type the campus can hold. The Dashboard and Gate pages show how many slots are left."),
    controls, formActions(() => close(), "Save limits"));
  const close = openModal("Edit parking slot limits", form);
  handleSubmit(form, saveSlotLimits, close);
}

