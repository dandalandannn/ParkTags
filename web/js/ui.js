
import { ERROR_TOAST_MS, HOME, NAV, PAGE_SIZES, TOAST_MS } from "./constants.js";
import { logout, session } from "./auth.js";
import { avatar } from "./photos.js";
import { formatDateTime, h, mount, vehicleTypeLabel } from "./utils.js";

/* ---------------- small pieces ---------------- */

export const badge = (text, tone = "") => h("span", { class: `badge ${tone}` }, text);
export function stat(label, value, { href, sub, go = "View list →" } = {}) {
  const content = [h("span", {}, label), h("b", {}, value), sub && h("small", { class: "sub" }, sub), href && h("small", { class: "go" }, go)];
  return href ? h("a", { class: "card stat link", href }, content) : h("div", { class: "card stat" }, content);
}
export const chips = (items) => h("div", { class: "chips" }, items.map(([label, value]) => h("span", {}, `${label} `, h("b", {}, value))));
export const skeleton = () => h("div", {}, [0, 1, 2, 3, 4].map(() => h("div", { class: "skel" })));
export function field(label, control, hint) {
  const hintEl = h("small", {}, hint || "");
  const node = h("label", { class: "field" }, h("span", {}, label), control, hintEl);
  node.hintEl = hintEl;
  return node;
}
export const options = (items, placeholder) => [
  placeholder !== undefined && h("option", { value: "" }, placeholder),
  items.map((item) => (Array.isArray(item) ? h("option", { value: item[0] }, item[1]) : h("option", { value: item }, item))),
];

/* ---------------- toast ---------------- */

export function toast(message, type = "ok") {
  const el = h("div", { class: `toast ${type}` }, message);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), type === "err" ? ERROR_TOAST_MS : TOAST_MS);
}

/* ---------------- modal / confirm ---------------- */

export function openModal(title, content) {
  const close = () => {
    removeEventListener("keydown", onKey);
    overlay.remove();
    document.body.style.overflow = "";
  };
  const onKey = (event) => event.key === "Escape" && close();
  const overlay = h("div", { class: "overlay", onmousedown: (e) => e.target === overlay && close() },
    h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "mhead" }, h("h3", {}, title), h("button", { class: "x", "aria-label": "Close", onclick: close }, "×")),
      h("div", { class: "mbody" }, content)));
  addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";
  document.body.append(overlay);
  return close;
}
export function confirmAction({ title, confirmLabel, message, run, success, failure }) {
  const close = openModal(title, [
    h("p", {}, message),
    h("div", { class: "mact" },
      h("button", { class: "btn", onclick: () => close() }, "Cancel"),
      h("button", {
        class: "btn danger",
        onclick: async () => {
          try {
            await run();
            toast(success);
            close();
          } catch {
            toast(failure, "err");
          }
        },
      }, confirmLabel)),
  ]);
}

function showFormError(form, message) {
  let box = form.querySelector(".form-error");
  if (!box) {
    box = h("div", { class: "form-error", role: "alert" });
    const anchor = form.querySelector(".mact") || form.querySelector("button.pri");
    anchor.parentNode.insertBefore(box, anchor);
  }
  box.textContent = message;
  box.hidden = false;
  box.scrollIntoView?.({ block: "nearest" });
}

