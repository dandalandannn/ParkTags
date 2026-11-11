import { db, get, ref, update } from "./firebase.js";
import { DB } from "./constants.js";
import { h, initialsOf } from "./utils.js";


const OUTPUT_SIZE = 256;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 60000; // database.rules.json allows up to 70000
const ACCEPTED_TYPES = /^image\/(jpeg|png|webp)$/;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const PICKER_HINT = "JPG, PNG or WebP. It is cropped to a square and shrunk automatically.";

const loaded = new Map();  // id -> data URL, or null when there is no photo
const inFlight = new Map();

export function loadPhoto(id) {
  if (loaded.has(id)) return Promise.resolve(loaded.get(id));
  if (!inFlight.has(id)) {
    let request;
    try {
      request = get(ref(db, `${DB.photos}/${id}`)).then((snapshot) => {
        const value = snapshot.val() || null;
        loaded.set(id, value);
        return value;
      });
    } catch {
      return Promise.resolve(null); // an ID that can't be a database key has no photo
    }
    inFlight.set(id, request.catch(() => null).finally(() => inFlight.delete(id)));
  }
  return inFlight.get(id);
}

export function avatar(id, name, { size = "sm", hasPhoto = false } = {}) {
  const node = h("span", { class: `pic ${size}`, role: "img", "aria-label": name || "User" }, initialsOf(name));
  if (!hasPhoto || !id) return node;
  const show = (src) => src && node.replaceChildren(h("img", { src, alt: "" }));
  if (loaded.has(id)) show(loaded.get(id));
  else loadPhoto(id).then(show);
  return node;
}


export async function resizeImage(file) {
  if (!ACCEPTED_TYPES.test(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > MAX_FILE_BYTES) throw new Error("That image is larger than 10 MB. Choose a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image could not be read. Try a different file."));
      el.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("That image could not be read. Try a different file.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    
    const sx = (image.naturalWidth - side) / 2;
    const sy = (image.naturalHeight - side) * 0.2;
    context.drawImage(image, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    for (let quality = 0.85; quality >= 0.4; quality -= 0.15) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= MAX_DATA_URL_LENGTH) return data;
    }
    throw new Error("That image is too detailed to store. Try a different photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function savePhoto(id, dataUrl) {
  await update(ref(db), { [`${DB.photos}/${id}`]: dataUrl, [`${DB.students}/${id}/has_photo`]: true });
  loaded.set(id, dataUrl);
}

export async function removePhoto(id) {
  await update(ref(db), { [`${DB.photos}/${id}`]: null, [`${DB.students}/${id}/has_photo`]: null });
  loaded.set(id, null);
}


export function photoPicker() {
  let data = null;
  const preview = h("span", { class: "pic md", "aria-hidden": "true" }, "?");
  const hint = h("small", {}, PICKER_HINT);
  const input = h("input", { type: "file", accept: PHOTO_ACCEPT });
  input.addEventListener("change", async () => {
    data = null;
    preview.replaceChildren("?");
    hint.textContent = PICKER_HINT;
    hint.classList.remove("err");
    const file = input.files[0];
    if (!file) return;
    try {
      data = await resizeImage(file);
      preview.replaceChildren(h("img", { src: data, alt: "" }));
    } catch (error) {
      input.value = "";
      hint.textContent = error.message;
      hint.classList.add("err");
    }
  });
  const node = h("label", { class: "field" }, h("span", {}, "Photo (optional)"), h("div", { class: "photo-row" }, preview, input), hint);
  return { node, value: () => data };
}
