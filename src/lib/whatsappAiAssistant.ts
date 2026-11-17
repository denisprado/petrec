import { ConvexHttpClient } from "convex/browser";
import { GoogleGenAI } from "@google/genai";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { api } from "../../convex/_generated/api";
import { calculateStockForecast, StockCalculationResult } from "./stockCalculation";

export const AI_MODEL_NAME = "gemini-3.8-flash";

export interface InventoryWithForecast {
  _id: any;
  name: string;
  category: string;
  unit: string;
  currentQuantity: number;
  dailyConsumption: number;
  purchaseLeadTimeDays: number;
  status: string;
  medicationId?: any;
  forecast: StockCalculationResult;
}

export interface PetContextSnapshot {
  pet: any;
  allPets: any[];
  inventory: InventoryWithForecast[];
  administrationsToday: any[];
  medications: any[];
  health: {
    weights: any[];
    vaccines: any[];
    appointments: any[];
    clinicalNotes: any[];
  };
  shoppingList: any[];
}

export interface AiAssistantResult {
  handled: boolean;
  replyText: string;
  actionTaken?: string;
  nextState: string;
  pendingActionPayload?: string;
  usedGemini: boolean;
}

interface PendingMedCandidate {
  id: string;
  name: string;
  time: string;
  status: string;
  quantity: number;
}