export function handleSubmit(form, action, onDone, busyLabel = "Saving…") {
  form.addEventListener("input", () => { const box = form.querySelector(".form-error"); if (box) box.hidden = true; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button.pri");
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busyLabel;
    form.querySelector(".form-error")?.setAttribute("hidden", "");
    try {
      const message = await action(Object.fromEntries(new FormData(form)));
      if (message) toast(message);
      onDone();
    } catch (error) {
      const message = error.message || "Something went wrong. Please try again.";
      showFormError(form, message);
      toast(message, "err");
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
}

export const formActions = (onClose, label) =>
  h("div", { class: "mact" }, h("button", { type: "button", class: "btn", onclick: onClose }, "Cancel"), h("button", { class: "btn pri" }, label));

/* ---------------- table & pager ---------------- */
export function table(columns, rows, emptyText) {
  if (!rows.length) return h("div", { class: "empty" }, emptyText);
  return h("div", { class: "scroll" }, h("table", {},
    h("thead", {}, h("tr", {}, columns.map((c) => h("th", {}, c.header)))),
    h("tbody", {}, rows.map((row) => h("tr", {}, columns.map((c) => h("td", { "data-label": c.header }, c.render(row))))))));
}

export function createPager(onChange, initialSize = 25) {
  let size = initialSize, page = 1, pageCount = 1, total = 0;
  const node = h("div", { class: "pager" });
  const go = (target) => { page = target; onChange(); };

  const draw = () => mount(node,
    h("label", {}, "Show ", h("select", { class: "inp sm", value: size, onchange: (e) => { size = Number(e.target.value); go(1); } },
      PAGE_SIZES.map((n) => h("option", { value: n }, n || "All")))),
    h("span", {}, `${total} result${total === 1 ? "" : "s"}`),
    size > 0 && h("div", { class: "pn" },
      h("button", { class: "btn sm", disabled: page <= 1, onclick: () => go(page - 1) }, "‹ Prev"),
      h("span", {}, `${page} / ${pageCount}`),
      h("button", { class: "btn sm", disabled: page >= pageCount, onclick: () => go(page + 1) }, "Next ›")));

  return {
    node,
    slice(rows) {
      total = rows.length;
      pageCount = size ? Math.max(1, Math.ceil(total / size)) : 1;
      page = Math.min(page, pageCount);
      draw();
      return size ? rows.slice((page - 1) * size, page * size) : rows;
    },
  };
}

/* ---------------- filter bar ---------------- */

export function filterBar({ placeholder, fields, defaults, initial = {}, onChange }) {
  const state = { query: "", filters: { ...defaults, ...initial } };
  const controls = {};
  const search = h("input", { class: "inp wide", type: "search", placeholder, "aria-label": "Search", oninput: (e) => { state.query = e.target.value; onChange(); } });

  const fieldNodes = fields.map((f) => {
    const isDate = f.type === "date";
    const control = isDate
      ? h("input", { class: "inp", type: "date" })
      : h("select", { class: "inp" }, options(f.options || []));
    control.addEventListener(isDate ? "input" : "change", (e) => { state.filters[f.key] = e.target.value; onChange(); });
    control.value = state.filters[f.key];
    controls[f.key] = control;
    return field(f.label, control);
  });

  const reset = h("button", { class: "btn", onclick: () => {
    state.query = "";
    search.value = "";
    Object.assign(state.filters, defaults);
    Object.entries(controls).forEach(([key, control]) => (control.value = defaults[key]));
    onChange();
  } }, "Reset filters");

  return {
    node: h("div", { class: "filters" }, search, fieldNodes, reset),
    state,
    setOptions(key, items) {
      const control = controls[key];
      const current = control.value;
      control.replaceChildren(...[options(items)].flat(2).filter(Boolean));
      control.value = items.some((i) => (Array.isArray(i) ? i[0] : i) === current) ? current : defaults[key];
    },
  };
}

/* ---------------- page layout ---------------- */
export function layout(title, actions = []) {
  const home = HOME[session.role];
  const NAV_ALIAS = { "/parked-users": home, "/vehicles": home, "/parked-vehicles": home };
  const current = location.hash.slice(1).split("?")[0];
  const here = NAV_ALIAS[current] || current;
  const nav = (NAV[session.role] || []).map(([to, label]) =>
    h("a", { href: `#${to}`, class: here === to || here.startsWith(`${to}/`) ? "active" : "" }, label));

  const body = h("main", { class: "page" },
    h("div", { class: "phead" }, h("h1", {}, title), h("div", { class: "actions" }, actions)));

  const root = h("div", { "data-role": session.role },
    h("header", { class: "top" }, h("div", { class: "bar" },
      h("a", { href: `#${HOME[session.role]}`, class: "brand" }, h("img", { src: "assets/image.png", alt: "" }), h("b", {}, "STI ParkTags")),
      h("nav", {}, nav),
      h("button", { class: "btn sm out", onclick: logout }, "Log out"))),
    body);
  return { root, body };
}

/* ---------------- shared table columns ---------------- */

const RESULT_TONE = { Entry: "ok", Exit: "", Denied: "bad" };

export const activityColumns = [
  { header: "User ID", render: (r) => r.student_id || "N/A" },
  {
    header: "Name",
    render: (r) => h("span", { class: "who-cell" }, avatar(r.student_id, r.name, { hasPhoto: r.hasPhoto }),
      h("span", {}, r.name, r.unregistered && [" ", badge("Not registered", "warn")])),
  },
  { header: "Vehicle ID", render: (r) => r.card_uid || "N/A" },
  { header: "Type", render: (r) => r.vehicleType },
  { header: "Plate", render: (r) => r.plate },
  { header: "Time", render: (r) => r.time },
  {
    header: "Result",
    render: (r) => h("span", {}, badge(r.label, RESULT_TONE[r.label] || ""),
      r.needs_details && [" ", badge("Pending manual entry", "warn")],
      r.manual && [" ", badge("Manual", "mut")],
      r.incident && [" ", badge("⚠ Incident", "bad")]),
  },
];


export const withAddDetails = (columns, onAddDetails, onRemarks) => [
  ...columns,
  {
    header: "",
    render: (r) => r.needs_details
      ? h("button", { class: "btn sm pri", onclick: () => onAddDetails(r) }, "Add details")
      : r.incident && onRemarks ? h("button", { class: "btn sm", onclick: () => onRemarks(r) }, r.remarks ? "Edit remarks" : "Add remarks") : null,
  },
];

const KIND_LABEL = { student: "Student", staff: "Staff", visitor: "Visitor", pending: "Unidentified" };

export function identityCard(r, { onRemarks } = {}) {
  return h("div", { class: `ident${r.incident ? " flagged" : ""}` },
    avatar(r.student_id, r.name, { size: "xl", hasPhoto: r.hasPhoto }),
    h("div", { class: "ident-body" },
      h("h3", {}, r.name, badge(KIND_LABEL[r.kind] || "User")),
      h("p", { class: "mut" }, `${r.student_id || "No ID"} · ${r.vehicleType === "N/A" ? "Vehicle" : vehicleTypeLabel(r.vehicleType)} · ${r.plate}`),
      h("p", {}, badge(r.label, RESULT_TONE[r.label] || ""), ` ${r.time}`),
      r.incident && h("div", { class: "inc-note" },
        h("b", {}, "Incident report: "), r.incident.remarks,
        h("small", {}, `Reported ${formatDateTime(r.incident.created_at)}${r.incident.created_by ? ` by ${r.incident.created_by}` : ""}`)),
      r.remarks && h("p", { class: "note" }, h("b", {}, "Guard remarks: "), r.remarks),
      r.incident && onRemarks && h("button", { class: "btn sm pri", onclick: () => onRemarks(r) }, r.remarks ? "Edit remarks" : "Add remarks")));
}

export const userColumns = [
  {
    header: "Name",
    render: (u) => h("span", { class: "who-cell" }, avatar(u.id, u.name, { hasPhoto: u.has_photo }),
      h("a", { href: `#/users/${encodeURIComponent(u.id)}` }, u.name || "N/A")),
  },
  { header: "ID", render: (u) => u.id },
  { header: "Type", render: (u) => badge(u.kind === "staff" ? "Staff" : "Student") },
  { header: "Course / Dept", render: (u) => u.course || u.department || "N/A" },
  { header: "Year", render: (u) => (u.kind === "staff" ? "—" : u.year_level || "—") },
  { header: "Vehicles", render: (u) => (u.vehicleCount ? `${u.vehicleCount} vehicle${u.vehicleCount > 1 ? "s" : ""}` : "None") },
  { header: "Status", render: (u) => !u.vehicleCount ? badge("No vehicle", "mut") : badge(u.parked ? "Parked" : "Not parked", u.parked ? "ok" : "mut") },
  { header: "", render: (u) => h("a", { class: "btn sm", href: `#/users/${encodeURIComponent(u.id)}` }, "View") },
];

export const vehicleColumns = [
  { header: "Vehicle ID", render: (v) => v.vehicleId },
  { header: "Owner", render: (v) => (session.role === "admin" ? h("a", { href: `#/users/${encodeURIComponent(v.studentId)}` }, v.ownerName) : v.ownerName) },
  { header: "Type", render: (v) => vehicleTypeLabel(v.type) },
  { header: "Vehicle", render: (v) => `${v.brand || ""} ${v.model || ""}`.trim() || "N/A" },
  { header: "Plate", render: (v) => v.plate_number || "N/A" },
  { header: "Color", render: (v) => v.color || "N/A" },
  { header: "Expires", render: (v) => v.registration_expiry || "N/A" },
  { header: "Status", render: (v) => badge(v.parked ? "Parked" : "Not parked", v.parked ? "ok" : "mut") },
];
