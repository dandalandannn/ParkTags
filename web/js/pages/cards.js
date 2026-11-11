import { DB } from "../constants.js";
import { session } from "../auth.js";
import { subscribe } from "../data.js";
import { archiveGateCard, registerGateCard } from "../services.js";
import { confirmAction, field, handleSubmit, layout, skeleton, table } from "../ui.js";
import { h, mount, toRows } from "../utils.js";

export default function cardsPage(app) {
  let cards = null;

  const tableSlot = h("div", {}, skeleton());
  const columns = [
    { header: "Card UID", render: (c) => c.id },
    { header: "Label", render: (c) => c.label || "—" },
    { header: "Added", render: (c) => c.created || "—" },
    { header: "", render: (c) => h("button", { class: "btn sm danger", onclick: () => confirmRemoval(c) }, "Remove") },
  ];

  const submitButton = h("button", { class: "btn pri" }, "Register card");
  const form = h("form", { class: "card" },
    h("div", { class: "row2" },
      field("Card UID", h("input", { name: "uid", required: true, autocomplete: "off" }), "Same format the reader sends (stored in uppercase)"),
      field("Label (optional)", h("input", { name: "label", placeholder: "e.g. Manual card 1" }))),
    submitButton);
  handleSubmit(form, (values) => registerGateCard({ uid: values.uid, label: values.label, createdBy: session.user?.email || "", existingCards: cards }), () => form.reset());

  function confirmRemoval(card) {
    confirmAction({
      title: "Remove gate card",
      confirmLabel: "Remove",
      message: ["Archive ", h("b", {}, card.id), "? It will no longer open the gate automatically, but its record is kept in the Archive."],
      run: () => archiveGateCard(card),
      success: "Card archived",
      failure: "Could not archive card",
    });
  }

  const { root, body } = layout("Gate cards");
  body.append(
    h("p", { class: "mut" }, "A registered card opens the gate with no registration, expiry or parked-status checks. Each tap is logged and flagged ", h("b", {}, "pending manual entry"), " so the guard can add who entered."),
    form, h("div", { class: "card" }, tableSlot));
  app.replaceChildren(root);

  return subscribe(DB.manualCards, (value) => {
    cards = value;
    mount(tableSlot, table(columns, toRows(value), "No gate cards registered yet."));
  });
}
