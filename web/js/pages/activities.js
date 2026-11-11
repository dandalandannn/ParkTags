import { subscribeActivities } from "../data.js";
import { ACTIVITY_COLUMNS, exportButton } from "../export.js";
import { openRemarksModal } from "../incidents.js";
import { openActivityModal } from "../modals.js";
import { activityColumns, chips, createPager, filterBar, layout, skeleton, table, withAddDetails } from "../ui.js";
import { defaultActivityFilters, filterActivities, h, mount, today } from "../utils.js";

const FILTER_FIELDS = [
  { key: "kind", label: "User", type: "select", options: [["all", "All users"], ["student", "Students"], ["staff", "Staff"], ["visitor", "Visitors"]] },
  { key: "result", label: "Result", type: "select", options: [["granted", "Entries and exits"], ["ENTRANCE", "Entries only"], ["EXIT", "Exits only"], ["PENDING", "Pending manual entries"], ["DENIED", "Denied only"], ["all", "Everything"]] },
  { key: "source", label: "Source", type: "select", options: [["all", "All sources"], ["manual", "Manual entries"], ["scan", "Gate scans"]] },
  { key: "vehicle", label: "Vehicle", type: "select", options: [["all", "All vehicles"], ["car", "Car"], ["motorcycle", "Motorcycle"], ["bike", "Bike"], ["ebike", "E-bike"], ["Other", "Other"]] },
  { key: "from", label: "From", type: "date" },
  { key: "to", label: "To", type: "date" },
];

export default function activitiesPage(app, params = {}) {
  let data = null;
  let matching = [];
  const isToday = params.query?.range === "today";
  const initial = isToday ? { result: "all", from: today(), to: today() } : {};
  const openEntry = (pendingLog = null) => data && openActivityModal({ students: data.students, pendingLog });

  const columns = withAddDetails([
    ...activityColumns,
    { header: "Reader", render: (r) => r.reader || "N/A" },
    { header: "Remarks", render: (r) => r.remarks || "—" },
  ], openEntry, openRemarksModal);

  const filters = filterBar({ placeholder: "Search name, ID or plate…", fields: FILTER_FIELDS, defaults: defaultActivityFilters, initial, onChange: () => draw() });
  const pager = createPager(() => draw());
  const chipsSlot = h("div");
  const tableSlot = h("div", {}, skeleton());

  const { root, body } = layout(isToday ? "Today’s activity" : "Parking activity", [
    exportButton(() => ({ filename: "parktags-activity", sheet: "Parking activity", columns: ACTIVITY_COLUMNS, rows: matching })),
    h("button", { class: "btn pri", onclick: () => openEntry() }, "+ Manual entry"),
  ]);
  body.append(h("div", { class: "card" }, filters.node, chipsSlot, tableSlot, pager.node));
  app.replaceChildren(root);

  function draw() {
    if (!data) return pager.slice([]);
    const { activities } = data;
    matching = filterActivities(activities, filters.state.query, filters.state.filters);
    const pageRows = pager.slice(matching);
    mount(chipsSlot, chips([
      ["Total", activities.length],
      ["Today", activities.filter((r) => r.date === today()).length],
      ["Manual", activities.filter((r) => r.manual).length],
      ["Matching", matching.length],
    ]));
    mount(tableSlot, table(columns, pageRows, "No activity matches your filters."));
  }

  draw();
  return subscribeActivities((next) => { data = next; draw(); });
}
