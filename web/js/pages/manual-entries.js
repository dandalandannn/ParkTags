import { BREAKDOWN_ORDER, VEHICLE_LABELS } from "../constants.js";
import { subscribeActivities } from "../data.js";
import { ACTIVITY_COLUMNS, exportButton } from "../export.js";
import { openActivityModal, openOfflineImportModal } from "../modals.js";
import { activityColumns, chips, createPager, filterBar, layout, skeleton, table, withAddDetails } from "../ui.js";
import { defaultManualFilters, filterActivities, h, mount, today } from "../utils.js";

const FILTER_FIELDS = [
  { key: "kind", label: "User", type: "select", options: [["all", "All users"], ["student", "Students"], ["staff", "Staff"], ["visitor", "Visitors"]] },
  { key: "result", label: "Direction", type: "select", options: [["all", "Entries and exits"], ["ENTRANCE", "Entries only"], ["EXIT", "Exits only"]] },
  { key: "vehicle", label: "Vehicle", type: "select", options: [["all", "All vehicles"], ...BREAKDOWN_ORDER.map((key) => [key === "other" ? "Other" : key, VEHICLE_LABELS[key]])] },
  { key: "from", label: "From", type: "date" },
  { key: "to", label: "To", type: "date" },
];

export default function manualEntriesPage(app) {
  let data = null;
  let matching = [];
  const openEntry = (pendingLog = null) => data && openActivityModal({ students: data.students, pendingLog });

  const pendingColumns = withAddDetails([
    { header: "Time", render: (r) => r.time },
    { header: "Card", render: (r) => r.card_uid || "N/A" },
    { header: "Direction", render: (r) => r.label },
    { header: "Reader", render: (r) => r.reader || "N/A" },
  ], openEntry);

  const logColumns = [
    ...activityColumns,
    { header: "Recorded by", render: (r) => r.recorded_by || "—" },
    { header: "Remarks", render: (r) => r.remarks || "—" },
  ];

  const pendingTitle = h("h2", {}, "Pending manual entries");
  const pendingSlot = h("div", {}, skeleton());
  const filters = filterBar({ placeholder: "Search name, ID or plate…", fields: FILTER_FIELDS, defaults: defaultManualFilters, onChange: () => draw() });
  const pager = createPager(() => draw());
  const chipsSlot = h("div");
  const logSlot = h("div", {}, skeleton());

  const openOfflineImport = () => data && openOfflineImportModal({ students: data.students, existingIds: new Set(data.activities.map((r) => r.id)) });

  const { root, body } = layout("Manual entries", [
    exportButton(() => ({ filename: "parktags-manual-entries", sheet: "Manual entries", columns: ACTIVITY_COLUMNS, rows: matching })),
    h("button", { class: "btn", onclick: openOfflineImport }, "Import offline logs"),
    h("button", { class: "btn pri", onclick: () => openEntry() }, "+ Manual entry"),
  ]);
  body.append(
   h("section", { class: "card" }, h("h2", {}, "Manual entry log"), filters.node, chipsSlot, logSlot, pager.node),
    h("section", { class: "card" },
      pendingTitle,
      h("p", { class: "mut" }, "Gate card taps waiting for details. Add who came through to complete each entry."),
      pendingSlot));
  app.replaceChildren(root);

  function draw() {
    if (!data) return pager.slice([]);
    const pending = data.activities.filter((r) => r.needs_details);
    const completed = data.activities.filter((r) => r.manual && !r.needs_details);
    matching = filterActivities(completed, filters.state.query, filters.state.filters);

    pendingTitle.textContent = `Pending manual entries (${pending.length})`;
    mount(pendingSlot, table(pendingColumns, pending, "No pending manual entries."));
    mount(chipsSlot, chips([
      ["Total", completed.length],
      ["Today", completed.filter((r) => r.date === today()).length],
      ["Matching", matching.length],
    ]));
    mount(logSlot, table(logColumns, pager.slice(matching), "No manual entries match your filters."));
  }

  draw();
  return subscribeActivities((next) => { data = next; draw(); });
}
