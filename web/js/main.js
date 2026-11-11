import { watchAuth } from "./auth.js";
import { route } from "./router.js";

addEventListener("hashchange", route);
watchAuth(route);
route();
