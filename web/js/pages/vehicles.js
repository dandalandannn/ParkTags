import { BREAKDOWN_ORDER, HOME, VEHICLE_LABELS } from "../constants.js";
import { session } from "../auth.js";
import { subscribeUsers } from "../data.js";
import { chips, createPager, filterBar, layout, skeleton, stat, table, vehicleColumns } from "../ui.js";
import { buildVehicleRows, countByBucket, defaultVehicleFilters, filterVehicles, h, mount } from "../utils.js";

const TYPE_OPTIONS = [["all", "All types"], ...BREAKDOWN_ORDER.map((key) => [key, VEHICLE_LABELS[key]])];

export default function vehiclesPage(app, params = {}, { parkedOnly = false } = {}) {
  let vehicles = null;

  const fields = [
    { key: "type", label: "Type", type: "select", options: TYPE_OPTIONS },
    !parkedOnly && { key: "status", label: "Status", type: "select", options: [["all", "All"], ["parked", "Parked"], ["not parked", "Not parked"]] },
  ].filter(Boolean);

  const filters = filterBar({ placeholder: "Search vehicle ID, plate, owner or brand…", fields, defaults: defaultVehicleFilters, onChange: () => draw() });
  const pager = createPager(() => draw());
  const breakdownSlot = h("div", { class: "stats breakdown" });
  const chipsSlot = h("div");
  const tableSlot = h("div", {}, skeleton());

  const { root, body } = layout(parkedOnly ? "Parked vehicles" : "Registered vehicles", [h("a", { class: "btn", href: `#${HOME[session.role]}` }, session.role === "admin" ? "← Dashboard" : "← Gate")]);
  body.append(breakdownSlot, h("div", { class: "card" }, filters.node, chipsSlot, tableSlot, pager.node));
  app.replaceChildren(root);

  function draw() {
    if (!vehicles) return pager.slice([]);
    const counts = countByBucket(vehicles);
    mount(breakdownSlot,
      stat(parkedOnly ? "Total parked" : "Total registered", vehicles.length),
      BREAKDOWN_ORDER.map((key) => stat(VEHICLE_LABELS[key], counts[key])));

    const matching = filterVehicles(vehicles, filters.state.query, filters.state.filters);
    const pageRows = pager.slice(matching);
    mount(chipsSlot, chips([[parkedOnly ? "Parked" : "Total", vehicles.length], ["Matching", matching.length]]));
    mount(tableSlot, table(vehicleColumns, pageRows, parkedOnly && !vehicles.length ? "No vehicles are parked right now." : "No vehicles match your filters."));
  }

  draw();
  return subscribeUsers(({ students }) => {
    const all = buildVehicleRows(students);
    vehicles = parkedOnly ? all.filter((v) => v.parked) : all;
    draw();
  });
}
