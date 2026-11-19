export type NotificationCategory =
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

export interface NotificationCategoryMeta {
  key: NotificationCategory;
  emoji: string;
  label: string;
  shortLabel: string;
  description: string;
}

export const NOTIFICATION_CATEGORIES: NotificationCategoryMeta[] = [
  {
    key: "stock",
    emoji: "📦",
    label: "Estoque & Compras",
    shortLabel: "Estoque/Compras",
    description:
      "Compras de remédios e ração, ajustes de estoque, lista de compras e alertas de itens acabando.",
  },
  {
    key: "medications",
    emoji: "💊",
    label: "Administração de Remédios",
    shortLabel: "Remédios",
    description:
      "Doses administradas ou puladas, novos medicamentos, alterações de receita e aprovações.",
  },
  {
    key: "feeding",
    emoji: "🥣",
    label: "Alimentação & Ração",
    shortLabel: "Alimentação",
    description:
      "Refeições registradas, exceções (jejum/sobras no pote), consumo diário e modo de rotina.",
  },
  {
    key: "vaccinations",
    emoji: "💉",
    label: "Vacinação",
    shortLabel: "Vacinas",
    description: "Aplicação, edição e exclusão de vacinas e reforços.",
  },
  {
    key: "notes",
    emoji: "📋",
    label: "Notas Clínicas & Sintomas",
    shortLabel: "Notas Clínicas",
    description:
      'Notas clínicas e relatos de sintomas/ocorrências (ex: "O Gengibre vomitou hoje").',
  },
  {
    key: "appointments",
    emoji: "📅",
    label: "Consultas, Peso & Agenda",
    shortLabel: "Consultas/Peso",
    description:
      "Agendamentos veterinários, pesagens e alterações cadastrais ou de equipe.",
  },
];

export const ALL_NOTIFICATION_CATEGORY_KEYS: NotificationCategory[] =
  NOTIFICATION_CATEGORIES.map((c) => c.key);

export function getCategoryMeta(
  category: NotificationCategory
): NotificationCategoryMeta {
  return (
    NOTIFICATION_CATEGORIES.find((c) => c.key === category) ||
    NOTIFICATION_CATEGORIES[0]
  );
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
  prefs?: Partial<NotificationPreferences> | null
): NotificationPreferences {
  const defaults = getDefaultNotificationPreferences(role);
  if (!prefs) return defaults;

  return {
    stock: typeof prefs.stock === "boolean" ? prefs.stock : defaults.stock,
    medications:
      typeof prefs.medications === "boolean"
        ? prefs.medications
        : defaults.medications,
    feeding:
      typeof prefs.feeding === "boolean" ? prefs.feeding : defaults.feeding,
    vaccinations:
      typeof prefs.vaccinations === "boolean"
        ? prefs.vaccinations
        : defaults.vaccinations,
    notes: typeof prefs.notes === "boolean" ? prefs.notes : defaults.notes,
    appointments:
      typeof prefs.appointments === "boolean"
        ? prefs.appointments
        : defaults.appointments,
  };
}