function normalizeText(text: string): string {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeUnit(unit?: string): string {
  const u = normalizeText(unit || "");
  if (u === "kg" || u === "kilo" || u === "kilos" || u === "quilo" || u === "quilos") {
    return "kg";
  }
  if (u === "g" || u === "gr" || u === "grama" || u === "gramas") {
    return "g";
  }
  if (u.startsWith("comprimido") || u === "cp" || u === "cps") {
    return "comprimidos";
  }
  if (u === "ml" || u === "mililitro" || u === "mililitros") {
    return "ml";
  }
  return u || "unidades";
}

function convertQuantityForTargetUnit(
  quantity: number,
  spokenUnit: string | undefined,
  targetUnit: string
): number {
  const from = normalizeUnit(spokenUnit);
  const to = normalizeUnit(targetUnit);

  if (from === "kg" && to === "g") {
    return Math.round(quantity * 1000);
  }
  if (from === "g" && to === "kg") {
    return Number((quantity / 1000).toFixed(3));
  }
  return quantity;
}

function extractScheduledTime(scheduledAt: string): string {
  const match = (scheduledAt || "").match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  try {
    return format(new Date(scheduledAt), "HH:mm");
  } catch {
    return "--:--";
  }
}

export interface PendingItemCandidate {
  id: string;
  name: string;
  unit: string;
  currentQuantity: number;
}

function findMatchingInventoryCandidates(
  inventory: InventoryWithForecast[],
  itemName?: string,
  preferredCategory?: string
): InventoryWithForecast[] {
  if (!inventory.length) return [];

  if (itemName) {
    const cleanTarget = normalizeText(itemName);
    const exactMatch = inventory.find((item) => normalizeText(item.name) === cleanTarget);
    if (exactMatch) return [exactMatch];

    // Se o usuário citou termo genérico de ração/comida e existem várias rações, retornar todas para desambiguação
    if (
      cleanTarget === "racao" ||
      cleanTarget === "comida" ||
      cleanTarget === "alimento"
    ) {
      const racoes = inventory.filter((i) => i.category === "racao");
      if (racoes.length > 0) return racoes;
    }

    const stopWords = new Set([
      "de",
      "da",
      "do",
      "dos",
      "das",
      "um",
      "uma",
      "o",
      "a",
      "saco",
      "pacote",
      "caixa",
      "cartela",
      "frasco",
      "balde",
      "pote",
      "racao",
      "comida",
    ]);
    const tokens = cleanTarget
      .split(/[\s,.-]+/)
      .filter((t) => t.length >= 3 && !stopWords.has(t));

    const matched: InventoryWithForecast[] = [];
    for (const item of inventory) {
      const cleanName = normalizeText(item.name);
      if (cleanName.includes(cleanTarget) || cleanTarget.includes(cleanName)) {
        matched.push(item);
        continue;
      }
      if (tokens.some((tok) => cleanName.includes(tok))) {
        matched.push(item);
      }
    }
    if (matched.length > 0) return matched;

    if (cleanTarget.includes("racao") || cleanTarget.includes("comida")) {
      const racoes = inventory.filter((i) => i.category === "racao");
      if (racoes.length > 0) return racoes;
    }
  }

  if (preferredCategory) {
    const byCat = inventory.filter((i) => i.category === preferredCategory);
    if (byCat.length > 0) return byCat;
  }

  return [];
}

function findMatchingInventoryItem(
  inventory: InventoryWithForecast[],
  itemName?: string,
  preferredCategory?: string
): InventoryWithForecast | undefined {
  return findMatchingInventoryCandidates(inventory, itemName, preferredCategory)[0];
}

function normalizeMedicationTimes(rawTimes?: string[], frequencyHint?: string): string[] {
  const valid: string[] = [];
  if (Array.isArray(rawTimes)) {
    for (const t of rawTimes) {
      const m = String(t).match(/(\d{1,2})(?:[:h](\d{2}))?/);
      if (m) {
        const hh = Math.min(23, parseInt(m[1], 10)).toString().padStart(2, "0");
        const mm = (m[2] || "00").padStart(2, "0");
        const formatted = `${hh}:${mm}`;
        if (!valid.includes(formatted)) valid.push(formatted);
      }
    }
  }
  if (valid.length > 0) return valid;

  const hint = normalizeText(frequencyHint || "");
  if (hint.includes("12 em 12") || hint.includes("2x") || hint.includes("duas vezes")) {
    return ["08:00", "20:00"];
  }
  if (hint.includes("8 em 8") || hint.includes("3x") || hint.includes("tres vezes")) {
    return ["08:00", "16:00", "23:59"];
  }
  if (hint.includes("6 em 6") || hint.includes("4x") || hint.includes("quatro vezes")) {
    return ["06:00", "12:00", "18:00", "23:59"];
  }
  return ["08:00"];
}

function parseBrOrIsoDateToIso(raw: string): string | undefined {
  const iso = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const br = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (br) {
    const d = br[1].padStart(2, "0");
    const m = br[2].padStart(2, "0");
    const y = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${y}-${m}-${d}`;
  }
  return undefined;
}

function parseVaccineFromText(messageText: string): {
  vaccineName: string;
  applicationDate: string;
  nextDueDate?: string;
  batch?: string;
  veterinarian?: string;
  notes?: string;
} | null {
  const clean = normalizeText(messageText);
  const isVaccineIntent =
    clean.includes("vacina") ||
    clean.includes("vacinei") ||
    clean.includes("antirrabica") ||
    clean.includes("v10") ||
    clean.includes("v8") ||
    clean.includes("v5") ||
    clean.includes("v4") ||
    clean.includes("v3") ||
    clean.includes("giardia") ||
    clean.includes("gripe") ||
    clean.includes("leishmaniose") ||
    clean.includes("carteira de vacinacao") ||
    ((clean.includes("tomou") || clean.includes("apliquei") || clean.includes("aplicou")) &&
      (clean.includes("vermifugo") || clean.includes("antipulgas") || clean.includes("rabica")));

  if (!isVaccineIntent) return null;

  let vaccineName = "Vacina";
  const knownPatterns: Array<[RegExp, string]> = [
    [/\bv10\b/i, "Vacina V10 (Polivalente)"],
    [/\bv8\b/i, "Vacina V8 (Polivalente)"],
    [/\bv5\b/i, "Vacina V5 (Felina)"],
    [/\bv4\b/i, "Vacina V4 (Quádrupla Felina)"],
    [/\bv3\b/i, "Vacina V3"],
    [/anti[-\s]?rr?[aá]bica|raiva/i, "Vacina Antirrábica"],
    [/gi[aá]rdia/i, "Vacina Giárdia"],
    [/gripe|tosse dos canis|bronchiguard/i, "Vacina Gripe Canina"],
    [/leishmaniose|leish/i, "Vacina Leishmaniose"],
    [/verm[ií]fugo/i, "Vermífugo"],
    [/antipulgas?|bravecto|simparic|nexgard/i, "Antipulgas / Ectoparasiticida"],
  ];

  for (const [rx, label] of knownPatterns) {
    if (rx.test(messageText)) {
      vaccineName = label;
      break;
    }
  }

  if (vaccineName === "Vacina") {
    const nameMatch = messageText.match(/vacina(?:ção)?\s+(?:de\s+|contra\s+)?([A-Za-zÀ-ú0-9\s-]{2,28}?)(?=,|\.|hoje|lote|refor|em\s+\d|$)/i);
    if (nameMatch && nameMatch[1]?.trim()) {
      vaccineName = `Vacina ${nameMatch[1].trim()}`;
    }
  }

  const today = new Date();
  const applicationDate = format(today, "yyyy-MM-dd");

  let nextDueDate: string | undefined;
  const yearMatch = clean.match(/(?:reforco|proximo|proxima|vencimento|revacinacao).*?(\d+)\s*anos?/);
  const monthMatch = clean.match(/(?:reforco|proximo|proxima|vencimento|revacinacao).*?(\d+)\s*mes(?:es)?/);
  const dayMatch = clean.match(/(?:reforco|proximo|proxima|vencimento|revacinacao).*?(\d+)\s*dias?/);
  const explicitDateAfterReforco = messageText.match(/(?:refor[çc]o|pr[oó]xim[oa]|vencimento).*?(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i);

  if (explicitDateAfterReforco) {
    nextDueDate = parseBrOrIsoDateToIso(explicitDateAfterReforco[1]);
  } else if (yearMatch) {
    nextDueDate = format(addDays(today, parseInt(yearMatch[1], 10) * 365), "yyyy-MM-dd");
  } else if (monthMatch) {
    nextDueDate = format(addDays(today, parseInt(monthMatch[1], 10) * 30), "yyyy-MM-dd");
  } else if (dayMatch) {
    nextDueDate = format(addDays(today, parseInt(dayMatch[1], 10)), "yyyy-MM-dd");
  }

  const batchMatch = messageText.match(/\blote\s*[:#-]?\s*([A-Za-z0-9._-]+)/i);
  const vetMatch = messageText.match(/\b(?:dr\.?|dra\.?|vet\.?|veterin[aá]ri[oa])\s+([A-Za-zÀ-ú\s]{2,25}?)(?=,|\.|$)/i);

  return {
    vaccineName,
    applicationDate,
    nextDueDate,
    batch: batchMatch ? batchMatch[1].trim() : undefined,
    veterinarian: vetMatch ? vetMatch[1].trim() : undefined,
    notes: `Registrado via WhatsApp: "${messageText.trim()}"`,
  };
}

function parseMedicationFromText(messageText: string): {
  name: string;
  dosage?: string;
  unit?: string;
  times: string[];
  quantityPerAdministration: number;
  initialStockQuantity: number;
  veterinarian?: string;
  instructions?: string;
} | null {
  const clean = normalizeText(messageText);
  const isMedCreation =
    clean.includes("receitou") ||
    clean.includes("prescreveu") ||
    clean.includes("prescricao") ||
    clean.startsWith("receita") ||
    clean.includes("novo remedio") ||
    clean.includes("novo medicamento") ||
    clean.includes("iniciar tratamento") ||
    clean.includes("comecar tratamento");

  if (!isMedCreation) return null;

  // Extrair nome do medicamento após gatilho
  let medName = "Medicamento";
  const nameMatch = messageText.match(
    /(?:receitou|prescreveu|receita\s*:|novo\s+rem[eé]dio|novo\s+medicamento|tratamento\s+com)\s+(?:o\s+|a\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú0-9\s-]{1,28}?)(?=\s+\d|\s+de\s+\d|\s+cada|\s*\(|,|\.|$)/i
  );
  if (nameMatch && nameMatch[1]?.trim()) {
    medName = nameMatch[1].trim();
  }

  const dosageMatch = messageText.match(/(\d+(?:[.,]\d+)?\s*(?:mg\/ml|mg|ml|mcg|ui))/i);
  const dosage = dosageMatch ? dosageMatch[1].replace(/\s+/g, "") : undefined;

  // Extrair horários explícitos (08:00, 20:00, 8h, 20h) que não estejam ligados a "12 em 12h" / "8 em 8h"
  const explicitTimes: string[] = [];
  const timeRegex = /(?<!em\s)(?<!cada\s)\b(\d{1,2})\s*(?:h\b|:(\d{2}))/gi;
  let tm: RegExpExecArray | null;
  while ((tm = timeRegex.exec(messageText)) !== null) {
    const h = parseInt(tm[1], 10);
    const min = tm[2] || "00";
    if (h >= 0 && h <= 23) {
      const hh = h.toString().padStart(2, "0");
      const slot = `${hh}:${min}`;
      if (!explicitTimes.includes(slot)) explicitTimes.push(slot);
    }
  }

  const times = normalizeMedicationTimes(explicitTimes, messageText);

  const stockMatch = clean.match(
    /(?:comprei|caixa\s+com|frasco\s+com|com|estoque\s+de)\s*(\d+(?:[.,]\d+)?)\s*(comprimidos?|capsulas?|doses?|gotas?|ml|unidades?)\b/
  );
  const unit = stockMatch
    ? normalizeUnit(stockMatch[2])
    : clean.includes("gota")
    ? "gotas"
    : clean.includes("ml")
    ? "ml"
    : "comprimidos";
  const initialStockQuantity = stockMatch ? parseFloat(stockMatch[1].replace(",", ".")) : 10;

  const cleanWithoutStock = stockMatch ? clean.replace(stockMatch[0], " ") : clean;
  const dosePerAdminMatch = cleanWithoutStock.match(
    /(\d+(?:[.,]\d+)?)\s*(?:comprimido|capsula|dose|gota)/
  );
  const quantityPerAdministration = dosePerAdminMatch
    ? parseFloat(dosePerAdminMatch[1].replace(",", "."))
    : 1;

  const vetMatch = messageText.match(/\b(?:dr\.?|dra\.?|vet\.?|veterin[aá]ri[oa])\s+([A-Za-zÀ-ú\s]{2,25}?)(?=,|\.|$)/i);

  return {
    name: medName.charAt(0).toUpperCase() + medName.slice(1),
    dosage,
    unit,
    times,
    quantityPerAdministration,
    initialStockQuantity,
    veterinarian: vetMatch ? vetMatch[1].trim() : undefined,
    instructions: messageText.trim(),
  };
}

function filterAdministrationsByHints(
  adms: any[],
  medicationName?: string,
  scheduledTimeHint?: string
): any[] {
  let candidates = [...adms];

  if (medicationName) {
    const target = normalizeText(medicationName);
    const byName = candidates.filter((a) => {
      const medName = normalizeText(a.medication?.name || "");
      return medName.includes(target) || target.includes(medName);
    });
    if (byName.length > 0) {
      candidates = byName;
    } else {
      return [];
    }
  }

  if (scheduledTimeHint) {
    const hint = normalizeText(scheduledTimeHint);
    const hourMatch = hint.match(/(\d{1,2})(?:[:h](\d{2}))?/);
    if (hourMatch) {
      const targetHour = parseInt(hourMatch[1], 10);
      const byHour = candidates.filter((a) => {
        const timeStr = extractScheduledTime(a.scheduledAt);
        const h = parseInt(timeStr.split(":")[0], 10);
        return !isNaN(h) && h === targetHour;
      });
      if (byHour.length > 0) {
        candidates = byHour;
      }
    } else if (hint.includes("manha") || hint.includes("cedo")) {
      const morning = candidates.filter((a) => {
        const h = parseInt(extractScheduledTime(a.scheduledAt).split(":")[0], 10);
        return !isNaN(h) && h < 12;
      });
      if (morning.length > 0) candidates = morning;
    } else if (hint.includes("tarde")) {
      const afternoon = candidates.filter((a) => {
        const h = parseInt(extractScheduledTime(a.scheduledAt).split(":")[0], 10);
        return !isNaN(h) && h >= 12 && h < 18;
      });
      if (afternoon.length > 0) candidates = afternoon;
    } else if (hint.includes("noite")) {
      const night = candidates.filter((a) => {
        const h = parseInt(extractScheduledTime(a.scheduledAt).split(":")[0], 10);
        return !isNaN(h) && h >= 18;
      });
      if (night.length > 0) candidates = night;
    }
  }

  return candidates;
}

/**
 * Monta o snapshot completo do pet atual com previsão de estoque e rotina do dia.
 */
export async function buildPetContextSnapshot(
  convex: ConvexHttpClient,
  currentPet: any,
  allPets: any[]
): Promise<PetContextSnapshot> {
  const [rawInventory, administrationsToday, medications, health, shoppingList] =
    await Promise.all([
      convex.query(api.inventory.listByPet, { petId: currentPet._id }),
      convex.query(api.medications.getAdministrationsToday, { petId: currentPet._id }),
      convex.query(api.medications.listByPet, { petId: currentPet._id }),
      convex.query(api.health.getPetHealth, { petId: currentPet._id }),
      convex.query(api.inventory.listShoppingList, { petId: currentPet._id }),
    ]);

  const inventory: InventoryWithForecast[] = (rawInventory || []).map((item: any) => ({
    ...item,
    forecast: calculateStockForecast({
      currentQuantity: item.currentQuantity,
      dailyConsumption: item.dailyConsumption,
      unit: item.unit,
      purchaseLeadTimeDays: item.purchaseLeadTimeDays,
    }),
  }));

  return {
    pet: currentPet,
    allPets,
    inventory,
    administrationsToday: administrationsToday || [],
    medications: medications || [],
    health: {
      weights: health?.weights || [],
      vaccines: health?.vaccines || [],
      appointments: health?.appointments || [],
      clinicalNotes: health?.clinicalNotes || [],
    },
    shoppingList: shoppingList || [],
  };
}

/**
 * Declaração das ferramentas expostas ao modelo Gemini via Interactions API.
 */
const ASSISTANT_TOOLS = [
  {
    type: "function" as const,
    name: "record_feeding_exception",
    description:
      "Registra que o pet NÃO comeu toda ou parte da ração (jejum, sobrou comida no pote, deixou metade, não quis jantar). Preserva ou estorna a quantidade não consumida no estoque.",
    parameters: {
      type: "object",
      properties: {
        itemName: {
          type: "string",
          description: "Nome do item de ração/alimento se especificado pelo tutor.",
        },
        quantityNotConsumedGrams: {
          type: "number",
          description: "Quantidade exata em gramas que NÃO foi consumida (ex: 150).",
        },
        fractionOfMealNotConsumed: {
          type: "number",
          description:
            "Fração da refeição não consumida se não houver gramas exatas (ex: 0.5 para metade do pote, 1 para uma refeição inteira não comida, 2 para jejum do dia inteiro).",
        },
        reason: {
          type: "string",
          description: "Motivo resumido da exceção (ex: 'Deixou metade do pote pela manhã').",
        },
      },
      required: ["reason"],
    },
  },
  {
    type: "function" as const,
    name: "record_feeding_consumption",
    description:
      "Registra consumo manual de ração/alimento quando o tutor informa quanto deu ou que o pet comeu.",
    parameters: {
      type: "object",
      properties: {
        itemName: { type: "string", description: "Nome da ração se especificado." },
        quantityGrams: { type: "number", description: "Quantidade dada em gramas." },
        notes: { type: "string", description: "Observação opcional." },
      },
      required: ["quantityGrams"],
    },
  },
  {
    type: "function" as const,
    name: "update_medication_dose",
    description:
      "Atualiza o status de uma dose de medicamento de hoje: marca como 'skipped' (quando NÃO deu, pulou, cuspiu ou vomitou) ou 'administered' (quando administrou).",
    parameters: {
      type: "object",
      properties: {
        medicationName: {
          type: "string",
          description: "Nome do medicamento mencionado pelo tutor, se houver.",
        },
        scheduledTimeHint: {
          type: "string",
          description: "Horário aproximado ou período da dose mencionada (ex: '08:00', '8h', 'manhã', 'noite').",
        },
        status: {
          type: "string",
          enum: ["administered", "skipped"],
          description: "Use 'skipped' se não deu, pulou, cuspiu ou vomitou; 'administered' se aplicou.",
        },
        reason: {
          type: "string",
          description: "Motivo ou detalhe informado pelo tutor (ex: 'Pet cuspiu o comprimido').",
        },
      },
      required: ["status"],
    },
  },
  {
    type: "function" as const,
    name: "record_purchase",
    description:
      "Registra compra ou reposição de estoque de ração, medicamento ou outro item (ex: 'comprei 15kg de ração', 'chegou caixa com 30 comprimidos').",
    parameters: {
      type: "object",
      properties: {
        itemName: {
          type: "string",
          description: "Nome do produto comprado (ex: 'ração', 'Apoquel').",
        },
        quantity: {
          type: "number",
          description: "Quantidade numérica comprada na unidade informada.",
        },
        unit: {
          type: "string",
          description: "Unidade mencionada pelo tutor (ex: 'kg', 'g', 'comprimidos', 'unidades', 'ml').",
        },
        notes: {
          type: "string",
          description: "Observações da compra.",
        },
      },
      required: ["itemName", "quantity"],
    },
  },
  {
    type: "function" as const,
    name: "adjust_stock",
    description:
      "Define a quantidade exata atual de um item após pesagem ou contagem física (ex: 'pesei o balde e tem 4,2kg', 'sobrou apenas 6 comprimidos na cartela').",
    parameters: {
      type: "object",
      properties: {
        itemName: {
          type: "string",
          description: "Nome ou categoria do item contado/pesado (ex: 'ração', 'Apoquel').",
        },
        newQuantity: {
          type: "number",
          description: "Nova quantidade total apurada na unidade informada.",
        },
        unit: {
          type: "string",
          description: "Unidade informada pelo tutor (ex: 'kg', 'g', 'comprimidos', 'unidades').",
        },
        notes: {
          type: "string",
          description: "Detalhe do ajuste físico.",
        },
      },
      required: ["newQuantity"],
    },
  },
  {
    type: "function" as const,
    name: "record_weight",
    description: "Registra uma nova pesagem do pet em quilogramas (kg).",
    parameters: {
      type: "object",
      properties: {
        weightKg: { type: "number", description: "Peso em quilogramas." },
        notes: { type: "string", description: "Observações opcionais." },
      },
      required: ["weightKg"],
    },
  },
  {
    type: "function" as const,
    name: "record_clinical_note",
    description:
      "Salva uma nota de diário de sintomas, comportamento ou observação clínica no prontuário do pet (ex: diarreia, coceira na orelha, apatia, vômito sem relação com medicação).",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Descrição clara da observação clínica ou sintoma.",
        },
      },
      required: ["content"],
    },
  },
  {
    type: "function" as const,
    name: "record_vaccine",
    description:
      "Cadastra uma vacina, vermífugo ou antipulgas aplicado no pet (por texto, áudio ou foto da carteira de vacinação).",
    parameters: {
      type: "object",
      properties: {
        vaccineName: {
          type: "string",
          description: "Nome da vacina ou imunizante (ex: 'Vacina V10', 'Antirrábica', 'Vermífugo').",
        },
        applicationDate: {
          type: "string",
          description: "Data da aplicação em YYYY-MM-DD (padrão: hoje).",
        },
        nextDueDate: {
          type: "string",
          description: "Data do próximo reforço em YYYY-MM-DD, se informada.",
        },
        veterinarian: {
          type: "string",
          description: "Nome do veterinário/clínica, se constar.",
        },
        crmv: { type: "string", description: "CRMV se informado." },
        batch: { type: "string", description: "Número do lote da vacina, se informado." },
        notes: { type: "string", description: "Observações adicionais." },
      },
      required: ["vaccineName"],
    },
  },
  {
    type: "function" as const,
    name: "create_medication",
    description:
      "Cadastra um novo medicamento e seu cronograma de horários a partir de receita veterinária (foto ou texto/áudio).",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Nome do medicamento (ex: 'Apoquel', 'Dipirona').",
        },
        dosage: {
          type: "string",
          description: "Concentração ou dosagem (ex: '5,4mg', '50mg/ml').",
        },
        unit: {
          type: "string",
          description: "Unidade posológica (ex: 'comprimidos', 'gotas', 'ml').",
        },
        times: {
          type: "array",
          items: { type: "string" },
          description: "Horários diários no formato HH:mm (ex: ['08:00', '20:00']).",
        },
        quantityPerAdministration: {
          type: "number",
          description: "Quantidade por dose (padrão: 1).",
        },
        initialStockQuantity: {
          type: "number",
          description: "Quantidade inicial comprada/em estoque (padrão: 10).",
        },
        instructions: {
          type: "string",
          description: "Instruções ou observações da receita.",
        },
        veterinarian: {
          type: "string",
          description: "Veterinário prescritor, se houver.",
        },
      },
      required: ["name"],
    },
  },
  {
    type: "function" as const,
    name: "update_daily_consumption",
    description:
      "Configura ou altera o consumo diário padrão de uma ração/item no estoque (ex: 'O consumo diário de ração é 240g', 'O Gengibre come 240g por dia').",
    parameters: {
      type: "object",
      properties: {
        itemName: {
          type: "string",
          description: "Nome da ração se especificado.",
        },
        dailyQuantityGrams: {
          type: "number",
          description: "Quantidade consumida por dia em gramas.",
        },
      },
      required: ["dailyQuantityGrams"],
    },
  },
  {
    type: "function" as const,
    name: "answer_question",
    description:
      "Responde perguntas informativas do tutor com base nos dados atuais do pet (previsão de término da ração, status de remédios de hoje, peso, vacinas, lista de compras).",
    parameters: {
      type: "object",
      properties: {
        answerText: {
          type: "string",
          description: "Resposta direta, simpática e precisa em português para WhatsApp (use negrito *...* quando útil).",
        },
      },
      required: ["answerText"],
    },
  },
];

function buildSystemInstruction(snapshot: PetContextSnapshot): string {
  const { pet, inventory, administrationsToday, health, shoppingList } = snapshot;

  const inventorySummary =
    inventory.length === 0
      ? "Nenhum item cadastrado no estoque."
      : inventory
          .map((item) => {
            const endStr = item.forecast.estimatedEndDate
              ? format(item.forecast.estimatedEndDate, "dd/MM/yyyy", { locale: ptBR })
              : "Sem previsão";
            const days =
              item.forecast.daysRemaining === Infinity
                ? "sob demanda"
                : `${Math.round(item.forecast.daysRemaining)} dias`;
            return `- ${item.name} (cat: ${item.category}): ${item.currentQuantity} ${item.unit}, consumo diário: ${item.dailyConsumption} ${item.unit}/dia, dura aprox: ${days}, término estimado: ${endStr}, status: ${item.forecast.status}`;
          })
          .join("\n");

  const medsSummary =
    administrationsToday.length === 0
      ? "Nenhuma dose agendada para hoje."
      : administrationsToday
          .map((a) => {
            const time = extractScheduledTime(a.scheduledAt);
            const who = a.administeredBy?.name ? ` por ${a.administeredBy.name}` : "";
            return `- ${a.medication?.name || "Medicamento"} | Horário: ${time} | Dose: ${a.quantity} ${a.medication?.unit || "un"} | Status: ${a.status}${who}`;
          })
          .join("\n");

  const vaccinesSummary =
    health.vaccines.length === 0
      ? "Nenhuma vacina registrada."
      : health.vaccines
          .map((v) => `- ${v.name} (aplicada: ${v.applicationDate || "?"}, reforço: ${v.nextDueDate || "não informado"})`)
          .join("\n");

  const pendingShop = shoppingList
    .filter((s) => !s.isPurchased)
    .map((s) => `- ${s.customName || s.inventoryItem?.name || "Item"} (${s.quantity || 1} ${s.unit || "un"})`)
    .join("\n");

  return (
    `Você é o assistente inteligente do PetRec no WhatsApp, ajudando tutores a cuidar do pet *${pet.name}* (${pet.species}${pet.breed ? `, ${pet.breed}` : ""}).\n` +
    `Hoje é ${format(new Date(), "yyyy-MM-dd")}.\n` +
    `Modo de rotina atual do pet: ${pet.routineMode === "manual" ? "MANUAL (confirmação pontual)" : "POR EXCEÇÃO (rações e remédios são debitados automaticamente; o tutor avisa quando NÃO deu ou quando há exceções)"}.\n` +
    `Peso atual registrado: ${pet.weight ? `${pet.weight} kg` : "Não informado"}.\n\n` +
    `ESTOQUE ATUAL:\n${inventorySummary}\n\n` +
    `MEDICAMENTOS DE HOJE:\n${medsSummary}\n\n` +
    `VACINAS:\n${vaccinesSummary}\n\n` +
    `LISTA DE COMPRAS PENDENTE:\n${pendingShop || "Vazia"}\n\n` +
    `REGRAS IMPORTANTES:\n` +
    `1. Sempre use as ferramentas (function calls) para registrar ações reais ou responder perguntas usando os dados acima.\n` +
    `2. Se o tutor mencionar que o pet deixou comida/não comeu parte ou toda a refeição (ex: "deixou metade do pote", "não quis jantar", "jejum"), chame 'record_feeding_exception'. Assuma 2 refeições/dia caso o consumo diário esteja cadastrado e o tutor dê uma fração (metade de 1 refeição = fractionOfMealNotConsumed: 0.5; refeição inteira = 1; dia todo = 2).\n` +
    `3. Se o tutor informar que NÃO deu um remédio, o pet cuspiu, vomitou o remédio ou pulou um horário, chame 'update_medication_dose' com status 'skipped' e informe medicationName/scheduledTimeHint.\n` +
    `4. Se o tutor disser que comprou ou chegou algo (ração, comprimidos, etc.), chame 'record_purchase'.\n` +
    `5. Se o tutor informar ou alterar quanto o pet come por dia (ex: "o consumo diário é 240g", "come 300g por dia"), chame 'update_daily_consumption'.\n` +
    `6. Se o tutor informou quanto sobrou fisicamente após pesar ou contar (ex: "pesei o balde e tem 4,2kg"), chame 'adjust_stock'.\n` +
    `7. Se o tutor enviar foto ou áudio de receita veterinária / novo tratamento, chame 'create_medication'. Se for carteira de vacinação ou vacina aplicada, chame 'record_vaccine'.\n` +
    `8. Se o tutor relatar sintomas ou observações clínicas (ex: diarreia, coceira, mancar), chame 'record_clinical_note'.\n` +
    `9. Se a mensagem ou áudio contiver múltiplas ações (ex: jejum e compra), você pode chamar mais de uma ferramenta.\n` +
    `10. Responda em português brasileiro claro, conciso e amigável para WhatsApp.`
  );
}

function resolveInventoryItemOrDisambiguate(params: {
  inventory: InventoryWithForecast[];
  itemName?: string;
  preferredCategory?: string;
  toolName: string;
  args: Record<string, any>;
  petName: string;
}):
  | { item: InventoryWithForecast }
  | {
      disambiguation: {
        replyText: string;
        nextState: string;
        pendingActionPayload: string;
      };
    }
  | { notFound: true } {
  const candidates = findMatchingInventoryCandidates(
    params.inventory,
    params.itemName,
    params.preferredCategory
  );
  if (candidates.length === 0) return { notFound: true };
  if (candidates.length === 1) return { item: candidates[0] };

  const listPayload: PendingItemCandidate[] = candidates.map((i) => ({
    id: String(i._id),
    name: i.name,
    unit: i.unit,
    currentQuantity: i.currentQuantity,
  }));

  const optionsText = listPayload
    .map((c, idx) => `${idx + 1}️⃣ *${c.name}* (saldo: ${c.currentQuantity} ${c.unit})`)
    .join("\n");

  return {
    disambiguation: {
      replyText:
        `📦 *${params.petName}* tem ${listPayload.length} itens compatíveis no estoque. Qual deles você quer atualizar?\n\n` +
        `${optionsText}\n\n` +
        `👉 Responda com o *número* (ex: 1) ou *nome do item*, ou envie *cancelar*.`,
      nextState: "WAITING_ITEM_CHOICE",
      pendingActionPayload: JSON.stringify({
        toolName: params.toolName,
        args: params.args,
        candidates: listPayload,
      }),
    },
  };
}

/**
 * Executa uma ferramenta específica contra o backend Convex.
 */
export async function executeAssistantToolCall(params: {
  convex: ConvexHttpClient;
  toolName: string;
  args: Record<string, any>;
  snapshot: PetContextSnapshot;
  userId: any;
}): Promise<{
  replyText: string;
  actionTaken?: string;
  nextState?: string;
  pendingActionPayload?: string;
}> {
  const { convex, toolName, args, snapshot, userId } = params;
  const { pet, inventory, administrationsToday, shoppingList } = snapshot;

  switch (toolName) {
    case "record_feeding_exception": {
      const resolved = resolveInventoryItemOrDisambiguate({
        inventory,
        itemName: args.itemName,
        preferredCategory: "racao",
        toolName,
        args,
        petName: pet.name,
      });
      if ("disambiguation" in resolved) return resolved.disambiguation;
      if ("notFound" in resolved) {
        return {
          replyText: `🥣 Não encontrei nenhuma ração cadastrada no estoque de *${pet.name}* para registrar a exceção.`,
        };
      }
      const racao = resolved.item;

      let quantityNotConsumed = 0;
      if (typeof args.quantityNotConsumedGrams === "number" && args.quantityNotConsumedGrams > 0) {
        quantityNotConsumed = convertQuantityForTargetUnit(
          args.quantityNotConsumedGrams,
          "g",
          racao.unit
        );
      } else {
        const fraction =
          typeof args.fractionOfMealNotConsumed === "number" && args.fractionOfMealNotConsumed > 0
            ? args.fractionOfMealNotConsumed
            : 1;
        const singleMeal = racao.dailyConsumption > 0 ? racao.dailyConsumption / 2 : 150;
        quantityNotConsumed = Math.max(1, Math.round(singleMeal * fraction));
      }

      const reason = args.reason || "Exceção de alimentação informada via WhatsApp";

      await convex.mutation(api.inventory.recordFeedingException, {
        inventoryItemId: racao._id,
        quantityNotConsumed,
        reason,
        userId,
      });

      const updatedQty = racao.currentQuantity + quantityNotConsumed;
      return {
        replyText:
          `🥣 *Exceção de Refeição Registrada!*\n\n` +
          `Registrado que *${pet.name}* não consumiu *${quantityNotConsumed} ${racao.unit}* de *${racao.name}* (${reason}).\n` +
          `🛡️ Quantidade preservada no estoque (saldo atual: *${updatedQty} ${racao.unit}*).`,
        actionTaken: "feeding_exception_recorded",
      };
    }

    case "record_feeding_consumption": {
      const racao = findMatchingInventoryItem(inventory, args.itemName, "racao");
      if (!racao) {
        return {
          replyText: `🥣 Não encontrei nenhuma ração cadastrada no estoque de *${pet.name}*.`,
        };
      }

      const qty = convertQuantityForTargetUnit(Number(args.quantityGrams) || 0, "g", racao.unit);
      if (qty <= 0) {
        return { replyText: "⚠️ Informe uma quantidade válida de ração para registrar." };
      }

      await convex.mutation(api.inventory.recordConsumption, {
        inventoryItemId: racao._id,
        quantity: qty,
        userId,
        notes: args.notes || "Refeição registrada via WhatsApp",
      });

      const updatedQty = Math.max(0, racao.currentQuantity - qty);
      return {
        replyText:
          `🥣 *Refeição registrada!*\n\n` +
          `Registrado consumo de *${qty} ${racao.unit}* de *${racao.name}* para *${pet.name}*.\n` +
          `📦 Saldo atualizado: *${updatedQty} ${racao.unit}*.`,
        actionTaken: "consumption_recorded",
      };
    }

    case "update_medication_dose": {
      const targetStatus: "administered" | "skipped" =
        args.status === "administered" ? "administered" : "skipped";

      if (administrationsToday.length === 0) {
        return {
          replyText: `💊 Não há doses de medicamentos agendadas para *${pet.name}* hoje.`,
        };
      }

      let candidates = filterAdministrationsByHints(
        administrationsToday,
        args.medicationName,
        args.scheduledTimeHint
      );

      if (candidates.length === 0 && args.medicationName) {
        return {
          replyText:
            `💊 Não encontrei *${args.medicationName}* na agenda de hoje de *${pet.name}*.\n` +
            `Doses de hoje:\n` +
            administrationsToday
              .map((a) => `• ${a.medication?.name || "Medicamento"} (${extractScheduledTime(a.scheduledAt)})`)
              .join("\n"),
        };
      }

      // Filtrar por doses cujo status ainda permite a transição desejada
      const actionable =
        targetStatus === "skipped"
          ? candidates.filter((a) => a.status !== "skipped" && a.status !== "missed")
          : candidates.filter((a) => a.status !== "administered");

      if (actionable.length > 0) {
        candidates = actionable;
      }

      const distinctMedIds = new Set(candidates.map((c) => String(c.medicationId)));

      // Desambiguação interativa se houver mais de 1 dose/medicamento possível sem dica específica
      if (
        candidates.length > 1 &&
        (distinctMedIds.size > 1 || (!args.scheduledTimeHint && !args.medicationName))
      ) {
        const listPayload: PendingMedCandidate[] = candidates.map((c) => ({
          id: String(c._id),
          name: c.medication?.name || "Medicamento",
          time: extractScheduledTime(c.scheduledAt),
          status: c.status,
          quantity: c.quantity,
        }));

        const verbPrompt =
          targetStatus === "skipped" ? "você NÃO conseguiu dar" : "você administrou";

        const optionsText = listPayload
          .map((c, idx) => `${idx + 1}️⃣ *${c.name}* (${c.time}) — status: ${c.status}`)
          .join("\n");

        return {
          replyText:
            `💊 Encontrei ${listPayload.length} doses hoje para *${pet.name}*. Qual delas ${verbPrompt}?\n\n` +
            `${optionsText}\n\n` +
            `👉 Responda com o *número* (ex: 1) ou o *nome do remédio*, ou envie *cancelar*.`,
          nextState: "WAITING_MED_CHOICE",
          pendingActionPayload: JSON.stringify({
            targetStatus,
            reason: args.reason,
            candidates: listPayload,
          }),
        };
      }

      // Se restou apenas 1 candidato (ou múltiplos horários do mesmo medicamento já especificado),
      // prioriza a dose já vencida/mais próxima
      const chosen = candidates[candidates.length - 1] || candidates[0];
      const timeLabel = extractScheduledTime(chosen.scheduledAt);

      await convex.mutation(api.medications.administer, {
        administrationId: chosen._id,
        userId,
        status: targetStatus,
        notes: args.reason,
      });

      if (targetStatus === "skipped") {
        return {
          replyText:
            `💊 *Exceção de Medicamento Registrada!*\n\n` +
            `A dose das *${timeLabel}* de *${chosen.medication?.name || "Medicamento"}* para *${pet.name}* foi marcada como *NÃO administrada / pulada*${args.reason ? ` (${args.reason})` : ""}.\n` +
            `🛡️ Estoque do medicamento preservado/estornado no PetRec!`,
          actionTaken: "medication_skipped",
        };
      }

      return {
        replyText:
          `💊 *Medicamento Administrado!*\n\n` +
          `Dose das *${timeLabel}* de *${chosen.medication?.name || "Medicamento"}* para *${pet.name}* registrada com sucesso!`,
        actionTaken: "medication_administered",
      };
    }

    case "record_purchase": {
      const itemNameInput = (args.itemName || "Item").trim();
      const lowerItem = normalizeText(itemNameInput);
      const inferredCategory =
        lowerItem.includes("racao") || lowerItem.includes("comida")
          ? "racao"
          : lowerItem.includes("comprimido") ||
            lowerItem.includes("remedio") ||
            lowerItem.includes("capsula")
          ? "medicamento"
          : undefined;

      const rawQty = Number(args.quantity);

      if (!rawQty || rawQty <= 0) {
        return { replyText: "⚠️ Informe uma quantidade válida para registrar a compra." };
      }

      const resolved = resolveInventoryItemOrDisambiguate({
        inventory,
        itemName: itemNameInput,
        preferredCategory: inferredCategory,
        toolName,
        args,
        petName: pet.name,
      });
      if ("disambiguation" in resolved) return resolved.disambiguation;
      const existing = "item" in resolved ? resolved.item : undefined;

      if (existing) {
        const convertedQty = convertQuantityForTargetUnit(rawQty, args.unit, existing.unit);
        await convex.mutation(api.inventory.recordPurchase, {
          petId: pet._id,
          userId,
          inventoryItemId: existing._id,
          quantity: convertedQty,
          notes: args.notes || "Compra registrada via WhatsApp",
        });

        // Se estava na lista de compras pendente, marca automaticamente como comprado
        for (const s of shoppingList) {
          if (!s.isPurchased && s.inventoryItemId === existing._id) {
            await convex.mutation(api.inventory.toggleShoppingItem, {
              id: s._id,
              isPurchased: true,
              userId,
            });
          }
        }

        const newTotal = existing.currentQuantity + convertedQty;
        const unitLabel = args.unit && convertedQty !== rawQty ? ` (${rawQty} ${args.unit})` : "";

        return {
          replyText:
            `🛒 *Compra Registrada no Estoque!*\n\n` +
            `Adicionados *+${convertedQty} ${existing.unit}*${unitLabel} em *${existing.name}* para *${pet.name}*.\n` +
            `📦 Novo saldo: *${newTotal} ${existing.unit}*.`,
          actionTaken: "purchase_recorded",
        };
      }

      // Se não existir no estoque ainda, cadastra o novo item já com entrada
      const targetUnit =
        normalizeUnit(args.unit) === "kg"
          ? "g"
          : args.unit || (inferredCategory === "racao" ? "g" : "unidades");
      const finalQty = convertQuantityForTargetUnit(rawQty, args.unit, targetUnit);

      await convex.mutation(api.inventory.createItem, {
        petId: pet._id,
        name: itemNameInput.charAt(0).toUpperCase() + itemNameInput.slice(1),
        category: inferredCategory || "outro",
        unit: targetUnit,
        currentQuantity: finalQty,
        dailyConsumption: 0,
        purchaseLeadTimeDays: 7,
        notes: args.notes || "Cadastrado via compra no WhatsApp",
        userId,
      });

      return {
        replyText:
          `🛒 *Novo Item Adicionado ao Estoque!*\n\n` +
          `*${itemNameInput}* cadastrado para *${pet.name}* com *${finalQty} ${targetUnit}* disponíveis.`,
        actionTaken: "purchase_recorded",
      };
    }

    case "adjust_stock": {
      const resolved = resolveInventoryItemOrDisambiguate({
        inventory,
        itemName: args.itemName,
        preferredCategory: "racao",
        toolName,
        args,
        petName: pet.name,
      });
      if ("disambiguation" in resolved) return resolved.disambiguation;
      if ("notFound" in resolved) {
        return {
          replyText: `📦 Não encontrei o item no estoque de *${pet.name}* para fazer o ajuste físico.`,
        };
      }
      const target = resolved.item;

      const rawQty = Number(args.newQuantity);
      if (isNaN(rawQty) || rawQty < 0) {
        return { replyText: "⚠️ Informe um valor válido para ajustar o estoque." };
      }

      const convertedQty = convertQuantityForTargetUnit(rawQty, args.unit, target.unit);
      const forecast = calculateStockForecast({
        currentQuantity: convertedQty,
        dailyConsumption: target.dailyConsumption,
        unit: target.unit,
        purchaseLeadTimeDays: target.purchaseLeadTimeDays,
      });

      await convex.mutation(api.inventory.recordTransaction, {
        inventoryItemId: target._id,
        type: "adjustment",
        quantity: convertedQty,
        userId,
        notes: args.notes || "Ajuste físico via WhatsApp",
        status: forecast.status,
        estimatedEndDate: forecast.estimatedEndDate
          ? forecast.estimatedEndDate.toISOString()
          : undefined,
      });

      const daysText =
        forecast.daysRemaining === Infinity
          ? "sob demanda"
          : `${Math.round(forecast.daysRemaining)} dia(s)`;

      return {
        replyText:
          `⚖️ *Estoque Ajustado!*\n\n` +
          `*${target.name}* de *${pet.name}* atualizado para *${convertedQty} ${target.unit}*.\n` +
          `📅 Previsão atual: dura aprox. *${daysText}* (status: *${forecast.status}*).`,
        actionTaken: "stock_adjusted",
      };
    }

    case "record_weight": {
      const weightVal = Number(args.weightKg);
      if (isNaN(weightVal) || weightVal <= 0 || weightVal >= 200) {
        return { replyText: "⚠️ Informe um peso válido em kg (ex: 18.5)." };
      }

      await convex.mutation(api.health.recordWeight, {
        petId: pet._id,
        userId,
        weight: weightVal,
        notes: args.notes || "Registrado via WhatsApp",
      });

      return {
        replyText: `⚖️ *Pesagem registrada!*\n\n*${pet.name}* atualizado para *${weightVal} kg* no prontuário! ✨`,
        actionTaken: "weight_recorded",
      };
    }

    case "record_clinical_note": {
      const content = (args.content || "").trim();
      if (!content) {
        return { replyText: "⚠️ Descreva a observação que deseja anotar no prontuário." };
      }

      await convex.mutation(api.health.recordClinicalNote, {
        petId: pet._id,
        authorId: userId,
        content,
        visibility: "ALL_TUTORS",
      });

      return {
        replyText:
          `📋 *Anotação salva no Prontuário!*\n\n` +
          `Registro salvo para *${pet.name}*:\n_"${content}"_\n\n` +
          `💡 Você pode consultar todo o histórico na aba Saúde ou na próxima consulta veterinária.`,
        actionTaken: "clinical_note_recorded",
      };
    }

    case "record_vaccine": {
      const vaccineName = (args.vaccineName || "Vacina").trim();
      const applicationDate = args.applicationDate || format(new Date(), "yyyy-MM-dd");

      await convex.mutation(api.health.recordVaccine, {
        petId: pet._id,
        userId,
        name: vaccineName,
        applicationDate,
        nextDueDate: args.nextDueDate || undefined,
        veterinarian: args.veterinarian || undefined,
        crmv: args.crmv || undefined,
        batch: args.batch || undefined,
        notes: args.notes || undefined,
      });

      const details: string[] = [`• Aplicação: *${applicationDate}*`];
      if (args.batch) details.push(`• Lote: *${args.batch}*`);
      if (args.nextDueDate) details.push(`• Próximo reforço: *${args.nextDueDate}*`);
      if (args.veterinarian) details.push(`• Veterinário: *${args.veterinarian}*`);

      return {
        replyText:
          `💉 *Vacina / Imunização Registrada!*\n\n` +
          `*${vaccineName}* cadastrada para *${pet.name}*:\n` +
          `${details.join("\n")}\n\n` +
          `✨ Já está disponível na carteirinha de Saúde no PetRec!`,
        actionTaken: "vaccine_recorded",
      };
    }

    case "create_medication": {
      const medName = (args.name || "Medicamento").trim();
      const normalizedTimes = normalizeMedicationTimes(
        Array.isArray(args.times) ? args.times : undefined,
        args.instructions
      );
      const qtyPerAdmin = Number(args.quantityPerAdministration) || 1;
      const initialStock = Number(args.initialStockQuantity) || 10;
      const unit = args.unit || "comprimidos";

      await convex.mutation(api.medications.create, {
        petId: pet._id,
        userId,
        name: medName,
        dosage: args.dosage || undefined,
        unit,
        instructions: args.instructions || undefined,
        veterinarian: args.veterinarian || undefined,
        times: normalizedTimes,
        quantityPerAdministration: qtyPerAdmin,
        initialStockQuantity: initialStock,
        purchaseLeadTimeDays: 5,
        status: "active",
      });

      return {
        replyText:
          `💊 *Medicamento & Receita Cadastrados!*\n\n` +
          `• Tratamento: *${medName}*${args.dosage ? ` (${args.dosage})` : ""}\n` +
          `• Pet: *${pet.name}*\n` +
          `• Horários diários: *${normalizedTimes.join(", ")}* (${qtyPerAdmin} ${unit}/dose)\n` +
          `• Estoque inicial: *${initialStock} ${unit}*\n\n` +
          `⏰ A rotina já foi ativada no PetRec!`,
        actionTaken: "medication_created",
      };
    }

    case "update_daily_consumption": {
      const resolved = resolveInventoryItemOrDisambiguate({
        inventory,
        itemName: args.itemName,
        preferredCategory: "racao",
        toolName,
        args,
        petName: pet.name,
      });
      if ("disambiguation" in resolved) return resolved.disambiguation;
      if ("notFound" in resolved) {
        return {
          replyText: `🥣 Não encontrei nenhuma ração cadastrada no estoque de *${pet.name}* para configurar o consumo diário.`,
        };
      }
      const racao = resolved.item;
      const rawDaily = Number(args.dailyQuantityGrams);
      if (!rawDaily || rawDaily <= 0) {
        return { replyText: "⚠️ Informe um consumo diário válido em gramas (ex: 240g)." };
      }

      const convertedDaily = convertQuantityForTargetUnit(rawDaily, "g", racao.unit);
      const forecast = calculateStockForecast({
        currentQuantity: racao.currentQuantity,
        dailyConsumption: convertedDaily,
        unit: racao.unit,
        purchaseLeadTimeDays: racao.purchaseLeadTimeDays,
      });

      await convex.mutation(api.inventory.updateParams, {
        id: racao._id,
        dailyConsumption: convertedDaily,
        status: forecast.status,
        estimatedEndDate: forecast.estimatedEndDate
          ? forecast.estimatedEndDate.toISOString()
          : undefined,
        userId,
      });

      const daysStr =
        forecast.daysRemaining === Infinity
          ? "indeterminado"
          : `${Math.round(forecast.daysRemaining)} dia(s)`;
      const endStr = forecast.estimatedEndDate
        ? format(forecast.estimatedEndDate, "dd/MM/yyyy", { locale: ptBR })
        : "não calculada";

      return {
        replyText:
          `🥣 *Consumo Diário Configurado!*\n\n` +
          `• Pet: *${pet.name}* | Item: *${racao.name}*\n` +
          `• Consumo definido: *${convertedDaily} ${racao.unit}/dia*\n` +
          `• Saldo atual (*${racao.currentQuantity} ${racao.unit}*): dura aprox. *${daysStr}* (até *${endStr}*, status: *${forecast.status}*).`,
        actionTaken: "daily_consumption_updated",
      };
    }

    case "answer_question": {
      return {
        replyText: args.answerText || `🐾 Tudo certo com *${pet.name}*!`,
        actionTaken: "question_answered",
      };
    }

    default:
      return {
        replyText: `🐾 Entendi! Você pode conferir tudo atualizado no painel de *${pet.name}*.`,
      };
  }
}

/**
 * Resolve frações ou termos coloquiais de quantidade de ração em português.
 */
function parseFeedingExceptionFromText(clean: string): {
  quantityNotConsumedGrams?: number;
  fraction?: number;
  reason: string;
} | null {
  const isFeedingContext =
    clean.includes("racao") ||
    clean.includes("comida") ||
    clean.includes("pote") ||
    clean.includes("comedouro") ||
    clean.includes("comer") ||
    clean.includes("comeu") ||
    clean.includes("almo") ||
    clean.includes("jantar") ||
    clean.includes("cafe") ||
    clean.includes("manha") ||
    clean.includes("tarde") ||
    clean.includes("noite") ||
    clean.includes("jejum") ||
    clean.includes("refeicao");

  const hasNegationOrLeftover =
    clean.includes("deixou") ||
    clean.includes("sobrou") ||
    clean.includes("nao comeu") ||
    clean.includes("nao quis") ||
    clean.includes("recusou") ||
    clean.includes("jejum") ||
    clean.includes("nao dei") ||
    clean.includes("comeu so") ||
    clean.includes("comeu apenas") ||
    clean.includes("comeu metade") ||
    clean.includes("pulou a refeicao");

  const gramsMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gramas)\b/);
  const hasExplicitFoodGrams =
    Boolean(gramsMatch) && !clean.includes("kg") && !clean.includes("kilo") && !clean.includes("quilo");

  if (!hasNegationOrLeftover) return null;
  // Evita roubar frases explícitas de remédio sem menção a comida
  if (
    (clean.includes("remedio") ||
      clean.includes("comprimido") ||
      clean.includes("dose") ||
      clean.includes("cartela")) &&
    !clean.includes("racao") &&
    !clean.includes("comida") &&
    !clean.includes("pote")
  ) {
    return null;
  }
  if (!isFeedingContext && !clean.includes("jejum") && !hasExplicitFoodGrams) return null;

  if (gramsMatch) {
    const g = parseFloat(gramsMatch[1].replace(",", "."));
    return {
      quantityNotConsumedGrams: g,
      reason: "Sobras / consumo parcial informado",
    };
  }

  if (clean.includes("metade") || clean.includes("meio pote") || clean.includes("1/2")) {
    return { fraction: 0.5, reason: "Deixou metade do pote" };
  }
  if (clean.includes("um terco") || clean.includes("1/3")) {
    return { fraction: 0.33, reason: "Deixou cerca de 1/3 da refeição" };
  }
  if (clean.includes("dois tercos") || clean.includes("2/3")) {
    return { fraction: 0.67, reason: "Deixou cerca de 2/3 da refeição" };
  }
  if (clean.includes("um quarto") || clean.includes("1/4")) {
    return { fraction: 0.25, reason: "Deixou cerca de 1/4 da refeição" };
  }
  if (
    clean.includes("jejum") &&
    (clean.includes("dia todo") || clean.includes("o dia") || clean.includes("inteiro"))
  ) {
    return { fraction: 2, reason: "Jejum durante o dia" };
  }
  if (clean.includes("jejum") || clean.includes("nao comeu nada") || clean.includes("nao quis")) {
    return { fraction: 1, reason: "Não comeu a refeição" };
  }

  return { fraction: 1, reason: "Exceção de refeição informada" };
}

/**
 * Fallback semântico contextual em português quando a GEMINI_API_KEY não está configurada
 * ou quando a chamada externa falha.
 */
async function interpretWithContextualNlu(
  messageText: string,
  snapshot: PetContextSnapshot,
  convex: ConvexHttpClient,
  userId: any
): Promise<AiAssistantResult> {
  const clean = normalizeText(messageText);

  // Suporte básico para frases compostas separadas por " e " quando envolvem ações distintas
  // Ex: "Hoje o Gengibre não comeu nada de manhã e comprei 10kg de ração"
  const clauses = messageText.split(
    /\s+e\s+(?=(?:comprei|chegou|pesei|contei|anota|nao|pulei|dei|tomou|vacin|receit|prescrev))/i
  );
  if (clauses.length > 1) {
    const replies: string[] = [];
    const actions: string[] = [];
    let finalState = "IDLE";
    let finalPayload: string | undefined;

    for (const clause of clauses) {
      const subRes = await interpretSingleClauseNlu(clause.trim(), snapshot, convex, userId);
      if (subRes.handled) {
        replies.push(subRes.replyText);
        if (subRes.actionTaken) actions.push(subRes.actionTaken);
        if (subRes.nextState !== "IDLE") {
          finalState = subRes.nextState;
          finalPayload = subRes.pendingActionPayload;
        }
      }
    }

    if (replies.length > 0) {
      return {
        handled: true,
        replyText: replies.join("\n\n---\n\n"),
        actionTaken: actions.join(","),
        nextState: finalState,
        pendingActionPayload: finalPayload,
        usedGemini: false,
      };
    }
  }

  return interpretSingleClauseNlu(messageText, snapshot, convex, userId);
}

async function interpretSingleClauseNlu(
  messageText: string,
  snapshot: PetContextSnapshot,
  convex: ConvexHttpClient,
  userId: any
): Promise<AiAssistantResult> {
  const clean = normalizeText(messageText);

  // 1. Perguntas de consulta rápida (Q&A)
  if (
    clean.includes("?") ||
    clean.startsWith("quando") ||
    clean.startsWith("quantos") ||
    clean.startsWith("alguem") ||
    clean.startsWith("ja deram") ||
    clean.startsWith("como esta") ||
    clean.startsWith("qual ")
  ) {
    // 1a. Previsão de ração / estoque
    if (clean.includes("racao") || clean.includes("comida") || clean.includes("acabar") || clean.includes("dura")) {
      const racao = snapshot.inventory.find((i) => i.category === "racao") || snapshot.inventory[0];
      if (!racao) {
        return {
          handled: true,
          replyText: `📦 *${snapshot.pet.name}* ainda não tem nenhuma ração cadastrada no estoque.`,
          nextState: "IDLE",
          usedGemini: false,
        };
      }
      const fc = racao.forecast;
      const daysStr =
        fc.daysRemaining === Infinity ? "indeterminado" : `${Math.round(fc.daysRemaining)} dia(s)`;
      const endDateStr = fc.estimatedEndDate
        ? format(fc.estimatedEndDate, "dd/MM/yyyy", { locale: ptBR })
        : "não calculada";

      return {
        handled: true,
        replyText:
          `📦 *Previsão da Ração — ${snapshot.pet.name}*\n\n` +
          `• Produto: *${racao.name}*\n` +
          `• Saldo atual: *${racao.currentQuantity} ${racao.unit}*\n` +
          `• Duração estimada: *${daysStr}* (até cerca de *${endDateStr}*)\n` +
          `• Comprar até: *${fc.comprarAteLabel}* (${fc.status})`,
        actionTaken: "question_answered",
        nextState: "IDLE",
        usedGemini: false,
      };
    }

    // 1b. Status de medicamentos hoje
    if (clean.includes("remedio") || clean.includes("medicamento") || clean.includes("dose")) {
      if (snapshot.administrationsToday.length === 0) {
        return {
          handled: true,
          replyText: `💊 Não há medicamentos agendados para *${snapshot.pet.name}* hoje.`,
          actionTaken: "question_answered",
          nextState: "IDLE",
          usedGemini: false,
        };
      }
      const lines = snapshot.administrationsToday.map((a) => {
        const time = extractScheduledTime(a.scheduledAt);
        const icon =
          a.status === "administered" ? "✅" : a.status === "skipped" ? "❌" : "⏰";
        const who = a.administeredBy?.name ? ` (${a.administeredBy.name})` : "";
        const label =
          a.status === "administered"
            ? "Administrado"
            : a.status === "skipped"
            ? "Pulado"
            : "Agendado";
        return `${icon} *${a.medication?.name || "Medicamento"}* às ${time} — *${label}*${who}`;
      });
      return {
        handled: true,
        replyText: `💊 *Status dos Remédios Hoje — ${snapshot.pet.name}:*\n\n${lines.join("\n")}`,
        actionTaken: "question_answered",
        nextState: "IDLE",
        usedGemini: false,
      };
    }

    // 1c. Vacinas
    if (clean.includes("vacina")) {
      const vacs = snapshot.health.vaccines || [];
      if (vacs.length === 0) {
        return {
          handled: true,
          replyText: `💉 *${snapshot.pet.name}* não possui vacinas registradas ainda.`,
          actionTaken: "question_answered",
          nextState: "IDLE",
          usedGemini: false,
        };
      }
      const lines = vacs.map(
        (v) =>
          `• *${v.name}* (aplicada em ${v.applicationDate || "?"}${v.nextDueDate ? ` | próximo reforço: *${v.nextDueDate}*` : ""})`
      );
      return {
        handled: true,
        replyText: `💉 *Vacinas de ${snapshot.pet.name}:*\n\n${lines.join("\n")}`,
        actionTaken: "question_answered",
        nextState: "IDLE",
        usedGemini: false,
      };
    }

    // 1d. Peso
    if (clean.includes("peso") || clean.includes("pesando")) {
      const weights = [...snapshot.health.weights].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const historyLines = weights
        .slice(0, 3)
        .map((w) => `• ${format(new Date(w.date), "dd/MM/yyyy")}: *${w.weight} kg*`);
      return {
        handled: true,
        replyText:
          `⚖️ *Peso de ${snapshot.pet.name}:*\n` +
          `Atual: *${snapshot.pet.weight ? `${snapshot.pet.weight} kg` : "Não informado"}*\n` +
          (historyLines.length ? `\nÚltimos registros:\n${historyLines.join("\n")}` : ""),
        actionTaken: "question_answered",
        nextState: "IDLE",
        usedGemini: false,
      };
    }
  }

  // 1e. Receita / Novo Medicamento (antes de compra para capturar "Receitou X, comprei 20 comprimidos")
  const medCreation = parseMedicationFromText(messageText);
  if (medCreation) {
    const exec = await executeAssistantToolCall({
      convex,
      toolName: "create_medication",
      args: medCreation,
      snapshot,
      userId,
    });

    return {
      handled: true,
      replyText: exec.replyText,
      actionTaken: exec.actionTaken,
      nextState: exec.nextState || "IDLE",
      pendingActionPayload: exec.pendingActionPayload,
      usedGemini: false,
    };
  }

  // 1f. Vacina / Imunização aplicada
  const vaccineData = parseVaccineFromText(messageText);
  if (vaccineData) {
    const exec = await executeAssistantToolCall({
      convex,
      toolName: "record_vaccine",
      args: vaccineData,
      snapshot,
      userId,
    });

    return {
      handled: true,
      replyText: exec.replyText,
      actionTaken: exec.actionTaken,
      nextState: exec.nextState || "IDLE",
      pendingActionPayload: exec.pendingActionPayload,
      usedGemini: false,
    };
  }

  // 2. Exceção de Medicamento (cuspiu, não consegui dar, vomitou remédio, pulei, etc.)
  const isMedException =
    clean.includes("cuspiu") ||
    ((clean.includes("nao") || clean.includes("pulei") || clean.includes("esqueci") || clean.includes("vomitou")) &&
      (clean.includes("remedio") ||
        clean.includes("comprimido") ||
        clean.includes("dose") ||
        clean.includes("capsula") ||
        clean.includes("gota") ||
        snapshot.medications.some((m) => clean.includes(normalizeText(m.name)))));

  if (isMedException) {
    const timeMatch = clean.match(/(\d{1,2})\s*(?:h|hs|horas|:(\d{2}))/);
    const timeHint = timeMatch
      ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2] || "00"}`
      : clean.includes("manha") || clean.includes("cedo")
      ? "manha"
      : clean.includes("tarde")
      ? "tarde"
      : clean.includes("noite")
      ? "noite"
      : undefined;

    const matchedMed = snapshot.medications.find((m) =>
      clean.includes(normalizeText(m.name))
    );

    const exec = await executeAssistantToolCall({
      convex,
      toolName: "update_medication_dose",
      args: {
        medicationName: matchedMed?.name,
        scheduledTimeHint: timeHint,
        status: "skipped",
        reason: messageText.trim(),
      },
      snapshot,
      userId,
    });

    return {
      handled: true,
      replyText: exec.replyText,
      actionTaken: exec.actionTaken,
      nextState: exec.nextState || "IDLE",
      pendingActionPayload: exec.pendingActionPayload,
      usedGemini: false,
    };
  }

  // 3. Compra / Reposição de estoque
  if (
    clean.includes("comprei") ||
    clean.includes("compramos") ||
    clean.includes("chegou") ||
    clean.includes("repor") ||
    clean.includes("reposicao")
  ) {
    const qtyUnitMatch = clean.match(
      /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas|comprimidos?|capsulas?|ml|unidades?|un)?\b/
    );

    // Tentar descobrir qual item do estoque foi comprado ou extrair nome da frase
    let itemName = snapshot.inventory.find((i) =>
      clean.includes(normalizeText(i.name))
    )?.name;

    if (!itemName) {
      if (clean.includes("racao") || clean.includes("comida")) {
        itemName = "Ração";
      } else {
        const deMatch = messageText.match(/\bde\s+([A-Za-zÀ-ú0-9\s-]{2,30})$/i);
        itemName = deMatch ? deMatch[1].trim() : "Item de Pet";
      }
    }

    if (!qtyUnitMatch) {
      return {
        handled: true,
        replyText:
          `🛒 Qual foi a quantidade comprada de *${itemName}*?\n` +
          `_(Ex: *15kg*, *3kg*, *20 unidades*)_ ou responda *cancelar*.`,
        nextState: "WAITING_MISSING_QUANTITY",
        pendingActionPayload: JSON.stringify({ itemName }),
        usedGemini: false,
      };
    }

    const qty = parseFloat(qtyUnitMatch[1].replace(",", "."));
    const unit = qtyUnitMatch[2] || "unidades";

    const exec = await executeAssistantToolCall({
      convex,
      toolName: "record_purchase",
      args: { itemName, quantity: qty, unit, notes: messageText.trim() },
      snapshot,
      userId,
    });

    return {
      handled: true,
      replyText: exec.replyText,
      actionTaken: exec.actionTaken,
      nextState: exec.nextState || "IDLE",
      pendingActionPayload: exec.pendingActionPayload,
      usedGemini: false,
    };
  }

  // 4. Ajuste físico de estoque ("pesei o balde e tem 4,2kg", "contei a cartela e só têm 6 comprimidos")
  const isPhysicalStockCheck =
    (clean.includes("balde") ||
      clean.includes("pote") ||
      clean.includes("saco") ||
      clean.includes("cartela") ||
      clean.includes("caixa") ||
      clean.includes("estoque") ||
      clean.includes("contei")) &&
    (clean.includes("tem ") ||
      clean.includes("restam") ||
      clean.includes("sobrou") ||
      clean.includes("sobraram") ||
      clean.includes("so tem") ||
      clean.includes("so estao"));

  if (isPhysicalStockCheck) {
    const qtyMatch = clean.match(
      /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas|comprimidos?|capsulas?|ml|unidades?|un)?\b/
    );
    if (qtyMatch) {
      const qty = parseFloat(qtyMatch[1].replace(",", "."));
      const unit = qtyMatch[2];
      const matchedItem = snapshot.inventory.find((i) =>
        clean.includes(normalizeText(i.name))
      );
      const itemName =
        matchedItem?.name ||
        (clean.includes("comprimido") || clean.includes("cartela")
          ? snapshot.inventory.find((i) => i.category === "medicamento")?.name
          : "racao");

      const exec = await executeAssistantToolCall({
        convex,
        toolName: "adjust_stock",
        args: { itemName, newQuantity: qty, unit, notes: messageText.trim() },
        snapshot,
        userId,
      });

      return {
        handled: true,
        replyText: exec.replyText,
        actionTaken: exec.actionTaken,
        nextState: exec.nextState || "IDLE",
        pendingActionPayload: exec.pendingActionPayload,
        usedGemini: false,
      };
    }
  }

  // 5. Exceção de Alimentação (frações, jejum, sobras)
  const feedingException = parseFeedingExceptionFromText(clean);
  if (feedingException) {
    const exec = await executeAssistantToolCall({
      convex,
      toolName: "record_feeding_exception",
      args: {
        quantityNotConsumedGrams: feedingException.quantityNotConsumedGrams,
        fractionOfMealNotConsumed: feedingException.fraction,
        reason: feedingException.reason,
      },
      snapshot,
      userId,
    });
    return {
      handled: true,
      replyText: exec.replyText,
      actionTaken: exec.actionTaken,
      nextState: exec.nextState || "IDLE",
      pendingActionPayload: exec.pendingActionPayload,
      usedGemini: false,
    };
  }

  // 5a-config. Configuração de consumo diário ("O consumo diário de ração é 240g", "come 240g por dia")
  const isDailyConfig =
    (clean.includes("consumo diario") ||
      clean.includes("por dia") ||
      clean.includes("diariamente") ||
      clean.includes("porcao diaria") ||
      /\bcome\s+\d+/.test(clean)) &&
    !clean.includes("nao ") &&
    !clean.includes("comeu");

  if (isDailyConfig) {
    const dailyQtyMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas)?\b/);
    if (dailyQtyMatch) {
      const rawQty = parseFloat(dailyQtyMatch[1].replace(",", "."));
      const unit = normalizeUnit(dailyQtyMatch[2] || "g");
      const grams = unit === "kg" ? Math.round(rawQty * 1000) : rawQty;
      if (grams > 0) {
        const exec = await executeAssistantToolCall({
          convex,
          toolName: "update_daily_consumption",
          args: { dailyQuantityGrams: grams },
          snapshot,
          userId,
        });
        return {
          handled: true,
          replyText: exec.replyText,
          actionTaken: exec.actionTaken,
          nextState: exec.nextState || "IDLE",
          pendingActionPayload: exec.pendingActionPayload,
          usedGemini: false,
        };
      }
    }
  }

  // 5b. Consumo explícito de ração ("O Rex comeu 200g", "dei 300g de ração")
  const explicitFeedingMatch = clean.match(
    /(?:comeu|alimentei|dei|coloquei)\s+(?:cerca\s+de\s+)?(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas)?\b/
  );
  if (
    explicitFeedingMatch &&
    !clean.includes("nao ") &&
    !clean.includes("remedio") &&
    !clean.includes("comprimido")
  ) {
    const rawQty = parseFloat(explicitFeedingMatch[1].replace(",", "."));
    const unit = normalizeUnit(explicitFeedingMatch[2] || "g");
    const grams = unit === "kg" ? Math.round(rawQty * 1000) : rawQty;
    if (grams > 0) {
      const exec = await executeAssistantToolCall({
        convex,
        toolName: "record_feeding_consumption",
        args: { quantityGrams: grams, notes: messageText.trim() },
        snapshot,
        userId,
      });
      return {
        handled: true,
        replyText: exec.replyText,
        actionTaken: exec.actionTaken,
        nextState: exec.nextState || "IDLE",
        pendingActionPayload: exec.pendingActionPayload,
        usedGemini: false,
      };
    }
  }

  // 5c. Peso explícito em frases livres ("O Tonico pesa 12,7kg", "O Rex pesou 32,5kg", "está com 18kg")
  const explicitWeightInSentence = clean.match(
    /(?:pesou|pesei|pesa|peso(?:\s+de|\s+atual)?|pesando|esta\s+com|ta\s+com)\s+(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|quilos?)?\b/
  );
  if (explicitWeightInSentence) {
    const val = parseFloat(explicitWeightInSentence[1].replace(",", "."));
    if (!isNaN(val) && val > 0 && val < 200) {
      const exec = await executeAssistantToolCall({
        convex,
        toolName: "record_weight",
        args: { weightKg: val, notes: messageText.trim() },
        snapshot,
        userId,
      });
      return {
        handled: true,
        replyText: exec.replyText,
        actionTaken: exec.actionTaken,
        nextState: "IDLE",
        usedGemini: false,
      };
    }
  }

  // 6. Nota clínica / diário de sintomas
  const isClinicalNote =
    clean.startsWith("anota") ||
    clean.startsWith("registra no prontuario") ||
    clean.includes("diarreia") ||
    clean.includes("cocando") ||
    clean.includes("coceira") ||
    clean.includes("orelha") ||
    clean.includes("mancando") ||
    clean.includes("vomitou") ||
    clean.includes("vomito") ||
    clean.includes("apatia") ||
    clean.includes("apatico") ||
    clean.includes("tosse") ||
    clean.includes("espirr");

  if (isClinicalNote) {
    const cleanedContent = messageText
      .replace(/^(?:anota\s+(?:a[ií]\s+)?(?:que\s+)?|nota\s*:\s*)/i, "")
      .trim();

    const exec = await executeAssistantToolCall({
      convex,
      toolName: "record_clinical_note",
      args: { content: cleanedContent || messageText.trim() },
      snapshot,
      userId,
    });

    return {
      handled: true,
      replyText: exec.replyText,
      actionTaken: exec.actionTaken,
      nextState: "IDLE",
      usedGemini: false,
    };
  }

  return {
    handled: false,
    replyText: "",
    nextState: "IDLE",
    usedGemini: false,
  };
}

