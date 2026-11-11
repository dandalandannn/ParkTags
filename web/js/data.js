
import { db, onValue, ref } from "./firebase.js";
import { DB } from "./constants.js";
import { buildActivityRows, buildUserRows, toRows } from "./utils.js";

export const subscribe = (path, callback) =>
  onValue(ref(db, path), (snapshot) => callback(snapshot.val()), () => callback(null));

function subscribeMany(paths, callback) {
  const keys = Object.keys(paths);
  const values = {};
  const loaded = new Set();
  const unsubscribers = keys.map((key) =>
    subscribe(paths[key], (value) => {
      values[key] = value;
      loaded.add(key);
      if (loaded.size === keys.length) callback({ ...values });
    }));
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

const newestReported = (a, b) => (b.created_at || 0) - (a.created_at || 0);

export const subscribeActivities = (callback) =>
  subscribeMany({ logs: DB.accessLogs, students: DB.students, incidents: DB.incidents }, ({ logs, students, incidents }) => {
    const studentMap = students || {};
    const incidentRows = toRows(incidents).sort(newestReported);
    callback({ activities: buildActivityRows(logs, studentMap, incidentRows), students: studentMap, users: buildUserRows(studentMap), incidents: incidentRows });
  });

export const subscribeIncidents = (callback) =>
  subscribeMany({ incidents: DB.incidents, students: DB.students }, ({ incidents, students }) =>
    callback({ incidents: toRows(incidents).sort(newestReported), students: students || {} }));

export const subscribeSlotLimits = (callback) => subscribe(DB.slotLimits, callback);

export const subscribeUsers = (callback) =>
  subscribe(DB.students, (students) => {
    const studentMap = students || {};
    callback({ students: studentMap, users: buildUserRows(studentMap) });
  });

const newestFirst = (a, b) => (b.archived_at || "").localeCompare(a.archived_at || "");

export const subscribeArchive = (callback) =>
  subscribeMany(
    { users: DB.archivedStudents, vehicles: DB.archivedVehicles, cards: DB.archivedManualCards, accounts: DB.archivedRoles },
    ({ users, vehicles, cards, accounts }) =>
      callback({
        users: toRows(users).sort(newestFirst),
        cards: toRows(cards).sort(newestFirst),
        accounts: toRows(accounts).sort(newestFirst),
        vehicles: Object.entries(vehicles || {})
          .flatMap(([studentId, byVehicle]) =>
            Object.entries(byVehicle).map(([vehicleId, vehicle]) => ({ ...vehicle, id: `${studentId}/${vehicleId}`, studentId, vehicleId })))
          .sort(newestFirst),
      }),
  );
