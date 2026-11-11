import { signIn } from "../auth.js";
import { field } from "../ui.js";
import { h } from "../utils.js";

export default function loginPage(app) {
  const email = h("input", { type: "email", required: true, autocomplete: "username" });
  const password = h("input", { type: "password", required: true, autocomplete: "current-password" });
  const error = h("p", { class: "err", role: "alert" });
  const button = h("button", { class: "btn pri wide" }, "Sign in");

  const form = h("form", { class: "card", onsubmit: async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "Signing in…";
    error.textContent = "";
    try {
      await signIn(email.value, password.value); 
    } catch {
      error.textContent = "Incorrect email or password.";
      button.disabled = false;
      button.textContent = "Sign in";
    }
  } },
    h("img", { src: "assets/image.png", alt: "STI", width: 96 }),
    h("h2", {}, "Sign in to STI ParkTags"),
    field("Email", email), field("Password", password), error, button);

  app.replaceChildren(h("div", { class: "login" }, form));
}