/**
 * Processa mensagens em linguagem natural (texto, áudio ou imagem) usando Gemini 3.8 Flash
 * e faz fallback transparente para o motor semântico contextual em português.
 */
export async function processNaturalLanguageWithAI(params: {
  convex: ConvexHttpClient;
  messageText: string;
  currentPet: any;
  allPets: any[];
  userId: any;
  mediaType?: "audio" | "image";
  mediaBase64?: string;
  mediaMimeType?: string;
}): Promise<AiAssistantResult> {
  const {
    convex,
    messageText,
    currentPet,
    allPets,
    userId,
    mediaType,
    mediaBase64,
    mediaMimeType,
  } = params;
  const snapshot = await buildPetContextSnapshot(convex, currentPet, allPets);

  const normalizedPlaceholder = normalizeText(messageText);
  const hasMeaningfulCaption =
    Boolean(messageText.trim()) &&
    normalizedPlaceholder !== "[audio recebido]" &&
    normalizedPlaceholder !== "[imagem recebida]";

  const mediaPrefix =
    mediaType === "audio"
      ? "🎙️ *Áudio processado:*\n\n"
      : mediaType === "image"
      ? "📸 *Imagem analisada:*\n\n"
      : "";

  // Caminho ultrarrápido (<300ms): tentar NLU contextual primeiro quando há texto/legenda
  if (!mediaType || hasMeaningfulCaption) {
    const nluRes = await interpretWithContextualNlu(messageText, snapshot, convex, userId);
    if (nluRes.handled) {
      return mediaType
        ? {
            ...nluRes,
            replyText: `${mediaType === "audio" ? "🎙️ *Áudio interpretado:*\n\n" : "📸 *Imagem interpretada:*\n\n"}${nluRes.replyText}`,
          }
        : nluRes;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const client = new GoogleGenAI({ apiKey });

      let interactionInput: any = messageText;
      if (mediaType === "audio" && mediaBase64) {
        interactionInput = [
          {
            type: "audio" as const,
            data: mediaBase64,
            mime_type: mediaMimeType || "audio/ogg",
          },
          {
            type: "text" as const,
            text: hasMeaningfulCaption
              ? messageText
              : "Este é um áudio de voz enviado pelo tutor no WhatsApp. Identifique todas as ações ou perguntas mencionadas no áudio e acione as ferramentas correspondentes.",
          },
        ];
      } else if (mediaType === "image" && mediaBase64) {
        interactionInput = [
          {
            type: "image" as const,
            data: mediaBase64,
            mime_type: mediaMimeType || "image/jpeg",
          },
          {
            type: "text" as const,
            text: hasMeaningfulCaption
              ? messageText
              : "Analise esta imagem enviada pelo tutor no WhatsApp (pode ser uma receita veterinária, carteira de vacinação, rótulo/saco de ração ou anotação clínica). Extraia os dados e chame a ferramenta correspondente (create_medication, record_vaccine, record_purchase ou record_clinical_note).",
          },
        ];
      }

      const interaction = await client.interactions.create({
        model: AI_MODEL_NAME,
        system_instruction: buildSystemInstruction(snapshot),
        input: interactionInput,
        tools: ASSISTANT_TOOLS,
        generation_config: { thinking_level: "minimal" },
        store: false,
      });

      const functionCalls = (interaction.steps || []).filter(
        (step): step is Extract<typeof step, { type: "function_call" }> =>
          step.type === "function_call"
      );

      if (functionCalls.length > 0) {
        const replies: string[] = [];
        const actions: string[] = [];
        let nextState = "IDLE";
        let pendingActionPayload: string | undefined;

        for (const call of functionCalls) {
          const exec = await executeAssistantToolCall({
            convex,
            toolName: call.name,
            args: call.arguments || {},
            snapshot,
            userId,
          });
          replies.push(exec.replyText);
          if (exec.actionTaken) actions.push(exec.actionTaken);
          if (exec.nextState && exec.nextState !== "IDLE") {
            nextState = exec.nextState;
            pendingActionPayload = exec.pendingActionPayload;
          }
        }

        return {
          handled: true,
          replyText: `${mediaPrefix}${replies.join("\n\n")}`,
          actionTaken: actions.length > 0 ? actions.join(",") : undefined,
          nextState,
          pendingActionPayload,
          usedGemini: true,
        };
      }

      if (interaction.output_text && interaction.output_text.trim()) {
        return {
          handled: true,
          replyText: `${mediaPrefix}${interaction.output_text.trim()}`,
          actionTaken: "ai_reply",
          nextState: "IDLE",
          usedGemini: true,
        };
      }
    } catch (aiErr) {
      console.error("[WhatsApp AI Assistant] Erro ao consultar Gemini:", aiErr);
    }
  }

  if (mediaType && !hasMeaningfulCaption) {
    const mediaLabel = mediaType === "audio" ? "áudio" : "foto/receita";
    return {
      handled: true,
      replyText:
        `📎 Recebi seu *${mediaLabel}* para *${currentPet.name}*!\n\n` +
        `Para interpretar áudios e fotos automaticamente sem legenda, configure a variável \`GEMINI_API_KEY\` na Vercel.\n` +
        `💡 _Dica: você também pode reenviar com uma legenda curta (ex: "Tomou vacina V10" ou "Receitou Apoquel 5,4mg 12/12h")._`,
      actionTaken: "media_needs_key_or_caption",
      nextState: "IDLE",
      usedGemini: false,
    };
  }

  return {
    handled: false,
    replyText: "",
    nextState: "IDLE",
    usedGemini: false,
  };
}
