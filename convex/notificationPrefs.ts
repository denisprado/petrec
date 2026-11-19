import { v } from "convex/values";

export const notificationPreferencesValidator = v.object({
  stock: v.boolean(),
  medications: v.boolean(),
  feeding: v.boolean(),
  vaccinations: v.boolean(),
  notes: v.boolean(),
  appointments: v.boolean(),
});

export const notificationPreferencesPartialValidator =
  notificationPreferencesValidator.partial();

export type NotificationCategoryKey =
  | "stock"
  | "medications"
  | "feeding"
  | "vaccinations"
  | "notes"
  | "appointments";

export interface NotificationPreferences {
  stock: boolean;
  medications: boolean;
  feeding: boolean;
  vaccinations: boolean;
  notes: boolean;
  appointments: boolean;
}

export function getDefaultNotificationPreferences(
  role?: string
): NotificationPreferences {
  const normalized = (role || "").toLowerCase().trim();

  switch (normalized) {
    case "vet_limited":
      return {
        stock: false,
        medications: true,
        feeding: false,
        vaccinations: true,
        notes: true,
        appointments: true,
      };
    case "clinic_admin":
      return {
        stock: false,
        medications: false,
        feeding: false,
        vaccinations: true,
        notes: false,
        appointments: true,
      };
    case "caregiver_pro":
      return {
        stock: false,
        medications: true,
        feeding: true,
        vaccinations: false,
        notes: true,
        appointments: true,
      };
    default:
      return {
        stock: true,
        medications: true,
        feeding: true,
        vaccinations: true,
        notes: true,
        appointments: true,
      };
  }
}

export function resolveNotificationPreferences(
  role?: string,
  stored?: Partial<NotificationPreferences> | null
): NotificationPreferences {
  const defaults = getDefaultNotificationPreferences(role);
  if (!stored) return defaults;

  return {
    stock: typeof stored.stock === "boolean" ? stored.stock : defaults.stock,
    medications:
      typeof stored.medications === "boolean"
        ? stored.medications
        : defaults.medications,
    feeding:
      typeof stored.feeding === "boolean" ? stored.feeding : defaults.feeding,
    vaccinations:
      typeof stored.vaccinations === "boolean"
        ? stored.vaccinations
        : defaults.vaccinations,
    notes: typeof stored.notes === "boolean" ? stored.notes : defaults.notes,
    appointments:
      typeof stored.appointments === "boolean"
        ? stored.appointments
        : defaults.appointments,
  };
}
