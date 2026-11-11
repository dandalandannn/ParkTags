import { DB, MAX_VEHICLES_PER_USER } from "../constants.js";
import { subscribe } from "../data.js";
import { openEditProfileModal, openVehicleModal } from "../modals.js";
import { PHOTO_ACCEPT, avatar, removePhoto, resizeImage, savePhoto } from "../photos.js";
import { archiveUser, archiveVehicle } from "../services.js";
import { badge, confirmAction, layout, skeleton, toast } from "../ui.js";
import { h, isStaff, mount, vehicleTypeLabel, vehiclesOf } from "../utils.js";

const info = (label, value) => h("div", {}, h("b", {}, label), value || "N/A");

function sidebar(id, student, { onChangePhoto, onRemovePhoto }) {
  const vehicles = vehiclesOf(student);
  const parked = vehicles.filter((v) => v.current_status === "parked").length;
  return h("aside", { class: "card side" },
    avatar(id, student.name, { size: "xl", hasPhoto: student.has_photo }),
    h("div", { class: "mact center" },
      h("button", { class: "btn sm", onclick: onChangePhoto }, student.has_photo ? "Change photo" : "Add photo"),
      student.has_photo && h("button", { class: "btn sm", onclick: onRemovePhoto }, "Remove photo")),
    h("h2", {}, student.name || "N/A"),
    h("p", { class: "mut" }, id),
    badge(isStaff(id, student) ? "Staff" : "Student"),
    h("ul", {},
      h("li", {}, `${student.email || "N/A"}`),
      h("li", {}, `${student.contact_number || "N/A"}`),
      h("li", {}, `${student.course || student.department || "N/A"}`),
      student.year_level && h("li", {}, `Year ${student.year_level}`)),
    h("div", { class: "info" }, info("Vehicles", vehicles.length), info("Parked now", parked)));
}

function emergencyCard(contact) {
  return h("section", { class: "card" }, h("h2", {}, "Emergency contact"),
    contact
      ? h("div", { class: "info" }, info("Name", contact.name), info("Relationship", contact.relationship), info("Phone", contact.phone))
      : h("p", { class: "mut" }, "No emergency contact on file."));
}

function vehicleCard(vehicleId, vehicle, { onEdit, onRemove }) {
  const parked = vehicle.current_status === "parked";
  return h("div", { class: "veh" },
    h("div", { class: "vh" }, h("b", {}, vehicleId), badge(parked ? "Parked" : "Not parked", parked ? "ok" : "mut")),
    h("dl", {},
      h("dt", {}, "Type"), h("dd", {}, vehicle.type ? vehicleTypeLabel(vehicle.type) : "N/A"),
      h("dt", {}, "Vehicle"), h("dd", {}, `${vehicle.brand} ${vehicle.model}`),
      h("dt", {}, "Plate"), h("dd", {}, vehicle.plate_number || "N/A"),
      h("dt", {}, "Color"), h("dd", {}, vehicle.color || "N/A"),
      h("dt", {}, "Expires"), h("dd", {}, vehicle.registration_expiry || "N/A")),
    h("div", { class: "mact" },
      h("button", { class: "btn sm", onclick: onEdit }, "Edit"),
      h("button", { class: "btn sm danger", onclick: onRemove }, "Remove")));
}

export default function profilePage(app, { id }) {
  let student = null;

  const editButton = h("button", { class: "btn", hidden: true, onclick: () => openEditProfileModal(id, student) }, "Edit profile");
  const removeButton = h("button", { class: "btn danger", hidden: true, onclick: removeUser }, "Remove user");
  const content = h("div", {}, skeleton());
  const photoInput = h("input", { type: "file", accept: PHOTO_ACCEPT, hidden: true, onchange: async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      await savePhoto(id, await resizeImage(file));
      toast("Photo saved");
      draw(true); // the student record may not change when a photo is replaced, so redraw by hand
    } catch (error) {
      toast(error.message || "Could not save the photo", "err");
    }
  } });

  const { root, body } = layout("Profile", [editButton, removeButton]);
  body.append(content, photoInput);
  app.replaceChildren(root);

  function removeUser() {
    confirmAction({
      title: "Remove user",
      confirmLabel: "Remove user",
      message: ["Archive ", h("b", {}, student.name), ` (${id}) and their vehicles? The record will be removed from active users but kept in the Archive, where you can restore it.`],
      run: async () => { await archiveUser(id, student); location.hash = "#/users"; },
      success: "User archived",
      failure: "Something went wrong. Please try again.",
    });
  }

  function confirmRemovePhoto() {
    confirmAction({
      title: "Remove photo",
      confirmLabel: "Remove photo",
      message: ["Remove the photo of ", h("b", {}, student.name), "? Their initials will be shown instead."],
      run: async () => { await removePhoto(id); draw(true); },
      success: "Photo removed",
      failure: "Could not remove the photo. Please try again.",
    });
  }

  function removeVehicle(vehicleId) {
    confirmAction({
      title: "Remove vehicle",
      confirmLabel: "Remove vehicle",
      message: ["Archive vehicle ", h("b", {}, vehicleId), "? It will no longer appear as an active vehicle."],
      run: () => archiveVehicle(id, vehicleId, student.vehicles[vehicleId]),
      success: "Vehicle archived",
      failure: "Something went wrong. Please try again.",
    });
  }

  function draw(loaded) {
    editButton.hidden = removeButton.hidden = !student;
    if (!loaded) return;
    if (!student) {
      return mount(content, h("div", { class: "card empty" }, `No user with ID “${id}”. `, h("a", { href: "#/users" }, "Back to users")));
    }
    const vehicles = Object.entries(student.vehicles || {});
    mount(content,
      h("a", { href: "#/users", class: "back" }, "← All users"),
      h("div", { class: "prof" },
        sidebar(id, student, { onChangePhoto: () => photoInput.click(), onRemovePhoto: confirmRemovePhoto }),
        h("div", {},
          emergencyCard(student.emergency_contact),
          h("section", { class: "card" },
            h("h2", {}, `Vehicles (${vehicles.length}/${MAX_VEHICLES_PER_USER}) `,
              h("button", {
                class: "btn sm pri",
                disabled: vehicles.length >= MAX_VEHICLES_PER_USER,
                title: vehicles.length >= MAX_VEHICLES_PER_USER ? `A user can have at most ${MAX_VEHICLES_PER_USER} vehicles` : "",
                onclick: () => openVehicleModal({ studentId: id, vehicles: student.vehicles }),
              }, vehicles.length >= MAX_VEHICLES_PER_USER ? "Limit reached" : "+ Add vehicle")),
            !vehicles.length && h("p", { class: "empty" }, "No vehicles registered."),
            h("div", { class: "vgrid" }, vehicles.map(([vehicleId, vehicle]) => vehicleCard(vehicleId, vehicle, {
              onEdit: () => openVehicleModal({ studentId: id, vehicleId, vehicles: student.vehicles }),
              onRemove: () => removeVehicle(vehicleId),
            })))),
          h("section", { class: "card" }, h("h2", {}, "Account"),
            h("div", { class: "info" }, info("Registered", student.date_registered), info("Last updated", student.last_updated))))));
  }

  return subscribe(`${DB.students}/${id}`, (value) => { student = value; draw(true); });
}
