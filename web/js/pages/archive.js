import { subscribeArchive } from "../data.js";
import { ARCHIVE_COLUMNS, exportButton } from "../export.js";
import { avatar } from "../photos.js";
import { restoreAccount, restoreGateCard, restoreUser, restoreVehicle } from "../services.js";
import { badge, chips, filterBar, layout, skeleton, table, toast } from "../ui.js";
import { h, inRange, isStaff, matchesText, mount, vehicleTypeLabel, vehiclesOf } from "../utils.js";

function restoreButton(action, successMessage) {
  const button = h("button", { class: "btn sm pri", onclick: async () => {
    button.disabled = true;
    button.textContent = "Restoring…";
    try {
      await action();
      toast(successMessage);
    } catch (error) {
      toast(error.message || "Could not restore this record", "err");
      button.disabled = false;
      button.textContent = "Restore";
    }
  } }, "Restore");
  return button;
}

const archivedOn = { header: "Archived on", render: (r) => r.archived_at || "—" };

const TABS = [
  {
    key: "users", label: "Users", empty: "No archived users.",
    columns: [
      { header: "Name", render: (u) => h("span", { class: "who-cell" }, avatar(u.id, u.name, { hasPhoto: u.has_photo }), u.name || "N/A") },
      { header: "ID", render: (u) => u.id },
      { header: "Type", render: (u) => badge(isStaff(u.id, u) ? "Staff" : "Student") },
      { header: "Course / Dept", render: (u) => u.course || u.department || "N/A" },
      { header: "Vehicles", render: (u) => vehiclesOf(u).length },
      archivedOn,
      { header: "", render: ({ id, ...record }) => restoreButton(() => restoreUser(id, record), `Restored ${record.name || id}`) },
    ],
  },
  {
    key: "vehicles", label: "Vehicles", empty: "No archived vehicles.",
    columns: [
      { header: "Vehicle ID", render: (v) => v.vehicleId },
      { header: "Owner", render: (v) => h("a", { href: `#/users/${encodeURIComponent(v.studentId)}` }, v.studentId) },
      { header: "Type", render: (v) => (v.type ? vehicleTypeLabel(v.type) : "N/A") },
      { header: "Vehicle", render: (v) => `${v.brand} ${v.model}`.trim() || "N/A" },
      { header: "Plate", render: (v) => v.plate_number || "N/A" },
      archivedOn,
      { header: "", render: ({ id, studentId, vehicleId, ...record }) => restoreButton(() => restoreVehicle(studentId, vehicleId, record), `Restored vehicle ${vehicleId}`) },
    ],
  },
  {
    key: "cards", label: "Gate cards", empty: "No archived gate cards.",
    columns: [
      { header: "Card UID", render: (c) => c.id },
      { header: "Label", render: (c) => c.label || "—" },
      { header: "Added", render: (c) => c.created || "—" },
      archivedOn,
      { header: "", render: ({ id, ...record }) => restoreButton(() => restoreGateCard(id, record), `Restored card ${id}`) },
    ],
  },
  {
    key: "accounts", label: "Accounts", empty: "No archived accounts.",
    columns: [
      { header: "Email", render: (a) => a.email },
      { header: "Role", render: (a) => a.role },
      archivedOn,
      { header: "", render: ({ id, ...record }) => restoreButton(() => restoreAccount(id, record), `Restored access for ${record.email}`) },
    ],
  },
];

const FILTER_FIELDS = [
  { key: "from", label: "Archived from", type: "date" },
  { key: "to", label: "To", type: "date" },
];

export default function archivePage(app) {
  let archive = null;
  let activeTab = "users";
  let matching = [];

  const tabsSlot = h("div", { class: "seg", role: "tablist" });
  const chipsSlot = h("div");
  const tableSlot = h("div", {}, skeleton());
  const filters = filterBar({ placeholder: "Search the selected tab…", fields: FILTER_FIELDS, defaults: { from: "", to: "" }, onChange: () => draw() });

  const exporter = exportButton(() => {
    const tab = TABS.find((t) => t.key === activeTab);
    return { filename: `parktags-archive-${tab.key}`, sheet: `Archived ${tab.label}`.slice(0, 31), columns: ARCHIVE_COLUMNS[tab.key], rows: matching };
  });
  const { root, body } = layout("Archive", [exporter]);
  body.append(
    h("p", { class: "mut" }, "Removed records are kept here. Restoring a user brings back their vehicles as ", h("b", {}, "Not parked"),
      "; a vehicle can only be restored while its owner is an active user."),
    h("div", { class: "card" }, tabsSlot, filters.node, chipsSlot, tableSlot));
  app.replaceChildren(root);

  function draw() {
    mount(tabsSlot, TABS.map((tab) =>
      h("button", { role: "tab", "aria-selected": String(tab.key === activeTab), class: `btn${tab.key === activeTab ? " on" : ""}`, onclick: () => { activeTab = tab.key; draw(); } },
        `${tab.label} (${archive ? archive[tab.key].length : "…"})`)));
    if (!archive) return;
    const tab = TABS.find((t) => t.key === activeTab);
    const { query, filters: f } = filters.state;
    // The search looks at every column that is exported, so what you search is what you get in the file.
    matching = archive[tab.key].filter((record) =>
      matchesText(query, [ARCHIVE_COLUMNS[tab.key].map((c) => c.value(record)).join(" ")]) && inRange(record.archived_at || "", f.from, f.to));
    mount(chipsSlot, chips([["In this tab", archive[tab.key].length], ["Matching", matching.length]]));
    mount(tableSlot, table(tab.columns, matching, archive[tab.key].length ? "No archived records match your filters." : tab.empty));
  }

  draw();
  return subscribeArchive((next) => { archive = next; draw(); });
}
