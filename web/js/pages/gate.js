import { subscribeActivities, subscribeSlotLimits } from "../data.js";
import { incidentAlerts, isIncidentAlert, openRemarksModal } from "../incidents.js";
import { slotsCard } from "../slots.js";
import { activityColumns, identityCard, layout, skeleton, stat, table } from "../ui.js";
import { breakdownText, buildSlotRows, buildVehicleRows, countByBucket, h, mount, today } from "../utils.js";

const LATEST_LIMIT = 8;
export default function gatePage(app) {
  let data = null;
  let limits = null;

  const alertSlot = h("div");
  const incidentSlot = h("div");
  const statsSlot = h("div", { class: "stats" });
  const slotsSlot = h("div");
  const latestVehicleSlot = h("div");
  const latestSlot = h("div", {}, skeleton());

  const { root, body } = layout("Gate", [h("a", { class: "btn pri", href: "#/manual-entries" }, "Manual entries")]);
  body.append(
    alertSlot, incidentSlot, statsSlot, slotsSlot, latestVehicleSlot,
    h("section", { class: "card" }, h("h2", {}, "Latest activity ", h("a", { href: "#/activities" }, "See all →")), latestSlot));
  app.replaceChildren(root);

  function draw() {
    const loaded = !!data;
    const value = (n) => (loaded ? n : "…");
    const { activities = [], students = {} } = data || {};
    const pending = activities.filter((r) => r.needs_details).length;
    const parked = buildVehicleRows(students).filter((v) => v.parked);

    mount(alertSlot, pending > 0 && h("a", { class: "alert", href: "#/manual-entries" }, `⚠ ${pending} pending manual ${pending === 1 ? "entry" : "entries"} →`));
    mount(statsSlot,
      stat("Pending manual entries", value(pending), { href: "#/manual-entries", go: "Review entries →" }),
      stat("Vehicles parked", value(parked.length), { href: "#/parked-vehicles", sub: loaded ? breakdownText(countByBucket(parked)) : "" }),
      stat("Today’s activity", value(activities.filter((r) => r.date === today()).length), { href: "#/activities?range=today", go: "View today’s activity →" }));
    if (!loaded) return;
    mount(incidentSlot, incidentAlerts(activities));
    mount(slotsSlot, slotsCard(buildSlotRows(parked, limits)));
    const latest = activities.find((r) => r.granted && !r.needs_details);
    mount(latestVehicleSlot, latest && !isIncidentAlert(latest) && h("section", { class: "card" }, h("h2", {}, "Latest vehicle"), identityCard(latest, { onRemarks: openRemarksModal })));
    mount(latestSlot, table(activityColumns, activities.filter((r) => r.granted).slice(0, LATEST_LIMIT), "No activity yet."));
  }

  draw();
  const stops = [subscribeActivities((next) => { data = next; draw(); }), subscribeSlotLimits((value) => { limits = value; draw(); })];
  return () => stops.forEach((stop) => stop());
}
