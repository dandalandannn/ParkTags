export const DB = {
  students: "students",
  accessLogs: "access_logs",
  roles: "roles",
  manualCards: "settings/manual_cards",
  archivedStudents: "archived_students",
  archivedVehicles: "archived_vehicles",
  archivedManualCards: "settings/archived_manual_cards",
  archivedRoles: "archived_roles",
  incidents: "incident_reports",
  photos: "student_photos",
  slotLimits: "settings/slot_limits",
};

export const VEHICLE_TYPES = ["car", "motorcycle", "bike", "ebike"];
export const VEHICLE_LABELS = { car: "Car", motorcycle: "Motorcycle", bike: "Bike", ebike: "E-bike", other: "Others" };

export const PLATE_OPTIONAL_TYPES = ["bike", "ebike"];
export const MAX_VEHICLES_PER_USER = 3;

export const BREAKDOWN_ORDER = ["motorcycle", "car", "bike", "ebike", "other"];
export const OTHER_TYPE = "Other";
export const NOT_PARKED = "not parked";
export const UNLISTED_VEHICLE = "__other";
export const RELATIONSHIPS = ["Parent", "Guardian", "Sibling", "Spouse", "Child", "Relative", "Friend", "Other"];
export const STAFF_PREFIX = "E";
export const PAGE_SIZES = [10, 25, 50, 100, 0]; // 0 = show all
export const YEAR_MIN = 1;
export const YEAR_MAX = 4;
export const TOAST_MS = 3500;
export const ERROR_TOAST_MS = 7000;

/** Parking capacity. "other" covers anything that is not a car, motorcycle, bike or e-bike (e.g. trikes). */
export const SLOT_TYPES = ["car", "motorcycle", "bike", "ebike", "other"];
export const SLOT_LABELS = { car: "Car", motorcycle: "Motorcycle", bike: "Bike", ebike: "E-bike", other: "Other (trikes, etc.)" };
export const DEFAULT_SLOT_LIMITS = { car: 10, motorcycle: 300, bike: 100, ebike: 300 }; // "other" has no limit until one is set
export const MAX_SLOT_LIMIT = 100000;

export const MAX_REMARKS = 300;
export const MAX_INCIDENT_TEXT = 500;
/** How long after an entry the guard still sees its incident warning on the Gate / Dashboard pages. */
export const INCIDENT_ALERT_MS = 2 * 60 * 60 * 1000;

export const HOME = { admin: "/dashboard", guard: "/gate" };
export const NAV = {
  admin: [["/dashboard", "Dashboard"], ["/activities", "Activity"], ["/manual-entries", "Manual entries"], ["/incidents", "Incidents"], ["/users", "Users"], ["/cards", "Cards"], ["/accounts", "Accounts"], ["/archive", "Archive"]],
  guard: [["/gate", "Gate"], ["/activities", "Activity"], ["/manual-entries", "Manual entries"], ["/incidents", "Incidents"]],
};
