import { HOME } from "./constants.js";
import { logout, session } from "./auth.js";
import { h, parseHash } from "./utils.js";
import accounts from "./pages/accounts.js";
import activities from "./pages/activities.js";
import archive from "./pages/archive.js";
import cards from "./pages/cards.js";
import dashboard from "./pages/dashboard.js";
import gate from "./pages/gate.js";
import incidents from "./pages/incidents.js";
import login from "./pages/login.js";
import manualEntries from "./pages/manual-entries.js";
import profile from "./pages/profile.js";
import users from "./pages/users.js";
import vehicles from "./pages/vehicles.js";

const ADMIN = ["admin"];
const STAFF = ["admin", "guard"];

const ROUTES = [
  { path: "/gate", roles: STAFF, page: gate },
  { path: "/activities", roles: STAFF, page: activities },
  { path: "/manual-entries", roles: STAFF, page: manualEntries },
  { path: "/incidents", roles: STAFF, page: incidents },
  { path: "/parked-vehicles", roles: STAFF, page: (app, params) => vehicles(app, params, { parkedOnly: true }) },
  { path: "/dashboard", roles: ADMIN, page: dashboard },
  { path: "/users", roles: ADMIN, page: users },
  { path: "/users/:id", roles: ADMIN, page: profile },
  { path: "/parked-users", roles: ADMIN, page: (app, params) => users(app, params, { parkedOnly: true }) },
  { path: "/vehicles", roles: ADMIN, page: (app, params) => vehicles(app, params, { parkedOnly: false }) },
  { path: "/cards", roles: ADMIN, page: cards },
  { path: "/accounts", roles: ADMIN, page: accounts },
  { path: "/archive", roles: ADMIN, page: archive },
];

function matchRoute(path) {
  for (const route of ROUTES) {
    const pattern = new RegExp(`^${route.path.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`);
    const match = path.match(pattern);
    if (match) return { route, params: Object.fromEntries(Object.entries(match.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)])) };
  }
  return null;
}

const redirect = (path) => { if (location.hash !== `#${path}`) location.hash = `#${path}`; };
const screen = (...children) => h("div", { class: "login" }, children);

let cleanup = null;

export function route() {
  cleanup?.();
  cleanup = null;
  const app = document.getElementById("app");
  const { path, query } = parseHash(location.hash);

  if (!session.ready) return app.replaceChildren(screen(h("div", { class: "skel", style: "width:240px" })));
  if (!session.user) return path === "/" ? login(app) : redirect("/");

  if (!HOME[session.role]) {
    return app.replaceChildren(screen(h("div", { class: "card" },
      h("h2", {}, "Access pending"),
      h("p", { class: "mut" }, `${session.user.email} can’t use the web app yet. Ask an administrator to assign a role.`),
      h("button", { class: "btn", onclick: logout }, "Log out"))));
  }

  const match = matchRoute(path);
  if (!match || !match.route.roles.includes(session.role)) return redirect(HOME[session.role]);
  cleanup = match.route.page(app, { ...match.params, query }) || null;
}
