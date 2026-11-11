import { DB } from "../constants.js";
import { session } from "../auth.js";
import { subscribe } from "../data.js";
import { archiveAccount, changeAccountRole, createAccount } from "../services.js";
import { badge, confirmAction, field, handleSubmit, layout, options, skeleton, table, toast } from "../ui.js";
import { h, mount, toRows } from "../utils.js";

export default function accountsPage(app) {
  const myUid = session.user?.uid;
  const tableSlot = h("div", {}, skeleton());

  const roleCell = (account) => {
    if (account.role === "device") return badge("Device", "mut");
    return h("select", {
      class: "inp sm", "aria-label": "Role", value: account.role, disabled: account.id === myUid,
      onchange: (e) => changeAccountRole(account.id, e.target.value).then(() => toast("Role updated")).catch(() => toast("Could not change role", "err")),
    }, options([["admin", "Admin"], ["guard", "Guard"]]));
  };

  const columns = [
    { header: "Email", render: (a) => a.email + (a.id === myUid ? " (you)" : "") },
    { header: "Role", render: roleCell },
    { header: "", render: (a) => a.id !== myUid && h("button", { class: "btn sm danger", onclick: () => confirmRevoke(a) }, "Remove access") },
  ];

  function confirmRevoke(account) {
    confirmAction({
      title: "Revoke access",
      confirmLabel: "Revoke",
      message: ["Archive ", h("b", {}, account.email), " and revoke its ParkTags access. The Firebase sign-in account itself is not deleted."],
      run: () => archiveAccount(account),
      success: "Access removed and account archived",
      failure: "Could not remove access",
    });
  }

  const form = h("form", { class: "card" },
    h("h2", {}, "Create account"),
    h("div", { class: "row2" },
      field("Email", h("input", { type: "email", name: "email", required: true, autocomplete: "off" })),
      field("Temporary password", h("input", { type: "password", name: "password", minlength: 6, required: true, autocomplete: "new-password" }))),
    field("Role", h("select", { name: "role" }, options([["guard", "Guard — gate and manual entries only"], ["admin", "Admin — full access"]]))),
    h("button", { class: "btn pri" }, "Create account"));
  handleSubmit(form, createAccount, () => form.reset(), "Creating…");

  const { root, body } = layout("Accounts");
  body.append(form, h("div", { class: "card" }, tableSlot));
  app.replaceChildren(root);

  return subscribe(DB.roles, (roles) => mount(tableSlot, table(columns, toRows(roles), "No accounts yet.")));
}