function normalizeForNotificationMatch(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function resolveNotificationCategories(
  actionTaken?: string,
  summary?: string
): NotificationCategory[] {
  const actions = (actionTaken || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  const matched = new Set<NotificationCategory>();

  for (const action of actions) {
    switch (action) {
      case "clinical_note_recorded":
        matched.add("notes");
        break;
      case "vaccine_recorded":
        matched.add("vaccinations");
        break;
      case "medication_administered":
      case "medication_skipped":
      case "medication_created":
      case "medication_updated":
      case "medication_deleted":
      case "prescription_approved":
      case "prescription_rejected":
        matched.add("medications");
        break;
      case "consumption_recorded":
      case "feeding_exception_recorded":
      case "daily_consumption_updated":
      case "routine_mode_updated":
        matched.add("feeding");
        break;
      case "purchase_recorded":
      case "stock_adjusted":
      case "inventory_item_created":
      case "inventory_item_deleted":
      case "inventory_lead_time_updated":
      case "shopping_item_added":
      case "shopping_item_toggled":
      case "low_stock_alert":
        matched.add("stock");
        break;
      case "appointment_recorded":
      case "weight_recorded":
      case "pet_updated":
      case "invite_created":
      case "joined_pet_by_code":
        matched.add("appointments");
        break;
      case "health_record_updated":
      case "health_record_deleted":
      default: {
        const cleanSummary = normalizeForNotificationMatch(summary || "");
        if (cleanSummary.includes("nota clinica")) {
          matched.add("notes");
        } else if (cleanSummary.includes("vacina")) {
          matched.add("vaccinations");
        } else if (
          cleanSummary.includes("compra") ||
          cleanSummary.includes("estoque")
        ) {
          matched.add("stock");
        } else if (
          cleanSummary.includes("medicamento") ||
          cleanSummary.includes("dose")
        ) {
          matched.add("medications");
        } else if (
          cleanSummary.includes("refeicao") ||
          cleanSummary.includes("alimentacao")
        ) {
          matched.add("feeding");
        } else if (cleanSummary) {
          matched.add("appointments");
        }
        break;
      }
    }
  }

  if (matched.size > 0) {
    return Array.from(matched);
  }

  const cleanSummary = normalizeForNotificationMatch(summary || "");
  if (cleanSummary.includes("nota clinica")) return ["notes"];
  if (cleanSummary.includes("vacina")) return ["vaccinations"];
  if (cleanSummary.includes("compra") || cleanSummary.includes("estoque")) {
    return ["stock"];
  }
  if (cleanSummary.includes("medicamento") || cleanSummary.includes("dose")) {
    return ["medications"];
  }
  if (
    cleanSummary.includes("refeicao") ||
    cleanSummary.includes("alimentacao")
  ) {
    return ["feeding"];
  }

  return ["appointments"];
}

export function resolveNotificationCategory(
  actionTaken?: string,
  summary?: string
): NotificationCategory {
  return resolveNotificationCategories(actionTaken, summary)[0];
}

export function parseNotificationCategoriesFromText(
  text: string
): NotificationCategory[] {
  let clean = normalizeForNotificationMatch(text);
  const found = new Set<NotificationCategory>();

  const compoundStockPatterns = [
    /\bcompras?\s+de\s+(?:remedios?|medicamentos?|racao|racoes|comida|suprimentos?|insumos?|itens?)\b/g,
    /\balertas?\s+de\s+estoque\b/g,
    /\bmudancas?\s+(?:de|no)\s+estoque\b/g,
    /\blista\s+de\s+compras?\b/g,
  ];

  for (const pattern of compoundStockPatterns) {
    if (pattern.test(clean)) {
      found.add("stock");
      clean = clean.replace(pattern, " ");
    }
  }

  if (
    /\b(?:estoque|compra|compras|reposicao|acabando)\b/.test(clean)
  ) {
    found.add("stock");
  }

  if (
    /\b(?:remedio|remedios|medicamento|medicamentos|medicacao|medicacoes|dose|doses|administracao|administracoes|receita|receitas|prescricao|prescricoes)\b/.test(
      clean
    )
  ) {
    found.add("medications");
  }

  if (
    /\b(?:alimentacao|racao|racoes|comida|comidas|refeicao|refeicoes|jejum|sobra|sobras|pote|consumo\s+diario)\b/.test(
      clean
    )
  ) {
    found.add("feeding");
  }

  if (/\b(?:vacina|vacinas|vacinacao|vacinacoes|imunizacao)\b/.test(clean)) {
    found.add("vaccinations");
  }

  if (
    /\b(?:nota|notas|prontuario|sintoma|sintomas|ocorrencia|ocorrencias|observacao|observacoes)\b/.test(
      clean
    )
  ) {
    found.add("notes");
  }

  if (
    /\b(?:consulta|consultas|compromisso|compromissos|agenda|agendamento|agendamentos|retorno|peso|pesagem|pesagens|exame|exames)\b/.test(
      clean
    )
  ) {
    found.add("appointments");
  }

  return Array.from(found);
}

export function formatNotificationPreferencesSummary(
  prefs: NotificationPreferences
): string {
  const active = NOTIFICATION_CATEGORIES.filter((c) => prefs[c.key]).map(
    (c) => `${c.emoji} ${c.shortLabel}`
  );
  const muted = NOTIFICATION_CATEGORIES.filter((c) => !prefs[c.key]).map(
    (c) => `${c.emoji} ${c.shortLabel}`
  );

  const lines: string[] = [];
  if (active.length > 0) {
    lines.push(`🔔 *Ativas:* ${active.join(", ")}`);
  } else {
    lines.push(`🔔 *Ativas:* Nenhuma`);
  }
  if (muted.length > 0) {
    lines.push(`🔕 *Silenciadas:* ${muted.join(", ")}`);
  }
  return lines.join("\n");
}
