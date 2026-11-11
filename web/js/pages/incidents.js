import { subscribeIncidents } from "../data.js";
import { session } from "../auth.js";
import { openIncidentModal } from "../incidents.js";
import { resolveIncident } from "../services.js";
import { badge, chips, createPager, filterBar, layout, skeleton, table, toast } from "../ui.js";
import { defaultIncidentFilters, filterIncidents, formatDateTime, h, mount } from "../utils.js";

const FILTER_FIELDS = [
  { key: "status", label: "Status", type: "select", options: [["open", "Open"], ["resolved", "Resolved"], ["all", "All"]] },
];

function resolveButton(incident) {
  const button = h("button", { class: "btn sm", onclick: async () => {
    button.disabled = true;
    try {
      toast(await resolveIncident(incident.id, session.user?.email || null));
    } catch {
      button.disabled = false;
      toast("Could not update the report. Please try again.", "err");
    }
  } }, "Mark resolved");
  return button;
}

const columns = [
  { header: "Reported", render: (i) => formatDateTime(i.created_at) },
  { header: "Owner", render: (i) => (i.student_id ? `${i.owner_name || "N/A"} (${i.student_id})` : "Unregistered vehicle") },
  { header: "Vehicle", render: (i) => [i.vehicle_id, i.vehicle_label].filter(Boolean).join(" · ") || "—" },
  { header: "Plate", render: (i) => i.plate || "—" },
  { header: "Incident", render: (i) => i.remarks },
  { header: "Reported by", render: (i) => i.created_by || "—" },
  {
    header: "Status",
    render: (i) => (i.status === "open"
      ? badge("Open", "bad")
      : h("span", {}, badge("Resolved", "ok"), h("small", { class: "mut" }, ` ${formatDateTime(i.resolved_at)}`))),
  },
  { header: "", render: (i) => (i.status === "open" ? resolveButton(i) : null) },
];

export default function incidentsPage(app) {
  let data = null;

  const filters = filterBar({ placeholder: "Search name, ID, plate or details…", fields: FILTER_FIELDS, defaults: defaultIncidentFilters, onChange: () => draw() });
  const pager = createPager(() => draw());
  const chipsSlot = h("div");
  const tableSlot = h("div", {}, skeleton());

  const { root, body } = layout("Incident reports", [
    h("button", { class: "btn pri", onclick: () => data && openIncidentModal({ students: data.students }) }, "+ Report incident"),
  ]);
  body.append(
    h("p", { class: "mut" }, "While a report is ", h("b", {}, "open"), ", the vehicle is flagged for the guard each time it is logged entering the campus, and the guard can add remarks to that entry. Mark the report resolved when it no longer applies."),
    h("div", { class: "card" }, filters.node, chipsSlot, tableSlot, pager.node));
  app.replaceChildren(root);

  function draw() {
    if (!data) return pager.slice([]);
    const { incidents } = data;
    const matching = filterIncidents(incidents, filters.state.query, filters.state.filters);
    const pageRows = pager.slice(matching);
    mount(chipsSlot, chips([
      ["Open", incidents.filter((i) => i.status === "open").length],
      ["Resolved", incidents.filter((i) => i.status === "resolved").length],
      ["Matching", matching.length],
    ]));
    mount(tableSlot, table(columns, pageRows, "No incident reports match your filters."));
  }

  draw();
  return subscribeIncidents((next) => { data = next; draw(); });
}
