import { ConvexHttpClient } from "convex/browser";
import { GoogleGenAI } from "@google/genai";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { api } from "../../convex/_generated/api";
import { calculateStockForecast, StockCalculationResult } from "./stockCalculation";
import {
  ALL_NOTIFICATION_CATEGORY_KEYS,
  formatNotificationPreferencesSummary,
  getCategoryMeta,
  NotificationCategory,
  NotificationPreferences,
  parseNotificationCategoriesFromText,
  resolveNotificationPreferences,
} from "./notificationPreferences";

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
  newActivePetId?: string;
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

function stripDosageAndParens(raw: string): string {
  return normalizeText(raw)
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b\d+(?:[.,]\d+)?\s*(?:mg\/ml|mcg\/ml|mg|mcg|g|kg|ml|ui|un|unidades?|comprimidos?|capsulas?|doses?)\b/g,
      " "
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hasWordInNormalizedText(normText: string, phrase: string): boolean {
  if (!phrase || phrase.length < 2) return false;
  const rx = new RegExp(`(?:^|\\b|\\s)${escapeRegex(phrase)}(?:$|\\b|\\s)`, "i");
  return rx.test(normText);
}

const INVENTORY_STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "dos",
  "das",
  "um",
  "uma",
  "o",
  "a",
  "os",
  "as",
  "saco",
  "pacote",
  "caixa",
  "cartela",
  "frasco",
  "balde",
  "pote",
  "racao",
  "comida",
  "remedio",
  "medicamento",
  "comprimido",
  "comprimidos",
  "capsula",
  "capsulas",
  "estoque",
  "atual",
  "saldo",
  "qual",
  "quanto",
  "quantos",
  "para",
  "com",
  "sobre",
  "ainda",
  "tem",
]);

export function findInventoryMatchesInMessage(
  messageText: string,
  snapshot: PetContextSnapshot
): InventoryWithForecast[] {
  const normMsg = normalizeText(messageText);
  if (!normMsg || !snapshot.inventory.length) return [];

  const matched: InventoryWithForecast[] = [];
  for (const item of snapshot.inventory) {
    const fullName = normalizeText(item.name);
    const baseName = stripDosageAndParens(item.name);

    if (
      (fullName.length >= 3 && hasWordInNormalizedText(normMsg, fullName)) ||
      (baseName.length >= 3 && hasWordInNormalizedText(normMsg, baseName))
    ) {
      matched.push(item);
      continue;
    }

    const tokens = baseName
      .split(/[\s,.-]+/)
      .filter((t) => t.length >= 4 && !INVENTORY_STOPWORDS.has(t));
    if (tokens.some((tok) => hasWordInNormalizedText(normMsg, tok))) {
      matched.push(item);
    }
  }

  return matched;
}

function extractStockQuantityAndUnit(
  cleanText: string
): { quantity: number; unit?: string } | null {
  const sanitized = cleanText
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:mg\/ml|mcg\/ml|mg|mcg|ui)\b/gi, " ")
    .replace(/r\$\s*\d+(?:[.,]\d{1,2})?/gi, " ")
    .replace(/\b\d+(?:[.,]\d{1,2})?\s*reais\b/gi, " ")
    .replace(/\bpor\s+\d+(?:[.,]\d{1,2})?(?!\s*(?:kg|kilos?|quilos?|g|gramas|comprimidos?|capsulas?|gotas?|ml|unidades?|un|dias?))\b/gi, " ");
  const preferredMatch = sanitized.match(
    /(?:para|como|em|:\s*|=\s*|\be\s+|\bsao\s+|\btem\s+|\brestam\s+|\bsobr(?:ou|aram)\s+|compr(?:ei|amos)\s+(?:mais\s+)?|cheg(?:ou|aram)\s+|adicionei\s+|repus\s+)\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas|comprimidos?|capsulas?|gotas?|ml|unidades?|un)?\b/i
  );
  const match =
    preferredMatch ||
    sanitized.match(
      /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas|comprimidos?|capsulas?|gotas?|ml|unidades?|un)?\b/i
    );
  if (!match) return null;
  const quantity = parseFloat(match[1].replace(",", "."));
  if (isNaN(quantity)) return null;
  return { quantity, unit: match[2] };
}

function formatInventoryItemDetail(
  item: InventoryWithForecast,
  petName: string
): string {
  const fc = item.forecast;
  const daysStr =
    fc.daysRemaining === Infinity
      ? "sob demanda"
      : `${Math.round(fc.daysRemaining)} dia(s)`;
  const endDateStr = fc.estimatedEndDate
    ? format(fc.estimatedEndDate, "dd/MM/yyyy", { locale: ptBR })
    : "não calculada";
  const icon =
    item.category === "racao" ? "🥣" : item.category === "medicamento" ? "💊" : "📦";

  return (
    `${icon} *Estoque de ${item.name} — ${petName}*\n\n` +
    `• Saldo atual: *${item.currentQuantity} ${item.unit}*\n` +
    `• Consumo diário: *${item.dailyConsumption} ${item.unit}/dia*\n` +
    `• Duração estimada: *${daysStr}*${
      fc.estimatedEndDate ? ` (término em *${endDateStr}*)` : ""
    }\n` +
    `• Comprar até: *${fc.comprarAteLabel}* • Status: *${fc.status}*\n\n` +
    `💡 _Para interagir, você pode enviar:_\n` +
    `• _"Comprei 30 ${item.unit} de ${item.name}"_\n` +
    `• _"Atualiza o estoque de ${item.name} para 20 ${item.unit}"_`
  );
}

function findMatchingInventoryCandidates(
  inventory: InventoryWithForecast[],
  itemName?: string,
  preferredCategory?: string
): InventoryWithForecast[] {
  if (!inventory.length) return [];

  if (itemName) {
    const cleanTarget = normalizeText(itemName);
    const baseTarget = stripDosageAndParens(itemName);

    const exactMatch = inventory.find((item) => {
      const full = normalizeText(item.name);
      const base = stripDosageAndParens(item.name);
      return (
        full === cleanTarget ||
        (base && (base === cleanTarget || (baseTarget && base === baseTarget)))
      );
    });
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

    const tokens = (baseTarget || cleanTarget)
      .split(/[\s,.-]+/)
      .filter((t) => t.length >= 3 && !INVENTORY_STOPWORDS.has(t));

    const matched: InventoryWithForecast[] = [];
    for (const item of inventory) {
      const cleanName = normalizeText(item.name);
      const baseName = stripDosageAndParens(item.name);
      if (
        cleanName.includes(cleanTarget) ||
        cleanTarget.includes(cleanName) ||
        (baseTarget &&
          baseName &&
          (baseName.includes(baseTarget) || baseTarget.includes(baseName)))
      ) {
        matched.push(item);
        continue;
      }
      if (tokens.some((tok) => cleanName.includes(tok) || baseName.includes(tok))) {
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

  if (
    !isVaccineIntent ||
    /\b(?:agend(?:a|e|ar)|marc(?:a|e|ar)|exclu(?:i|a|ir)|apag(?:a|ue|ar)|delet(?:a|e|ar)|remov(?:a|e|er)|cancel(?:a|e|ar)|edit(?:a|e|ar)|alter(?:a|e|ar))\b/.test(
      clean
    )
  ) {
    return null;
  }

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

export interface ParsedMedicationInput {
  name: string;
  dosage?: string;
  unit?: string;
  times: string[];
  quantityPerAdministration: number;
  initialStockQuantity: number;
  veterinarian?: string;
  instructions?: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPetReferences(text: string, petNames: string[] = []): string {
  let result = text.trim();
  const sortedPets = [...petNames]
    .filter((p) => p && p.trim().length > 0)
    .sort((a, b) => b.length - a.length);

  for (const pet of sortedPets) {
    const escaped = escapeRegex(pet.trim());
    result = result
      .replace(new RegExp(`^(?:o|a|para\\s+o|para\\s+a|pro|pra)?\\s*${escaped}\\s*[,:-]?\\s*`, "i"), "")
      .replace(new RegExp(`\\s*(?:para\\s+o|para\\s+a|pro|pra|no|na|do|da)\\s+${escaped}\\b.*$`, "i"), "")
      .trim();
  }
  return result;
}

function extractTimesAndFrequency(text: string): { times: string[]; hasExplicitHint: boolean } {
  const explicitTimes: string[] = [];
  const clean = normalizeText(text);
  const timeRegex = /(?<!em\s)(?<!cada\s)\b(\d{1,2})\s*(?:h\b|:(\d{2}))/gi;
  let tm: RegExpExecArray | null;
  while ((tm = timeRegex.exec(text)) !== null) {
    const h = parseInt(tm[1], 10);
    const min = tm[2] || "00";
    if (h >= 0 && h <= 23) {
      const hh = h.toString().padStart(2, "0");
      const slot = `${hh}:${min}`;
      if (!explicitTimes.includes(slot)) explicitTimes.push(slot);
    }
  }

  if (explicitTimes.length === 0) {
    if (clean.includes("de manha") && clean.includes("a noite")) {
      return { times: ["08:00", "20:00"], hasExplicitHint: true };
    }
    if (clean.includes("a noite") || clean.includes("de noite") || clean.includes("antes de dormir")) {
      return { times: ["20:00"], hasExplicitHint: true };
    }
    if (clean.includes("de tarde") || clean.includes("a tarde")) {
      return { times: ["14:00"], hasExplicitHint: true };
    }
  }

  const hasFreqHint =
    explicitTimes.length > 0 ||
    clean.includes("12 em 12") ||
    clean.includes("12/12") ||
    clean.includes("8 em 8") ||
    clean.includes("8/8") ||
    clean.includes("6 em 6") ||
    clean.includes("6/6") ||
    clean.includes("2x") ||
    clean.includes("duas vezes") ||
    clean.includes("3x") ||
    clean.includes("tres vezes") ||
    clean.includes("4x") ||
    clean.includes("quatro vezes");

  const normalizedHint = clean.replace(/\b12\/12h?\b/g, "12 em 12h").replace(/\b8\/8h?\b/g, "8 em 8h").replace(/\b6\/6h?\b/g, "6 em 6h");
  return {
    times: normalizeMedicationTimes(explicitTimes, normalizedHint),
    hasExplicitHint: hasFreqHint,
  };
}

function isScheduleOrModifierOnlyFragment(fragment: string): boolean {
  const clean = normalizeText(fragment)
    .replace(/\b(?:comprei|caixa\s+com|frasco\s+com|com|estoque\s+de)\s*\d+(?:[.,]\d+)?\s*(?:comprimidos?|capsulas?|doses?|gotas?|ml|unidades?)\b/gi, "")
    .replace(/\b(?:de|a\s+cada|cada)?\s*\d{1,2}(?:\/\d{1,2}|\s+em\s+\d{1,2})\s*h?(?:oras)?\b/gi, "")
    .replace(/\b(?:as|a|das|de|por|ao|no|na)?\s*\d{1,2}\s*(?:h\b|hs\b|horas\b|:\d{2})/gi, "")
    .replace(/\b(?:1x|2x|3x|4x|uma\s+vez|duas\s+vezes|tres\s+vezes|ao\s+dia|por\s+dia|todo\s+dia|diariamente|de\s+manha|pela\s+manha|a\s+tarde|de\s+tarde|a\s+noite|de\s+noite|antes\s+de\s+dormir|jejum|com\s+comida|apos\s+comer|meio|metade)\b/gi, "")
    .replace(/[^a-z]/g, "")
    .trim();
  return clean.length < 2;
}

function parseMedicationsFromText(
  messageText: string,
  petNames: string[] = []
): ParsedMedicationInput[] {
  const clean = normalizeText(messageText);

  // Ignorar perguntas e exceções/negações ("não toma", "não dei", "cuspiu", "pulei")
  if (
    clean.includes("?") ||
    /\b(?:nao|nunca|deixou\s+de|parou\s+de|pulei|esqueci|cuspiu|vomitou)\b/.test(clean)
  ) {
    return [];
  }

  const isPetRegistrationText =
    (/\b(?:novo\s+pet|nova\s+pet|pet\s+chamad[oa]|de\s+estimacao|adotei|resgatei)\b/.test(clean) ||
      /\b(?:cadastre|cadastra|cadastrar|adiciona|adicionar)\s+(?:o\s+|a\s+|um\s+|uma\s+)?(?:meu\s+|minha\s+)?(?:pet|animal|bich[oa]|bichinh[oa]|mascote)\b/.test(
        clean
      )) &&
    !clean.includes("remedio") &&
    !clean.includes("medicamento");

  if (isPetRegistrationText) {
    return [];
  }

  const hasFormalMedTrigger =
    clean.includes("receitou") ||
    clean.includes("prescreveu") ||
    clean.includes("prescricao") ||
    clean.startsWith("receita") ||
    clean.includes("novo remedio") ||
    clean.includes("novo medicamento") ||
    clean.includes("iniciar tratamento") ||
    clean.includes("comecar tratamento") ||
    /\b(?:cadastre|cadastra|cadastrar|adiciona|adicionar)\s+(?:o\s+|a\s+|os\s+|as\s+)?(?:remedios?|medicamentos?|tratamentos?)\b/.test(
      clean
    );

  const hasDosageOrMedUnit =
    /\b\d+(?:[.,]\d+)?\s*(?:mg\/ml|mcg\/ml|mg|ml|mcg|ui)\b/.test(clean) ||
    /\b(?:remedio|medicamento|comprimidos?|capsulas?|gotas?|colirio|pomada)\b/.test(clean);

  const isRoutineVerbWithMed =
    /\b(?:toma|tomando|tomar|faz\s+uso\s+de|usa|usando|cadastre|cadastra|cadastrar)\b/.test(
      clean
    ) &&
    hasDosageOrMedUnit &&
    !clean.includes("vacina") &&
    !clean.includes("antirrabica") &&
    !clean.includes("vermifugo") &&
    !clean.includes("antipulgas");

  if (!hasFormalMedTrigger && !isRoutineVerbWithMed) {
    return [];
  }

  // Extrair corpo após o verbo/gatilho principal
  let body = messageText.trim();
  const triggerRegex =
    /(?:receitou|prescreveu|prescri[çc][ãa]o\s*:?|receita\s*:?|novos?\s+rem[eé]dios?\s*:?|novos?\s+medicamentos?\s*:?|iniciar\s+tratamento\s+com|come[çc]ar\s+tratamento\s+com|cadastre(?:\s+os?|\s+as?)?(?:\s+rem[eé]dios?|\s+medicamentos?)?|cadastrar(?:\s+rem[eé]dios?|\s+medicamentos?)?|faz\s+uso\s+de|est[aá]\s+tomando|come[çc]ou\s+a\s+tomar|toma(?:\s+atualmente|\s+todo\s+dia|\s+diariamente)?|tomando|usa(?:\s+atualmente)?)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)$/i;
  const triggerMatch = body.match(triggerRegex);
  if (triggerMatch?.[1]) {
    body = triggerMatch[1].trim();
  }

  body = stripPetReferences(body, petNames);

  const vetMatch = messageText.match(
    /\b(?:dr\.?|dra\.?|vet\.?|veterin[aá]ri[oa])\s+([A-Za-zÀ-ú\s]{2,25}?)(?=,|\.|$)/i
  );
  if (vetMatch) {
    body = body.replace(vetMatch[0], "").trim();
  }

  const globalStockMatch = clean.match(
    /(?:comprei|caixa\s+com|frasco\s+com|estoque\s+de)\s*(\d+(?:[.,]\d+)?)\s*(comprimidos?|capsulas?|doses?|gotas?|ml|unidades?)\b/
  );
  const globalTimesInfo = extractTimesAndFrequency(messageText);

  // Separar múltiplos medicamentos por " e ", vírgula (fora de decimais como 5,4mg), ";" ou quebra de linha
  const rawParts = body
    .split(/\s+e\s+|(?<!\d)\s*,\s*(?!\d)|\s*;\s*|\s*\n+\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const mergedParts: string[] = [];
  for (const part of rawParts) {
    if (mergedParts.length > 0 && isScheduleOrModifierOnlyFragment(part)) {
      mergedParts[mergedParts.length - 1] = `${mergedParts[mergedParts.length - 1]} e ${part}`;
    } else {
      mergedParts.push(part);
    }
  }

  const parsedResults: ParsedMedicationInput[] = [];

  for (const part of mergedParts) {
    const cleanPart = normalizeText(part);
    const dosageMatch = part.match(
      /(\d+(?:[.,]\d+)?\s*(?:mg\/ml|mcg\/ml|mg|ml|mcg|ui))/i
    );
    const dosage = dosageMatch ? dosageMatch[1].replace(/\s+/g, "") : undefined;

    let medName = part
      .replace(/^(?:o|a|os|as|um|uma|comprimido\s+de|remedio\s+|medicamento\s+)\s*/i, "")
      .trim();

    const cutMatch = medName.match(
      /^([A-Za-zÀ-ú][A-Za-zÀ-ú0-9\s-]{1,32}?)(?=\s+\d|\s+de\s+\d|\s+(?:cada|a\s+cada|todo\s+dia|diariamente|por\s+dia|ao\s+dia|em\s+\d|\(|às\b|as\b)|,|\.|$)/i
    );
    if (cutMatch?.[1]?.trim()) {
      medName = cutMatch[1].trim();
    }

    medName = stripPetReferences(medName, petNames).replace(/^(?:o|a)\s+/i, "").trim();
    if (!medName || medName.length < 2) continue;

    const partTimesInfo = extractTimesAndFrequency(part);
    const times = partTimesInfo.hasExplicitHint
      ? partTimesInfo.times
      : globalTimesInfo.times;

    const partStockMatch = cleanPart.match(
      /(?:comprei|caixa\s+com|frasco\s+com|com|estoque\s+de)\s*(\d+(?:[.,]\d+)?)\s*(comprimidos?|capsulas?|doses?|gotas?|ml|unidades?)\b/
    );
    const effectiveStock = partStockMatch || globalStockMatch;

    const unit = effectiveStock
      ? normalizeUnit(effectiveStock[2])
      : cleanPart.includes("gota") || clean.includes("gota")
      ? "gotas"
      : /\b\d+(?:[.,]\d+)?\s*ml\b/i.test(part)
      ? "ml"
      : "comprimidos";

    const initialStockQuantity = effectiveStock
      ? parseFloat(effectiveStock[1].replace(",", "."))
      : 10;

    const cleanWithoutStock = partStockMatch
      ? cleanPart.replace(partStockMatch[0], " ")
      : cleanPart;
    const dosePerAdminMatch = cleanWithoutStock.match(
      /(\d+(?:[.,]\d+)?)\s*(?:comprimido|capsula|dose|gota)/
    );
    const quantityPerAdministration = dosePerAdminMatch
      ? parseFloat(dosePerAdminMatch[1].replace(",", "."))
      : cleanWithoutStock.includes("meio comprimido") || cleanWithoutStock.includes("1/2")
      ? 0.5
      : 1;

    parsedResults.push({
      name: medName.charAt(0).toUpperCase() + medName.slice(1),
      dosage,
      unit,
      times,
      quantityPerAdministration,
      initialStockQuantity,
      veterinarian: vetMatch ? vetMatch[1].trim() : undefined,
      instructions: messageText.trim(),
    });
  }

  return parsedResults;
}

const PET_SPECIES_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:sarues?|gambas?)\b/i, "Saruê"],
  [/\b(?:gat[oa]s?|felin[oa]s?|gatinh[oa]s?)\b/i, "Gato"],
  [/\b(?:cao|caes|cachorr[oa]s?|cadel[ao]s?|cachorrinh[oa]s?|canin[oa]s?)\b/i, "Cão"],
  [/\b(?:aves?|passaros?|passarinh[oa]s?|calopsitas?|papagaios?|periquitos?)\b/i, "Ave"],
  [/\b(?:coelhos?|hamsters?|roedor(?:es)?|porquinh[oa]s?(?:\s+da\s+india)?|chinchilas?)\b/i, "Roedor"],
  [/\b(?:jabutis?|tartarugas?|cagados?|rept(?:il|eis)|iguanas?)\b/i, "Réptil"],
  [/\b(?:furao|furoes|ferrets?)\b/i, "Furão"],
  [/\b(?:peixes?|bettas?)\b/i, "Peixe"],
];

function getDefaultPetPhoto(species: string): string {
  const s = normalizeText(species);
  if (s.includes("gato")) {
    return "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500&auto=format&fit=crop&q=80";
  }
  if (s.includes("ave")) {
    return "https://images.unsplash.com/photo-1522858547137-f1dcec554f55?w=500&auto=format&fit=crop&q=80";
  }
  if (s.includes("sarue") || s.includes("roedor") || s.includes("furao")) {
    return "https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=500&auto=format&fit=crop&q=80";
  }
  return "https://images.unsplash.com/photo-1552053831-71594a27632d?w=500&auto=format&fit=crop&q=80";
}

function hasPetProfileOrSpeciesIndicator(cleanText: string): boolean {
  if (
    /\b(?:pet|animal|bich[oa]|bichinh[oa]|de\s+estimacao|mascote|adotei|resgatei)\b/.test(
      cleanText
    )
  ) {
    return true;
  }
  return PET_SPECIES_PATTERNS.some(([rx]) => rx.test(cleanText));
}

export interface ParsedPetCreationInput {
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  weightKg?: number;
  notes?: string;
}

export function parsePetCreationFromText(
  messageText: string,
  existingPetNames: string[] = []
): ParsedPetCreationInput | null {
  const trimmed = messageText.trim();
  const clean = normalizeText(trimmed);
  if (!clean || clean.includes("?")) return null;

  // Nunca roubar frases explícitas de medicamentos, vacinas, ração ou exclusão/edição
  if (
    /^(?:exclu|apag|delet|remov|edit|alter|mud|atualiz|agend|marc|trocar|mudar|vincular|entrar)\b/.test(
      clean
    ) ||
    /\b(?:remedio|medicamento|comprimid|capsul|gotas|vacina|racao|petisco|consulta|exame|lista\s+de\s+compras|no\s+estoque|em\s+estoque)\b/.test(
      clean
    )
  ) {
    return null;
  }

  const hasExplicitPetTrigger =
    /\b(?:novo\s+pet|nova\s+pet|pet\s+chamad[oa]|de\s+estimacao|adotei|resgatei)\b/.test(
      clean
    ) ||
    /\b(?:cadastre|cadastra|cadastrar|adiciona|adicionar|inclui|incluir|registra|registrar)\s+(?:o\s+|a\s+|um\s+|uma\s+)?(?:meu\s+|minha\s+)?(?:nov[oa]\s+)?(?:pet|animal|bich[oa]|bichinh[oa]|mascote)\b/.test(
      clean
    ) ||
    /\b(?:cadastre|cadastra|cadastrar|adiciona|adicionar|registra|registrar|tenho\s+um|tenho\s+uma|ganhei)\b/.test(
      clean
    ) && PET_SPECIES_PATTERNS.some(([rx]) => rx.test(clean));

  if (!hasExplicitPetTrigger) return null;

  let species = "Cão";
  for (const [rx, label] of PET_SPECIES_PATTERNS) {
    if (rx.test(clean)) {
      species = label;
      break;
    }
  }

  const weightMatch = trimmed.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|quilos?)\b/i);
  const weightKg = weightMatch ? parseFloat(weightMatch[1].replace(",", ".")) : undefined;

  const sex = /\b(?:femea|cadela|gata|menina)\b/i.test(clean)
    ? "Fêmea"
    : /\b(?:macho|menino)\b/i.test(clean)
    ? "Macho"
    : undefined;

  const breedMatch = trimmed.match(/\bra[çc]a\s+([A-Za-zÀ-ú][A-Za-zÀ-ú0-9\s-]{1,25}?)(?=,|\.|macho|f[eê]mea|\d+\s*kg|$)/i);
  const breed = breedMatch?.[1]?.trim()
    ? breedMatch[1].trim()
    : /\b(?:srd|vira[-\s]?lata)\b/i.test(clean)
    ? "SRD"
    : undefined;

  let extractedName = "";
  const calledMatch = trimmed.match(
    /(?:chamad[oa]|se\s+chama|de\s+nome)\s+([A-Za-zÀ-ú][A-Za-zÀ-ú0-9\s-]{1,25}?)(?=\s*(?:,|;|de\s+\d|\d+\s*kg|\be\b|\bcom\b|\bmeu\b|\bminha\b|\bmacho\b|\bf[eê]mea\b|\bra[çc]a\b|$))/i
  );
  const cadastrePetMatch = trimmed.match(
    /^(?:cadastre|cadastra|cadastrar|adiciona|adicionar|inclui|incluir|registra|registrar)\s+(?:(?:o|a|um|uma)\s+)?(?:(?:nov[oa])\s+)?(?:(?:pet|animal|bich[oa]|bichinh[oa]|mascote)\s*(?::|-|\s)\s*)?(?:(?:o|a)\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú0-9\s-]{1,25}?)(?=\s*(?:,|;|\bmeu\b|\bminha\b|\bum\b|\buma\b|c[ãa]o|cachorr[oa]|gat[oa]|saru[eê]|ave|roedor|\bde\s+estima|\d+\s*kg|$))/i
  );

  if (calledMatch?.[1]?.trim()) {
    extractedName = calledMatch[1].trim();
  } else if (cadastrePetMatch?.[1]?.trim()) {
    const candidate = cadastrePetMatch[1].trim();
    const candidateClean = normalizeText(candidate);
    if (!PET_SPECIES_PATTERNS.some(([rx]) => rx.test(candidateClean)) && candidateClean !== "pet" && candidateClean !== "novo pet") {
      extractedName = candidate;
    }
  }

  if (!extractedName) {
    let residual = trimmed;
    if (weightMatch) residual = residual.replace(weightMatch[0], " ");
    if (breedMatch) residual = residual.replace(breedMatch[0], " ");
    residual = residual
      .replace(/\bde\s+estima[çc][ãa]o\b/gi, " ")
      .replace(
        /\b(?:cadastre|cadastra|cadastrar|adiciona|adicionar|inclui|incluir|registra|registrar|tenho|adotei|resgatei|ganhei|um|uma|o|a|novo|nova|meu|minha|se\s+chama|chamad[oa]|de|com|peso|pesa|pesando|pet|animal|bich[oa]|bichinh[oa]|mascote|macho|f[eê]mea|srd|vira-lata)\b/gi,
        " "
      );
    for (const [rx] of PET_SPECIES_PATTERNS) {
      residual = residual.replace(new RegExp(rx.source, "gi"), " ");
    }
    extractedName = residual
      .replace(/[,:;.-]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  extractedName = extractedName.replace(/^[,:.\s-]+|[,:.\s-]+$/g, "").trim();
  if (!extractedName || extractedName.length < 2 || /^\d+$/.test(extractedName)) {
    return null;
  }

  const normalizedExtracted = normalizeText(extractedName);
  const alreadyExists = existingPetNames.some(
    (p) => normalizeText(p) === normalizedExtracted
  );
  if (alreadyExists && !clean.includes("novo pet") && !clean.includes("nova pet")) {
    return null;
  }

  return {
    name: extractedName.charAt(0).toUpperCase() + extractedName.slice(1),
    species,
    breed,
    sex,
    weightKg:
      weightKg && !isNaN(weightKg) && weightKg > 0 && weightKg < 200
        ? weightKg
        : undefined,
    notes: trimmed,
  };
}

function extractPurchasePriceAndSupplier(messageText: string): {
  totalPrice?: number;
  supplier?: string;
} {
  let totalPrice: number | undefined;
  const priceMatch = messageText.match(
    /(?:r\$\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*reais|(?:por|paguei|custou|valor(?:\s+de)?)\s+(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)(?!\s*(?:kg|kilos?|quilos?|g|gramas|comprimidos?|c[aá]psulas?|gotas?|ml|unidades?|un|dias?|x|vezes)))/i
  );
  const rawPrice = priceMatch?.[1] || priceMatch?.[2] || priceMatch?.[3];
  if (rawPrice) {
    const val = parseFloat(rawPrice.replace(",", "."));
    if (!isNaN(val) && val > 0) totalPrice = val;
  }

  let supplier: string | undefined;
  const supplierMatch = messageText.match(
    /\b(?:na|no|em)\s+(?:loja\s+|pet\s*shop\s+|farm[aá]cia\s+|cl[ií]nica\s+)?([A-Za-zÀ-ú0-9][A-Za-zÀ-ú0-9\s.&'-]{1,28}?)(?=\s*(?:por\b|r\$|\bvalor\b|\bpaguei\b|,|\.|$))/i
  );
  if (supplierMatch?.[1]) {
    const cand = supplierMatch[1].trim();
    const candNorm = normalizeText(cand);
    if (
      cand.length >= 2 &&
      !candNorm.includes("estoque") &&
      !candNorm.includes("lista de compras") &&
      !/^\d/.test(candNorm)
    ) {
      supplier = cand;
    }
  }

  return { totalPrice, supplier };
}

function findMatchingMedicationCandidates(
  medications: any[],
  medicationName?: string
): any[] {
  if (!medications.length) return [];
  if (!medicationName) return medications.filter((m) => m.status === "active");

  const cleanTarget = normalizeText(medicationName);
  const baseTarget = stripDosageAndParens(medicationName);

  const exact = medications.filter((m) => {
    const full = normalizeText(m.name);
    const fullWithDosage = normalizeText(`${m.name} ${m.dosage || ""}`.trim());
    return (
      full === cleanTarget ||
      fullWithDosage === cleanTarget ||
      (baseTarget && full === baseTarget)
    );
  });
  if (exact.length > 0) return exact;

  const partial = medications.filter((m) => {
    const full = normalizeText(m.name);
    return (
      full.includes(cleanTarget) ||
      cleanTarget.includes(full) ||
      (baseTarget && (full.includes(baseTarget) || baseTarget.includes(full)))
    );
  });
  return partial;
}

function parseAppointmentFromText(messageText: string): {
  title: string;
  type: string;
  date: string;
  time: string;
  veterinarian?: string;
  location?: string;
  notes: string;
} | null {
  const clean = normalizeText(messageText);
  const hasScheduleVerb =
    /\b(?:agend(?:a|e|ar)|marc(?:a|e|ar)|registr(?:a|e|ar)\s+(?:um[oa]?\s+)?(?:consulta|exame|retorno|banho|tosa|cirurgia|compromisso))\b/.test(
      clean
    );
  const hasApptEntity =
    /\b(?:consulta|exame|retorno|banho|tosa|cirurgia|compromisso|checkup|veterinari[oa]|vacina)\b/.test(
      clean
    );

  if (!hasScheduleVerb || !hasApptEntity || clean.includes("?")) return null;

  let type = "consulta";
  if (/\bretorno\b/.test(clean)) type = "retorno";
  else if (/\b(?:exame|hemograma|ultrassom|raio|sangue|checkup)\b/.test(clean)) type = "exame";
  else if (/\b(?:banho|tosa)\b/.test(clean)) type = "banho_tosa";
  else if (/\bcirurgia\b/.test(clean)) type = "cirurgia";
  else if (/\bvacina\b/.test(clean)) type = "vacinacao";

  const today = new Date();
  let date = format(today, "yyyy-MM-dd");
  if (/\bamanha\b/.test(clean)) {
    date = format(addDays(today, 1), "yyyy-MM-dd");
  } else if (/\bdepois\s+de\s+amanha\b/.test(clean)) {
    date = format(addDays(today, 2), "yyyy-MM-dd");
  } else {
    const parsedIso = parseBrOrIsoDateToIso(messageText);
    if (parsedIso) {
      date = parsedIso;
    } else {
      const dmOnly = messageText.match(/\b(?:dia\s+)?(\d{1,2})\/(\d{1,2})\b/);
      if (dmOnly) {
        date = `${today.getFullYear()}-${dmOnly[2].padStart(2, "0")}-${dmOnly[1].padStart(2, "0")}`;
      }
    }
  }

  let time = "09:00";
  const withoutDates = messageText.replace(/\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ");
  const timeMatch = withoutDates.match(/(?:[àa]s?\s*|\b)(\d{1,2})\s*(?:h\s*(\d{2})?|:(\d{2}))/i);
  if (timeMatch) {
    const h = Math.min(23, parseInt(timeMatch[1], 10)).toString().padStart(2, "0");
    const m = (timeMatch[2] || timeMatch[3] || "00").padStart(2, "0");
    time = `${h}:${m}`;
  }

  const vetMatch = messageText.match(
    /\b(?:com\s+(?:o|a)\s+)?(?:dr\.?|dra\.?|vet\.?|veterin[aá]ri[oa])\s+([A-Za-zÀ-ú\s]{2,25}?)(?=\s*(?:na\b|no\b|em\b|dia\b|,|\.|$))/i
  );
  const locationMatch = messageText.match(
    /\b(?:na|no|em)\s+((?:cl[ií]nica|hospital|pet\s*shop|consult[oó]rio)\s+[A-Za-zÀ-ú0-9\s.&'-]{2,30}|[A-ZÀ-Ú][A-Za-zÀ-ú0-9\s.&'-]{2,25})(?=\s*(?:com\b|dia\b|[àa]s\b|,|\.|$))/i
  );

  let title = messageText
    .replace(/^(?:agend(?:a|e|ar)|marc(?:a|e|ar)|registr(?:a|e|ar))\s+(?:um[oa]?\s+)?/i, "")
    .replace(/\b(?:para\s+o|para\s+a|pro|pra)\s+[A-Za-zÀ-ú0-9\s-]+$/i, "")
    .replace(/\b(?:hoje|amanh[ãa]|depois\s+de\s+amanh[ãa]|(?:no\s+)?dia\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})\b/gi, " ")
    .replace(/\b(?:[àa]s?\s*\d{1,2}\s*(?:h\s*\d{0,2}|:\d{2}))\b/gi, " ")
    .replace(/\bcom\s+(?:o|a)?\s*(?:dr\.?|dra\.?|vet\.?|veterin[aá]ri[oa])\s+[A-Za-zÀ-ú\s]{2,25}/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,:.\s-]+|[,:.\s-]+$/g, "")
    .trim();

  if (!title || title.length < 3) {
    title =
      type === "exame"
        ? "Exame Veterinário"
        : type === "retorno"
        ? "Retorno Veterinário"
        : type === "banho_tosa"
        ? "Banho e Tosa"
        : "Consulta Veterinária";
  }

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    type,
    date,
    time,
    veterinarian: vetMatch?.[1]?.trim(),
    location: locationMatch?.[1]?.trim(),
    notes: `Agendado via WhatsApp: "${messageText.trim()}"`,
  };
}

function parseInventoryItemCreationFromText(
  messageText: string,
  petNames: string[] = []
): {
  name: string;
  category: string;
  unit: string;
  initialQuantity: number;
} | null {
  const clean = normalizeText(messageText);
  if (
    clean.includes("?") ||
    clean.includes("vacina") ||
    clean.includes("remedio") ||
    clean.includes("medicamento") ||
    clean.includes("lista de compras")
  ) {
    return null;
  }

  const explicitStockCategory =
    /\b(?:racao|comida|alimento|petisco|biscoito|ossinho|sache|snack|areia|tapete|shampoo|higiene|item|produto|no\s+estoque|em\s+estoque)\b/.test(
      clean
    );
  if (!explicitStockCategory) {
    return null;
  }

  // Se mencionar animal/pet/espécie sem palavra explícita de produto alimentar/higiene, não é item de estoque
  const hasSupplyNoun = /\b(?:racao|petisco|biscoito|ossinho|sache|areia|tapete|shampoo|item)\b/.test(clean);
  if (hasPetProfileOrSpeciesIndicator(clean) && !hasSupplyNoun) {
    return null;
  }

  const createMatch = messageText
    .trim()
    .match(
      /^(?:cadastre|cadastra|cadastrar|adiciona|adicionar|inclui|incluir)\s+(?:a\s+|o\s+|um\s+|uma\s+)?(ra[çc][ãa]o|item|produto|comida|alimento|petisco|biscoito|ossinho|sach[eê]|snack|areia|tapete|shampoo)\s+(.+)$/i
    );
  const stockLocationMatch =
    !createMatch
      ? messageText
          .trim()
          .match(
            /^(?:cadastre|cadastra|cadastrar|adiciona|adicionar|inclui|incluir)\s+(?:a\s+|o\s+|um\s+|uma\s+)?(.+?)\s+(?:no|em)\s+estoque\b(.*)$/i
          )
      : null;

  if (!createMatch?.[2] && !stockLocationMatch?.[1]) return null;

  const prefixVerbNoun = createMatch?.[1] ? normalizeText(createMatch[1]) : "";
  const keepNounPrefix =
    prefixVerbNoun &&
    !["racao", "comida", "alimento", "item", "produto"].includes(prefixVerbNoun);

  const rawBody = createMatch?.[2]
    ? `${keepNounPrefix ? `${createMatch[1]} ` : ""}${createMatch[2]}`.trim()
    : stockLocationMatch![1].trim();

  let itemPart = stripPetReferences(rawBody, petNames)
    .replace(/\s+(?:no\s+estoque|em\s+estoque|no\s+petrec)\b.*$/i, "")
    .trim();

  const qtyMatch = itemPart.match(
    /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas|unidades?|un)\b/i
  );
  let initialQuantity = 0;
  let unit = "g";

  if (qtyMatch) {
    const rawQty = parseFloat(qtyMatch[1].replace(",", "."));
    const spokenUnit = normalizeUnit(qtyMatch[2]);
    if (spokenUnit === "kg") {
      initialQuantity = Math.round(rawQty * 1000);
      unit = "g";
    } else if (spokenUnit === "g") {
      initialQuantity = rawQty;
      unit = "g";
    } else {
      initialQuantity = rawQty;
      unit = spokenUnit;
    }
    itemPart = itemPart
      .replace(qtyMatch[0], " ")
      .replace(/\b(?:de|com)\s*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  if (!itemPart || itemPart.length < 2) return null;

  const cleanName = normalizeText(itemPart);
  const category =
    clean.includes("petisco") ||
    cleanName.includes("petisco") ||
    cleanName.includes("biscoito") ||
    cleanName.includes("ossinho") ||
    cleanName.includes("snack")
      ? "petisco"
      : clean.includes("higiene") ||
        cleanName.includes("tapete") ||
        cleanName.includes("areia") ||
        cleanName.includes("shampoo")
      ? "higiene"
      : clean.includes("racao") ||
        clean.includes("comida") ||
        clean.includes("alimento") ||
        cleanName.includes("racao")
      ? "racao"
      : "outro";

  if (category !== "racao" && !qtyMatch) {
    unit = "unidades";
  }

  return {
    name: itemPart.charAt(0).toUpperCase() + itemPart.slice(1),
    category,
    unit,
    initialQuantity,
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
      "Registra compra ou reposição de estoque de ração, medicamento ou outro item, com suporte opcional a valor total e loja/fornecedor (ex: 'comprei 15kg de ração por R$ 250 na Cobasi').",
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
        totalPrice: {
          type: "number",
          description: "Valor total pago em reais (opcional, ex: 250).",
        },
        unitPrice: {
          type: "number",
          description: "Valor unitário pago em reais (opcional).",
        },
        supplier: {
          type: "string",
          description: "Loja, clínica ou fornecedor onde comprou (opcional, ex: 'Cobasi', 'Petz').",
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
      "Cadastra um novo medicamento e seu cronograma de horários na rotina do pet (seja por receita em foto/áudio ou texto como 'Gengibre toma Sepurim 20mg e Retenic 5mg', chamando uma vez para cada medicamento).",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Nome do medicamento (ex: 'Apoquel', 'Sepurim', 'Retenic').",
        },
        dosage: {
          type: "string",
          description: "Concentração ou dosagem (ex: '20mg', '5mg', '5,4mg', '50mg/ml').",
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
    name: "create_inventory_item",
    description:
      "Cadastra um novo item de ração, petisco ou higiene no estoque do pet mesmo sem compra inicial (ex: 'Cadastre Fresh Meat para o Tonico').",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Nome do produto ou ração (ex: 'Fresh Meat', 'Ração Premier').",
        },
        category: {
          type: "string",
          description: "Categoria: 'racao', 'petisco', 'higiene' ou 'outro'.",
        },
        unit: {
          type: "string",
          description: "Unidade padrão: 'g' para ração ou 'unidades'.",
        },
        initialQuantity: {
          type: "number",
          description: "Quantidade inicial em estoque na unidade definida (padrão: 0).",
        },
        notes: {
          type: "string",
          description: "Observação opcional.",
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
    name: "create_pet",
    description:
      "Cadastra um novo pet/animal na conta do tutor (ex: 'Cadastre o Serelepe, meu saruê de estimação', 'Adotei um gato chamado Tom de 4kg').",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do pet." },
        species: {
          type: "string",
          description: "Espécie do animal (ex: 'Cão', 'Gato', 'Ave', 'Roedor', 'Saruê', 'Réptil', 'Furão').",
        },
        breed: { type: "string", description: "Raça (opcional, ex: 'SRD')." },
        sex: { type: "string", description: "'Macho' ou 'Fêmea' (opcional)." },
        weightKg: { type: "number", description: "Peso inicial em kg (opcional)." },
        birthDate: { type: "string", description: "Data de nascimento em YYYY-MM-DD (opcional)." },
        notes: { type: "string", description: "Observações iniciais sobre o pet." },
      },
      required: ["name", "species"],
    },
  },
  {
    type: "function" as const,
    name: "update_pet",
    description:
      "Atualiza dados cadastrais do pet (nome, espécie, raça, sexo, nascimento, microchip, cor, observações) ou alterna o modo de rotina ('manual' ou 'automatic_by_exception').",
    parameters: {
      type: "object",
      properties: {
        petName: { type: "string", description: "Nome do pet se diferente do atual em foco." },
        newName: { type: "string", description: "Novo nome do pet." },
        species: { type: "string", description: "Nova espécie." },
        breed: { type: "string", description: "Raça atualizada." },
        sex: { type: "string", description: "'Macho' ou 'Fêmea'." },
        birthDate: { type: "string", description: "Data de nascimento YYYY-MM-DD." },
        microchip: { type: "string", description: "Número de microchip." },
        color: { type: "string", description: "Pelagem / cor." },
        notes: { type: "string", description: "Observações do perfil." },
        routineMode: {
          type: "string",
          enum: ["manual", "automatic_by_exception"],
          description: "Define modo de controle de rotina: 'manual' ou 'automatic_by_exception'.",
        },
      },
    },
  },
  {
    type: "function" as const,
    name: "delete_pet",
    description: "Exclui permanentemente um pet cadastrado na conta do tutor.",
    parameters: {
      type: "object",
      properties: {
        petName: { type: "string", description: "Nome exato ou aproximado do pet a excluir." },
      },
      required: ["petName"],
    },
  },
  {
    type: "function" as const,
    name: "list_pets",
    description: "Lista todos os pets vinculados ao tutor, indicando o pet em foco, peso, espécie e código de compartilhamento.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "list_medications",
    description: "Lista a ficha completa de todos os medicamentos cadastrados para o pet, com posologia, horários, instruções e saldo em estoque.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "update_medication",
    description: "Edita horários, dosagem, quantidade por dose, nome, instruções ou estoque de um medicamento já cadastrado.",
    parameters: {
      type: "object",
      properties: {
        medicationName: { type: "string", description: "Nome do medicamento existente." },
        newName: { type: "string", description: "Novo nome (opcional)." },
        dosage: { type: "string", description: "Nova dosagem/concentração (opcional)." },
        unit: { type: "string", description: "Unidade posológica (opcional)." },
        times: {
          type: "array",
          items: { type: "string" },
          description: "Novos horários diários HH:mm (opcional).",
        },
        quantityPerAdministration: { type: "number", description: "Dose por administração (opcional)." },
        currentQuantity: { type: "number", description: "Novo saldo em estoque (opcional)." },
        instructions: { type: "string", description: "Novas instruções de uso (opcional)." },
        veterinarian: { type: "string", description: "Veterinário prescritor (opcional)." },
      },
      required: ["medicationName"],
    },
  },
  {
    type: "function" as const,
    name: "delete_medication",
    description: "Exclui ou suspende permanentemente um medicamento do pet (removendo cronograma e estoque vinculado).",
    parameters: {
      type: "object",
      properties: {
        medicationName: { type: "string", description: "Nome do medicamento a remover." },
      },
      required: ["medicationName"],
    },
  },
  {
    type: "function" as const,
    name: "delete_inventory_item",
    description: "Remove um item cadastrado no estoque (ração, petisco, higiene ou medicamento vinculado).",
    parameters: {
      type: "object",
      properties: {
        itemName: { type: "string", description: "Nome do item a excluir do estoque." },
      },
      required: ["itemName"],
    },
  },
  {
    type: "function" as const,
    name: "update_inventory_lead_time",
    description: "Altera a antecedência em dias para alertas de recompra de um item do estoque.",
    parameters: {
      type: "object",
      properties: {
        itemName: { type: "string", description: "Nome do item no estoque." },
        purchaseLeadTimeDays: { type: "number", description: "Quantidade de dias de antecedência para aviso." },
      },
      required: ["itemName", "purchaseLeadTimeDays"],
    },
  },
  {
    type: "function" as const,
    name: "add_shopping_list_item",
    description: "Adiciona manualmente um item na lista de compras compartilhada do pet.",
    parameters: {
      type: "object",
      properties: {
        itemName: { type: "string", description: "Nome do item a adicionar (ex: 'Coleira antipulgas')." },
        quantity: { type: "number", description: "Quantidade sugerida (padrão 1)." },
        unit: { type: "string", description: "Unidade (padrão 'un')." },
      },
      required: ["itemName"],
    },
  },
  {
    type: "function" as const,
    name: "toggle_shopping_list_item",
    description: "Marca ou desmarca um item da lista de compras como comprado/pendente.",
    parameters: {
      type: "object",
      properties: {
        itemName: { type: "string", description: "Nome do item na lista de compras." },
        isPurchased: { type: "boolean", description: "true para marcar como comprado, false para pendente." },
      },
      required: ["itemName"],
    },
  },
  {
    type: "function" as const,
    name: "list_purchases",
    description: "Lista o histórico financeiro de compras registradas para o pet (valores em R$, datas e fornecedores).",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "record_appointment",
    description: "Agenda uma consulta, exame, retorno, cirurgia ou banho/tosa para o pet.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título do compromisso (ex: 'Consulta dermatológica')." },
        type: {
          type: "string",
          description: "'consulta', 'exame', 'retorno', 'vacinacao', 'banho_tosa' ou 'cirurgia'.",
        },
        date: { type: "string", description: "Data em YYYY-MM-DD." },
        time: { type: "string", description: "Horário HH:mm." },
        veterinarian: { type: "string", description: "Nome do veterinário (opcional)." },
        location: { type: "string", description: "Clínica ou endereço (opcional)." },
        notes: { type: "string", description: "Observações adicionais (opcional)." },
      },
      required: ["title", "date", "time"],
    },
  },
  {
    type: "function" as const,
    name: "list_appointments",
    description: "Lista os próximos compromissos, consultas e exames agendados para o pet.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "review_prescription",
    description: "Aprova ou recusa uma prescrição veterinária pendente de aprovação do tutor.",
    parameters: {
      type: "object",
      properties: {
        medicationName: { type: "string", description: "Nome do medicamento prescrito (opcional se houver só 1)." },
        action: { type: "string", enum: ["approve", "reject"], description: "'approve' ou 'reject'." },
        initialStockQuantity: { type: "number", description: "Estoque inicial ao aprovar (padrão 10)." },
        notes: { type: "string", description: "Justificativa opcional ao recusar." },
      },
      required: ["action"],
    },
  },
  {
    type: "function" as const,
    name: "manage_health_record",
    description:
      "Edita ou exclui um registro no prontuário/saúde do pet (nota clínica, pesagem, vacina ou compromisso).",
    parameters: {
      type: "object",
      properties: {
        recordType: {
          type: "string",
          enum: ["clinical_note", "weight", "vaccine", "appointment"],
          description: "Tipo de registro.",
        },
        action: { type: "string", enum: ["edit", "delete"], description: "'edit' ou 'delete'." },
        targetHint: { type: "string", description: "Nome da vacina, título do compromisso ou trecho da nota (opcional)." },
        newContent: { type: "string", description: "Novo texto para nota clínica." },
        newWeightKg: { type: "number", description: "Novo peso em kg." },
        newTitle: { type: "string", description: "Novo título/nome para vacina ou compromisso." },
        newDate: { type: "string", description: "Nova data YYYY-MM-DD." },
        newTime: { type: "string", description: "Novo horário HH:mm." },
        newNextDueDate: { type: "string", description: "Nova data de reforço da vacina YYYY-MM-DD." },
      },
      required: ["recordType", "action"],
    },
  },
  {
    type: "function" as const,
    name: "get_pet_share_code_or_invite",
    description:
      "Retorna o código permanente de compartilhamento do pet (PET-XXXXXX) ou gera um novo código/link de convite (CONV-XXXXXX) para outro tutor/veterinário.",
    parameters: {
      type: "object",
      properties: {
        createInvite: { type: "boolean", description: "true para gerar um convite nominal CONV-XXXXXX." },
        invitedName: { type: "string", description: "Nome da pessoa convidada (opcional)." },
        invitedEmail: { type: "string", description: "E-mail do convidado (opcional)." },
        invitedPhone: { type: "string", description: "WhatsApp/telefone do convidado (opcional)." },
        role: {
          type: "string",
          description: "Papel: 'caregiver' (tutor familiar), 'vet_limited' (veterinário), 'caregiver_pro' (cuidador) ou 'viewer'.",
        },
        accessDays: { type: "number", description: "Dias de validade para profissionais (opcional, ex: 30)." },
      },
    },
  },
  {
    type: "function" as const,
    name: "list_pet_members",
    description: "Lista todos os tutores e profissionais vinculados ao pet atual e status das notificações.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "toggle_whatsapp_notifications",
    description:
      "Ativa, silencia ou personaliza por categoria (estoque/compras, remédios, ração/alimentação, vacinas, notas clínicas, consultas/peso) as notificações do WhatsApp para você ou, sendo proprietário, para outro membro/veterinário do pet.",
    parameters: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "true para ativar, false para silenciar.",
        },
        categories: {
          type: "array",
          items: { type: "string" },
          description:
            "Categorias opcionais: 'stock', 'medications', 'feeding', 'vaccinations', 'notes', 'appointments'.",
        },
        onlyCategories: {
          type: "boolean",
          description:
            "Quando true, mantém ativas apenas as categorias em 'categories' e silencia as demais.",
        },
        targetMemberName: {
          type: "string",
          description:
            "Nome ou papel do membro-alvo (ex: 'Dra. Camila', 'veterinário') quando o proprietário quer gerenciar alertas de outra pessoa.",
        },
        showCurrent: {
          type: "boolean",
          description: "true para apenas consultar suas preferências atuais de notificação.",
        },
      },
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
  const { pet, allPets, inventory, administrationsToday, medications, health, shoppingList } = snapshot;

  const petsListSummary =
    allPets.length === 0
      ? "Nenhum pet."
      : allPets
          .map((p: any) => `- ${p.name} (${p.species}, código: ${p.shareCode || `PET-${String(p._id).slice(-6).toUpperCase()}`})${String(p._id) === String(pet._id) ? " [EM FOCO]" : ""}`)
          .join("\n");

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

  const allMedsSummary =
    medications.length === 0
      ? "Nenhum medicamento cadastrado."
      : medications
          .map((m: any) => {
            const times = Array.isArray(m.schedules?.[0]?.times)
              ? m.schedules[0].times.join(", ")
              : "";
            return `- ${m.name}${m.dosage ? ` (${m.dosage})` : ""} | horários: ${times || "não informado"} | status: ${m.status}`;
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

  const apptsSummary =
    health.appointments.length === 0
      ? "Nenhum compromisso agendado."
      : health.appointments
          .map((a) => `- ${a.title} (${a.type}) em ${a.date} às ${a.time}${a.veterinarian ? ` com ${a.veterinarian}` : ""}`)
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
    `PETS DO TUTOR:\n${petsListSummary}\n\n` +
    `MEDICAMENTOS CADASTRADOS:\n${allMedsSummary}\n\n` +
    `ESTOQUE ATUAL:\n${inventorySummary}\n\n` +
    `MEDICAMENTOS DE HOJE:\n${medsSummary}\n\n` +
    `VACINAS:\n${vaccinesSummary}\n\n` +
    `COMPROMISSOS / CONSULTAS:\n${apptsSummary}\n\n` +
    `LISTA DE COMPRAS PENDENTE:\n${pendingShop || "Vazia"}\n\n` +
    `REGRAS IMPORTANTES:\n` +
    `1. Sempre use as ferramentas (function calls) para registrar ações reais ou responder perguntas usando os dados acima.\n` +
    `2. Se o tutor pedir para cadastrar um NOVO PET / ANIMAL (ex: "Cadastre o Serelepe, meu saruê de estimação", "Adotei uma gata chamada Luna"), chame 'create_pet' — NUNCA confunda cadastro de animal com remédio ou item de estoque!\n` +
    `3. Para editar perfil/modo de rotina do pet chame 'update_pet'; para listar todos os pets chame 'list_pets'; para excluir um pet chame 'delete_pet'.\n` +
    `4. Se deixar comida/jejum -> 'record_feeding_exception'. Se comer ração manual -> 'record_feeding_consumption'.\n` +
    `5. Se pular/cuspir/administrar dose hoje -> 'update_medication_dose'. Para cadastrar receita/remédio -> 'create_medication'. Para editar horário/dose/instruções -> 'update_medication'. Para excluir/parar medicamento -> 'delete_medication'. Para listar ficha de remédios -> 'list_medications'.\n` +
    `6. Para compra/reposição (inclusive com preço R$ e loja) -> 'record_purchase'. Para histórico/gastos -> 'list_purchases'. Para lista de compras -> 'add_shopping_list_item' ou 'toggle_shopping_list_item'. Para ajuste físico -> 'adjust_stock'. Para alterar consumo diário -> 'update_daily_consumption'. Para alterar antecedência de alerta -> 'update_inventory_lead_time'. Para excluir item do estoque -> 'delete_inventory_item'.\n` +
    `7. Para vacina -> 'record_vaccine'. Para consulta/exame -> 'record_appointment' ou 'list_appointments'. Para nota clínica/sintoma -> 'record_clinical_note'. Para aprovar/recusar prescrição veterinária -> 'review_prescription'. Para editar/excluir nota, peso, vacina ou compromisso -> 'manage_health_record'.\n` +
    `8. Para código de compartilhamento/convite -> 'get_pet_share_code_or_invite'. Para ver tutores e equipe -> 'list_pet_members'. Para silenciar, ativar ou personalizar categorias de notificações no WhatsApp (suas ou, se você for proprietário, de outro membro/veterinário) -> 'toggle_whatsapp_notifications'.\n` +
    `9. Responda em português brasileiro claro, conciso e amigável para WhatsApp.`
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
  newActivePetId?: string;
}> {
  const { convex, toolName, args, snapshot, userId } = params;
  const { pet, allPets, inventory, administrationsToday, medications, health, shoppingList } =
    snapshot;

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

      const hasFinance =
        (typeof args.totalPrice === "number" && args.totalPrice > 0) ||
        (typeof args.unitPrice === "number" && args.unitPrice > 0) ||
        Boolean(args.supplier);

      if (existing) {
        const convertedQty = convertQuantityForTargetUnit(rawQty, args.unit, existing.unit);
        const computedTotal =
          typeof args.totalPrice === "number" && args.totalPrice > 0
            ? args.totalPrice
            : (Number(args.unitPrice) || 0) * convertedQty;
        const computedUnitPrice =
          typeof args.unitPrice === "number" && args.unitPrice > 0
            ? args.unitPrice
            : convertedQty > 0
            ? computedTotal / convertedQty
            : 0;

        if (hasFinance) {
          const forecast = calculateStockForecast({
            currentQuantity: existing.currentQuantity + convertedQty,
            dailyConsumption: existing.dailyConsumption,
            unit: existing.unit,
            purchaseLeadTimeDays: existing.purchaseLeadTimeDays,
          });
          await convex.mutation(api.inventory.recordPurchaseFull, {
            petId: pet._id,
            userId,
            supplier: args.supplier || "Loja Pet",
            total: computedTotal,
            notes: args.notes || "Compra registrada via WhatsApp",
            items: [
              {
                inventoryItemId: existing._id,
                quantity: convertedQty,
                unitPrice: computedUnitPrice,
                status: forecast.status,
                estimatedEndDate: forecast.estimatedEndDate
                  ? forecast.estimatedEndDate.toISOString()
                  : undefined,
              },
            ],
          });
        } else {
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
        }

        const newTotal = existing.currentQuantity + convertedQty;
        const unitLabel = args.unit && convertedQty !== rawQty ? ` (${rawQty} ${args.unit})` : "";
        const financeLine = hasFinance
          ? `\n💰 Valor: *R$ ${computedTotal.toFixed(2).replace(".", ",")}*${
              args.supplier ? ` (${args.supplier})` : ""
            }`
          : "";

        return {
          replyText:
            `🛒 *Compra Registrada no Estoque!*\n\n` +
            `Adicionados *+${convertedQty} ${existing.unit}*${unitLabel} em *${existing.name}* para *${pet.name}*.\n` +
            `📦 Novo saldo: *${newTotal} ${existing.unit}*.` +
            financeLine,
          actionTaken: "purchase_recorded",
        };
      }

      // Se não existir no estoque ainda, cadastra o novo item já com entrada
      const targetUnit =
        normalizeUnit(args.unit) === "kg"
          ? "g"
          : args.unit || (inferredCategory === "racao" ? "g" : "unidades");
      const finalQty = convertQuantityForTargetUnit(rawQty, args.unit, targetUnit);
      const formattedName = itemNameInput.charAt(0).toUpperCase() + itemNameInput.slice(1);

      if (hasFinance) {
        const computedTotal =
          typeof args.totalPrice === "number" && args.totalPrice > 0
            ? args.totalPrice
            : (Number(args.unitPrice) || 0) * finalQty;
        const computedUnitPrice =
          typeof args.unitPrice === "number" && args.unitPrice > 0
            ? args.unitPrice
            : finalQty > 0
            ? computedTotal / finalQty
            : 0;

        const newItemId = await convex.mutation(api.inventory.createItem, {
          petId: pet._id,
          name: formattedName,
          category: inferredCategory || "outro",
          unit: targetUnit,
          currentQuantity: 0,
          dailyConsumption: 0,
          purchaseLeadTimeDays: 7,
          notes: args.notes || "Cadastrado via compra no WhatsApp",
          userId,
        });

        await convex.mutation(api.inventory.recordPurchaseFull, {
          petId: pet._id,
          userId,
          supplier: args.supplier || "Loja Pet",
          total: computedTotal,
          notes: args.notes || "Compra registrada via WhatsApp",
          items: [
            {
              inventoryItemId: newItemId,
              quantity: finalQty,
              unitPrice: computedUnitPrice,
              status: "OK",
            },
          ],
        });

        return {
          replyText:
            `🛒 *Novo Item & Compra Registrados!*\n\n` +
            `*${formattedName}* cadastrado para *${pet.name}* com *${finalQty} ${targetUnit}* disponíveis.\n` +
            `💰 Valor: *R$ ${computedTotal.toFixed(2).replace(".", ",")}*${
              args.supplier ? ` (${args.supplier})` : ""
            }`,
          actionTaken: "purchase_recorded",
        };
      }

      await convex.mutation(api.inventory.createItem, {
        petId: pet._id,
        name: formattedName,
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
          `*${formattedName}* cadastrado para *${pet.name}* com *${finalQty} ${targetUnit}* disponíveis.`,
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

      const existingMed = snapshot.medications.find(
        (m: any) =>
          m.status !== "rejected" &&
          normalizeText(m.name) === normalizeText(medName)
      );

      if (existingMed) {
        if (args.dosage && existingMed.dosage !== args.dosage && existingMed._id) {
          const existingTimes =
            Array.isArray(existingMed.schedules) && existingMed.schedules[0]?.times?.length
              ? existingMed.schedules[0].times
              : normalizedTimes;
          const existingQtyPerAdmin =
            existingMed.schedules?.[0]?.quantityPerAdministration || qtyPerAdmin;
          const existingCurrentQty =
            existingMed.inventoryItem?.currentQuantity ?? initialStock;
          const existingLeadDays =
            existingMed.inventoryItem?.purchaseLeadTimeDays ?? 5;

          await convex.mutation(api.medications.update, {
            medicationId: existingMed._id,
            userId,
            name: existingMed.name,
            dosage: args.dosage,
            unit: existingMed.unit || unit,
            instructions: args.instructions || existingMed.instructions,
            veterinarian: args.veterinarian || existingMed.veterinarian,
            times: existingTimes,
            quantityPerAdministration: existingQtyPerAdmin,
            currentQuantity: existingCurrentQty,
            purchaseLeadTimeDays: existingLeadDays,
          });
          existingMed.dosage = args.dosage;

          return {
            replyText:
              `💊 *Medicamento Atualizado!*\n\n` +
              `• Tratamento: *${existingMed.name}* (${args.dosage})\n` +
              `• Pet: *${pet.name}*\n` +
              `• Horários: *${existingTimes.join(", ")}*`,
            actionTaken: "medication_updated",
          };
        }

        return {
          replyText:
            `ℹ️ *${existingMed.name}*${existingMed.dosage ? ` (${existingMed.dosage})` : ""} já está cadastrado na rotina de *${pet.name}*.`,
          actionTaken: "medication_already_exists",
        };
      }

      const medId = await convex.mutation(api.medications.create, {
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

      snapshot.medications.push({
        _id: medId,
        name: medName,
        dosage: args.dosage,
        unit,
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

    case "create_inventory_item": {
      const itemName = (args.name || "Ração").trim();
      const category = args.category || "racao";
      const unit = args.unit || (category === "racao" ? "g" : "unidades");
      const initialQty =
        typeof args.initialQuantity === "number" && !isNaN(args.initialQuantity)
          ? Math.max(0, args.initialQuantity)
          : 0;

      const existing = snapshot.inventory.find(
        (i) => normalizeText(i.name) === normalizeText(itemName)
      );
      if (existing) {
        return {
          replyText:
            `ℹ️ *${existing.name}* já está cadastrado no estoque de *${pet.name}* (saldo atual: *${existing.currentQuantity} ${existing.unit}*).`,
          actionTaken: "inventory_item_already_exists",
        };
      }

      const itemId = await convex.mutation(api.inventory.createItem, {
        petId: pet._id,
        name: itemName,
        category,
        unit,
        currentQuantity: initialQty,
        dailyConsumption: 0,
        purchaseLeadTimeDays: 7,
        notes: args.notes || "Cadastrado via WhatsApp",
        userId,
      });

      snapshot.inventory.push({
        _id: itemId,
        name: itemName,
        category,
        unit,
        currentQuantity: initialQty,
        dailyConsumption: 0,
        purchaseLeadTimeDays: 7,
        status: initialQty > 0 ? "OK" : "SEM ESTOQUE",
        forecast: calculateStockForecast({
          currentQuantity: initialQty,
          dailyConsumption: 0,
          unit,
          purchaseLeadTimeDays: 7,
        }),
      });

      return {
        replyText:
          `📦 *Item Cadastrado no Estoque!*\n\n` +
          `• Item: *${itemName}*\n` +
          `• Pet: *${pet.name}*\n` +
          `• Categoria: *${category}* | Saldo inicial: *${initialQty} ${unit}*\n\n` +
          `💡 _Você pode informar compras ou consumo diário (ex: "Comprei 15kg de ${itemName}" ou "O consumo diário é 240g")._`,
        actionTaken: "inventory_item_created",
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
        return { replyText: "⚠️ Informe um consumo diário válido (ex: 240g ou 2 comprimidos)." };
      }

      const sourceUnit = args.unit || (racao.category === "racao" ? "g" : racao.unit);
      const convertedDaily = convertQuantityForTargetUnit(rawDaily, sourceUnit, racao.unit);
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

    case "create_pet": {
      const petName = (args.name || "").trim();
      const species = (args.species || "Cão").trim();
      if (!petName || petName.length < 2) {
        return { replyText: "⚠️ Informe um nome válido para cadastrar o pet." };
      }

      const duplicate = allPets.find(
        (p: any) => normalizeText(p.name) === normalizeText(petName)
      );
      if (duplicate) {
        return {
          replyText: `ℹ️ Já existe um pet chamado *${duplicate.name}* (${duplicate.species}) na sua conta.`,
          actionTaken: "pet_already_exists",
        };
      }

      const weightVal =
        typeof args.weightKg === "number" && args.weightKg > 0 && args.weightKg < 200
          ? args.weightKg
          : undefined;

      const created = await convex.mutation(api.pets.create, {
        userId,
        name: petName.charAt(0).toUpperCase() + petName.slice(1),
        species,
        breed: args.breed?.trim() || undefined,
        sex: args.sex?.trim() || undefined,
        birthDate: args.birthDate?.trim() || undefined,
        weight: weightVal,
        photo: getDefaultPetPhoto(species),
        notes: args.notes?.trim() || undefined,
        routineMode: "automatic_by_exception",
      });

      if (created?._id) {
        snapshot.allPets.push(created);
        await convex.mutation(api.whatsapp.updateSession, {
          userId,
          currentPetId: created._id,
          state: "IDLE",
        });
      }

      const shareCode =
        created?.shareCode ||
        (created?._id ? `PET-${String(created._id).slice(-6).toUpperCase()}` : "");

      return {
        replyText:
          `🎉 *Novo Pet Cadastrado!*\n\n` +
          `🐾 *${created?.name || petName}* (${species}` +
          `${args.breed ? ` • ${args.breed}` : ""}` +
          `${args.sex ? ` • ${args.sex}` : ""}` +
          `${weightVal ? ` • ${weightVal} kg` : ""})\n` +
          `${shareCode ? `🔑 Código de compartilhamento: \`${shareCode}\`\n` : ""}` +
          `\n🔄 Foco da conversa alternado automaticamente para *${created?.name || petName}*!`,
        actionTaken: "pet_created",
        newActivePetId: created?._id ? String(created._id) : undefined,
      };
    }

    case "update_pet": {
      const targetPet =
        (args.petName
          ? allPets.find((p: any) => normalizeText(p.name) === normalizeText(args.petName))
          : null) || pet;

      if (args.routineMode === "manual" || args.routineMode === "automatic_by_exception") {
        await convex.mutation(api.pets.setRoutineMode, {
          petId: targetPet._id,
          routineMode: args.routineMode,
          userId,
        });
        targetPet.routineMode = args.routineMode;

        const hasProfileChanges = Boolean(
          args.newName ||
            args.species ||
            args.breed ||
            args.sex ||
            args.birthDate ||
            args.microchip ||
            args.color ||
            args.notes
        );

        if (!hasProfileChanges) {
          return {
            replyText:
              args.routineMode === "automatic_by_exception"
                ? `🔄 *Modo por Exceção Ativado para ${targetPet.name}!*\n\nRações e remédios passam a ser baixados automaticamente conforme a rotina configurada.`
                : `✍️ *Modo Manual Ativado para ${targetPet.name}!*\n\nRações e doses serão baixadas apenas quando você confirmar.`,
            actionTaken: "routine_mode_updated",
          };
        }
      }

      const nextName = args.newName?.trim() || targetPet.name;
      const nextSpecies = args.species?.trim() || targetPet.species;
      const updated = await convex.mutation(api.pets.update, {
        petId: targetPet._id,
        name: nextName,
        species: nextSpecies,
        breed: args.breed !== undefined ? args.breed?.trim() || undefined : targetPet.breed,
        sex: args.sex !== undefined ? args.sex?.trim() || undefined : targetPet.sex,
        birthDate: args.birthDate !== undefined ? args.birthDate?.trim() || undefined : targetPet.birthDate,
        weight: targetPet.weight,
        photo: targetPet.photo,
        color: args.color !== undefined ? args.color?.trim() || undefined : targetPet.color,
        microchip: args.microchip !== undefined ? args.microchip?.trim() || undefined : targetPet.microchip,
        notes: args.notes !== undefined ? args.notes?.trim() || undefined : targetPet.notes,
        routineMode: args.routineMode || targetPet.routineMode,
      });

      const details: string[] = [];
      if (updated?.name) details.push(`• Nome: *${updated.name}*`);
      if (updated?.species) details.push(`• Espécie: *${updated.species}*`);
      if (updated?.breed) details.push(`• Raça: *${updated.breed}*`);
      if (updated?.sex) details.push(`• Sexo: *${updated.sex}*`);
      if (updated?.birthDate) details.push(`• Nascimento: *${updated.birthDate}*`);
      if (updated?.color) details.push(`• Pelagem: *${updated.color}*`);
      if (updated?.microchip) details.push(`• Microchip: *${updated.microchip}*`);

      return {
        replyText: `🐾 *Perfil de ${nextName} Atualizado!*\n\n${details.join("\n")}`,
        actionTaken: "pet_updated",
      };
    }

    case "delete_pet": {
      const targetName = (args.petName || "").trim();
      const targetPet = targetName
        ? allPets.find((p: any) => {
            const pNorm = normalizeText(p.name);
            const tNorm = normalizeText(targetName);
            return pNorm === tNorm || pNorm.includes(tNorm) || tNorm.includes(pNorm);
          })
        : undefined;

      if (!targetPet) {
        return {
          replyText: `⚠️ Não encontrei o pet *${targetName || "informado"}* na sua conta.`,
        };
      }

      await convex.mutation(api.pets.remove, {
        petId: targetPet._id,
        userId,
      });

      const remaining = allPets.filter((p: any) => String(p._id) !== String(targetPet._id));
      const fallbackPet = remaining[0];

      await convex.mutation(api.whatsapp.updateSession, {
        userId,
        currentPetId: fallbackPet ? fallbackPet._id : undefined,
        state: remaining.length === 0 ? "WAITING_FIRST_PET" : "IDLE",
      });

      return {
        replyText:
          `🗑️ *Pet Removido:* *${targetPet.name}* foi excluído da sua conta.\n` +
          (fallbackPet
            ? `🐾 Foco alternado para *${fallbackPet.name}*.`
            : `Envie *"Nome, espécie, peso"* quando quiser cadastrar um novo pet.`),
        actionTaken: "pet_deleted",
        nextState: remaining.length === 0 ? "WAITING_FIRST_PET" : "IDLE",
        newActivePetId: fallbackPet ? String(fallbackPet._id) : undefined,
      };
    }

    case "list_pets": {
      if (!allPets.length) {
        return { replyText: "🐾 Você ainda não possui pets vinculados." };
      }

      const lines = allPets.map((p: any) => {
        const code = p.shareCode || `PET-${String(p._id).slice(-6).toUpperCase()}`;
        const activeMark = String(p._id) === String(pet._id) ? " ✅ *[Em foco]*" : "";
        const modeLabel = p.routineMode === "manual" ? "Manual" : "Por Exceção";
        return (
          `• *${p.name}* (${p.species}${p.breed ? `, ${p.breed}` : ""})${activeMark}\n` +
          `  Peso: ${p.weight ? `${p.weight} kg` : "?"} • Rotina: ${modeLabel} • Código: \`${code}\``
        );
      });

      return {
        replyText:
          `🐾 *Seus Pets no PetRec (${allPets.length}):*\n\n${lines.join("\n\n")}\n\n` +
          `💡 _Envie "trocar para [nome]" para alternar, ou "Cadastre o pet [Nome], [espécie], [peso]kg" para adicionar outro._`,
        actionTaken: "question_answered",
      };
    }

    case "list_medications": {
      if (!medications.length) {
        return {
          replyText: `💊 *${pet.name}* não possui medicamentos cadastrados no momento.`,
          actionTaken: "question_answered",
        };
      }

      const lines = medications.map((m: any) => {
        const sched = m.schedules?.[0];
        const times = Array.isArray(sched?.times) && sched.times.length > 0 ? sched.times.join(", ") : "--:--";
        const doseLabel = `${sched?.quantityPerAdministration || 1} ${m.unit || "un"}`;
        const stockLabel = m.inventoryItem
          ? ` | Estoque: ${m.inventoryItem.currentQuantity} ${m.inventoryItem.unit} (${m.inventoryItem.status})`
          : "";
        const statusTag = m.status === "pending_tutor_approval" ? " ⏳ [Aguardando aprovação]" : "";
        return (
          `• *${m.name}*${m.dosage ? ` (${m.dosage})` : ""}${statusTag}\n` +
          `  Horários: *${times}* • Dose: ${doseLabel}${stockLabel}` +
          `${m.instructions ? `\n  _${m.instructions}_` : ""}`
        );
      });

      return {
        replyText:
          `💊 *Medicamentos Cadastrados — ${pet.name}:*\n\n${lines.join("\n\n")}\n\n` +
          `💡 _Você pode enviar "Muda o horário do [Remédio] para 20h" ou "Parou de tomar [Remédio]"._`,
        actionTaken: "question_answered",
      };
    }

    case "update_medication": {
      const candidates = findMatchingMedicationCandidates(medications, args.medicationName);
      if (candidates.length === 0) {
        return {
          replyText: `💊 Não encontrei o medicamento *${args.medicationName || ""}* na ficha de *${pet.name}*.`,
        };
      }
      const target = candidates[0];
      const sched = target.schedules?.[0];
      const currentTimes = Array.isArray(sched?.times) && sched.times.length > 0 ? sched.times : ["08:00"];
      const nextTimes =
        Array.isArray(args.times) && args.times.length > 0
          ? normalizeMedicationTimes(args.times)
          : currentTimes;
      const nextQtyPerAdmin =
        typeof args.quantityPerAdministration === "number" && args.quantityPerAdministration > 0
          ? args.quantityPerAdministration
          : sched?.quantityPerAdministration || 1;
      const nextCurrentStock =
        typeof args.currentQuantity === "number" && args.currentQuantity >= 0
          ? args.currentQuantity
          : target.inventoryItem?.currentQuantity ?? 0;

      await convex.mutation(api.medications.update, {
        medicationId: target._id,
        userId,
        name: args.newName?.trim() || target.name,
        activeIngredient: target.activeIngredient,
        presentation: target.presentation,
        dosage: args.dosage !== undefined ? args.dosage : target.dosage,
        unit: args.unit || target.unit,
        instructions: args.instructions !== undefined ? args.instructions : target.instructions,
        veterinarian: args.veterinarian !== undefined ? args.veterinarian : target.veterinarian,
        times: nextTimes,
        quantityPerAdministration: nextQtyPerAdmin,
        currentQuantity: nextCurrentStock,
        purchaseLeadTimeDays: target.inventoryItem?.purchaseLeadTimeDays ?? 5,
        notes: target.notes,
      });

      return {
        replyText:
          `💊 *Medicamento Atualizado!*\n\n` +
          `• Nome: *${args.newName?.trim() || target.name}*${
            args.dosage || target.dosage ? ` (${args.dosage || target.dosage})` : ""
          }\n` +
          `• Horários diários: *${nextTimes.join(", ")}* (${nextQtyPerAdmin} ${args.unit || target.unit || "un"}/dose)\n` +
          `• Estoque: *${nextCurrentStock} ${args.unit || target.unit || "un"}*`,
        actionTaken: "medication_updated",
      };
    }

    case "delete_medication": {
      const candidates = findMatchingMedicationCandidates(medications, args.medicationName);
      if (candidates.length === 0) {
        return {
          replyText: `💊 Não encontrei o medicamento *${args.medicationName || ""}* na ficha de *${pet.name}*.`,
        };
      }
      const target = candidates[0];
      await convex.mutation(api.medications.remove, {
        medicationId: target._id,
        userId,
      });

      return {
        replyText: `🗑️ *Medicamento Excluído:* *${target.name}* e seu cronograma/estoque foram removidos de *${pet.name}*.`,
        actionTaken: "medication_deleted",
      };
    }

    case "delete_inventory_item": {
      const resolved = resolveInventoryItemOrDisambiguate({
        inventory,
        itemName: args.itemName,
        toolName,
        args,
        petName: pet.name,
      });
      if ("disambiguation" in resolved) return resolved.disambiguation;
      if ("notFound" in resolved) {
        return {
          replyText: `📦 Não encontrei *${args.itemName}* no estoque de *${pet.name}*.`,
        };
      }
      const target = resolved.item;
      await convex.mutation(api.inventory.deleteItem, {
        id: target._id,
        userId,
      });

      return {
        replyText: `🗑️ *Item Removido do Estoque:* *${target.name}* foi excluído de *${pet.name}*.`,
        actionTaken: "inventory_item_deleted",
      };
    }

    case "update_inventory_lead_time": {
      const days = Math.max(1, Math.min(60, Math.round(Number(args.purchaseLeadTimeDays) || 5)));
      const resolved = resolveInventoryItemOrDisambiguate({
        inventory,
        itemName: args.itemName,
        toolName,
        args,
        petName: pet.name,
      });
      if ("disambiguation" in resolved) return resolved.disambiguation;
      if ("notFound" in resolved) {
        return {
          replyText: `📦 Não encontrei *${args.itemName}* no estoque de *${pet.name}*.`,
        };
      }
      const target = resolved.item;
      await convex.mutation(api.inventory.updateItem, {
        id: target._id,
        purchaseLeadTimeDays: days,
        userId,
      });

      return {
        replyText:
          `⏰ *Antecedência de Alerta Atualizada!*\n\n` +
          `O alerta de compra de *${target.name}* (*${pet.name}*) agora avisará com *${days} dia(s)* de antecedência.`,
        actionTaken: "inventory_lead_time_updated",
      };
    }

    case "add_shopping_list_item": {
      const itemName = (args.itemName || "").trim();
      if (!itemName) {
        return { replyText: "⚠️ Informe o nome do item para adicionar à lista de compras." };
      }

      const matchedInv = findMatchingInventoryItem(inventory, itemName);
      const qty = typeof args.quantity === "number" && args.quantity > 0 ? args.quantity : 1;
      const unit = args.unit?.trim() || matchedInv?.unit || "un";

      await convex.mutation(api.inventory.addShoppingItem, {
        petId: pet._id,
        inventoryItemId: matchedInv?._id,
        customName: matchedInv ? matchedInv.name : itemName.charAt(0).toUpperCase() + itemName.slice(1),
        quantity: qty,
        unit,
        userId,
      });

      return {
        replyText:
          `🛒 *Item Adicionado à Lista de Compras!*\n\n` +
          `• *${matchedInv ? matchedInv.name : itemName}* (${qty} ${unit}) incluído para *${pet.name}*.`,
        actionTaken: "shopping_item_added",
      };
    }

    case "toggle_shopping_list_item": {
      const targetName = normalizeText(args.itemName || "");
      const desiredPurchased = args.isPurchased !== false;
      const candidates = shoppingList.filter((s: any) =>
        desiredPurchased ? !s.isPurchased : Boolean(s.isPurchased)
      );
      const found = candidates.find((s: any) => {
        const label = normalizeText(s.customName || s.inventoryItem?.name || "");
        return label && (label.includes(targetName) || targetName.includes(label));
      });

      if (!found) {
        return {
          replyText: `🛒 Não encontrei *${args.itemName}* ${desiredPurchased ? "pendente" : "comprado"} na lista de compras de *${pet.name}*.`,
        };
      }

      await convex.mutation(api.inventory.toggleShoppingItem, {
        id: found._id,
        isPurchased: desiredPurchased,
        userId,
      });

      const label = found.customName || found.inventoryItem?.name || args.itemName;
      return {
        replyText: desiredPurchased
          ? `✅ *${label}* marcado como comprado na lista de *${pet.name}*!`
          : `🔄 *${label}* recolocado como pendente na lista de *${pet.name}*.`,
        actionTaken: "shopping_item_toggled",
      };
    }

    case "list_purchases": {
      const purchases = await convex.query(api.inventory.listPurchases, {
        petId: pet._id,
      });
      if (!purchases || purchases.length === 0) {
        return {
          replyText: `🧾 Nenhuma compra com valor registrada até o momento para *${pet.name}*.\n\n💡 _Experimente: "Comprei 15kg de ração por R$ 240 na Cobasi"._`,
          actionTaken: "question_answered",
        };
      }

      const totalSpent = purchases.reduce((acc: number, p: any) => acc + (Number(p.total) || 0), 0);
      const lines = purchases.slice(0, 6).map((p: any) => {
        const dStr = p.date ? format(new Date(p.date), "dd/MM/yyyy", { locale: ptBR }) : "--/--";
        const itemSummary = Array.isArray(p.items) && p.items.length > 0
          ? p.items.map((it: any) => it.inventoryItem?.name || "Item").join(", ")
          : p.notes || "Compra";
        return `• ${dStr} — *R$ ${(Number(p.total) || 0).toFixed(2).replace(".", ",")}* (${p.supplier || "Loja"})\n  _${itemSummary}_`;
      });

      return {
        replyText:
          `🧾 *Histórico de Compras — ${pet.name}:*\n\n${lines.join("\n\n")}\n\n` +
          `💰 *Total acumulado:* R$ ${totalSpent.toFixed(2).replace(".", ",")}`,
        actionTaken: "question_answered",
      };
    }

    case "record_appointment": {
      const title = (args.title || "Consulta Veterinária").trim();
      const type = args.type || "consulta";
      const date = args.date || format(new Date(), "yyyy-MM-dd");
      const time = args.time || "09:00";

      await convex.mutation(api.health.recordAppointment, {
        petId: pet._id,
        userId,
        title,
        type,
        date,
        time,
        veterinarian: args.veterinarian || undefined,
        location: args.location || undefined,
        notes: args.notes || undefined,
      });

      return {
        replyText:
          `📅 *Compromisso Agendado!*\n\n` +
          `• *${title}* (${type}) para *${pet.name}*\n` +
          `• Data: *${date}* às *${time}*` +
          `${args.veterinarian ? `\n• Veterinário: *${args.veterinarian}*` : ""}` +
          `${args.location ? `\n• Local: *${args.location}*` : ""}`,
        actionTaken: "appointment_recorded",
      };
    }

    case "list_appointments": {
      const appts = [...(health.appointments || [])].sort((a: any, b: any) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
      );

      if (appts.length === 0) {
        return {
          replyText: `📅 *${pet.name}* não possui consultas ou compromissos agendados.\n\n💡 _Envie por exemplo: "Agendar consulta dia 25/11/2026 às 14:30 com Dra. Camila"._`,
          actionTaken: "question_answered",
        };
      }

      const lines = appts.map(
        (a: any) =>
          `• *${a.title}* (${a.type})\n  📆 ${a.date} às ${a.time}${
            a.veterinarian ? ` • ${a.veterinarian}` : ""
          }${a.location ? ` • ${a.location}` : ""}`
      );

      return {
        replyText: `📅 *Agenda de Saúde — ${pet.name}:*\n\n${lines.join("\n\n")}`,
        actionTaken: "question_answered",
      };
    }

    case "review_prescription": {
      const pendingMeds = medications.filter((m: any) => m.status === "pending_tutor_approval");
      if (pendingMeds.length === 0) {
        return {
          replyText: `ℹ️ *${pet.name}* não possui nenhuma prescrição veterinária aguardando aprovação no momento.`,
        };
      }

      const target = args.medicationName
        ? findMatchingMedicationCandidates(pendingMeds, args.medicationName)[0]
        : pendingMeds[0];

      if (!target) {
        return {
          replyText: `⚠️ Não encontrei prescrição pendente para *${args.medicationName}*.`,
        };
      }

      if (args.action === "reject") {
        await convex.mutation(api.medications.rejectPrescription, {
          medicationId: target._id,
          userId,
          notes: args.notes || undefined,
        });
        return {
          replyText: `❌ Prescrição de *${target.name}* para *${pet.name}* foi recusada.`,
          actionTaken: "prescription_rejected",
        };
      }

      const initialQty =
        typeof args.initialStockQuantity === "number" && args.initialStockQuantity >= 0
          ? args.initialStockQuantity
          : 10;

      await convex.mutation(api.medications.approvePrescription, {
        medicationId: target._id,
        userId,
        initialStockQuantity: initialQty,
      });

      return {
        replyText:
          `✅ *Prescrição Aprovada!*\n\n` +
          `O tratamento com *${target.name}* foi ativado para *${pet.name}* com estoque inicial de *${initialQty} ${target.unit || "un"}*.`,
        actionTaken: "prescription_approved",
      };
    }

    case "manage_health_record": {
      const hint = normalizeText(args.targetHint || "");

      if (args.recordType === "clinical_note") {
        const notes = [...(health.clinicalNotes || [])].sort(
          (a: any, b: any) => (b._creationTime || 0) - (a._creationTime || 0)
        );
        const target = hint
          ? notes.find((n: any) => normalizeText(n.content || "").includes(hint))
          : notes[0];
        if (!target) {
          return { replyText: `📋 Não encontrei nenhuma nota clínica compatível no prontuário de *${pet.name}*.` };
        }
        if (args.action === "delete") {
          await convex.mutation(api.health.deleteClinicalNote, {
            noteId: target._id,
            userId,
          });
          return {
            replyText: `🗑️ *Nota Clínica Excluída:* _"${target.content}"_ foi removida do prontuário de *${pet.name}*.`,
            actionTaken: "health_record_deleted",
          };
        }
        const nextContent = (args.newContent || "").trim();
        if (!nextContent) {
          return { replyText: "⚠️ Informe o novo texto para atualizar a nota clínica." };
        }
        await convex.mutation(api.health.updateClinicalNote, {
          noteId: target._id,
          userId,
          content: nextContent,
        });
        return {
          replyText: `✏️ *Nota Clínica Atualizada:*\n_"${nextContent}"_`,
          actionTaken: "health_record_updated",
        };
      }

      if (args.recordType === "weight") {
        const weights = [...(health.weights || [])].sort(
          (a: any, b: any) =>
            new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime() ||
            (b._creationTime || 0) - (a._creationTime || 0)
        );
        const target = weights[0];
        if (!target) {
          return { replyText: `⚖️ Não há pesagens registradas para *${pet.name}*.` };
        }
        if (args.action === "delete") {
          await convex.mutation(api.health.deleteWeight, {
            weightId: target._id,
            userId,
          });
          return {
            replyText: `🗑️ *Pesagem Excluída:* Registro de *${target.weight} kg* removido do histórico de *${pet.name}*.`,
            actionTaken: "health_record_deleted",
          };
        }
        const newW = Number(args.newWeightKg);
        if (!newW || newW <= 0 || newW >= 200) {
          return { replyText: "⚠️ Informe um novo peso válido em kg." };
        }
        await convex.mutation(api.health.updateWeight, {
          weightId: target._id,
          userId,
          weight: newW,
          date: args.newDate || target.date,
          notes: target.notes,
        });
        return {
          replyText: `✏️ *Pesagem Atualizada:* Último peso de *${pet.name}* ajustado para *${newW} kg*.`,
          actionTaken: "health_record_updated",
        };
      }

      if (args.recordType === "vaccine") {
        const vaccines = [...(health.vaccines || [])].sort(
          (a: any, b: any) => (b._creationTime || 0) - (a._creationTime || 0)
        );
        const target = hint
          ? vaccines.find((v: any) => normalizeText(v.name || "").includes(hint))
          : vaccines[0];
        if (!target) {
          return { replyText: `💉 Não encontrei essa vacina no prontuário de *${pet.name}*.` };
        }
        if (args.action === "delete") {
          await convex.mutation(api.health.deleteVaccine, {
            vaccineId: target._id,
            userId,
          });
          return {
            replyText: `🗑️ *Vacina Excluída:* *${target.name}* foi removida da carteirinha de *${pet.name}*.`,
            actionTaken: "health_record_deleted",
          };
        }
        await convex.mutation(api.health.updateVaccine, {
          vaccineId: target._id,
          userId,
          name: args.newTitle?.trim() || target.name,
          applicationDate: args.newDate || target.applicationDate,
          nextDueDate: args.newNextDueDate !== undefined ? args.newNextDueDate : target.nextDueDate,
          veterinarian: target.veterinarian,
          crmv: target.crmv,
          batch: target.batch,
          notes: target.notes,
        });
        return {
          replyText: `✏️ *Vacina Atualizada:* *${args.newTitle?.trim() || target.name}* de *${pet.name}* salva com sucesso.`,
          actionTaken: "health_record_updated",
        };
      }

      if (args.recordType === "appointment") {
        const appts = [...(health.appointments || [])].sort(
          (a: any, b: any) => (b._creationTime || 0) - (a._creationTime || 0)
        );
        const target = hint
          ? appts.find((a: any) => normalizeText(a.title || "").includes(hint))
          : appts[0];
        if (!target) {
          return { replyText: `📅 Não encontrei nenhum compromisso compatível para *${pet.name}*.` };
        }
        if (args.action === "delete") {
          await convex.mutation(api.health.deleteAppointment, {
            appointmentId: target._id,
            userId,
          });
          return {
            replyText: `🗑️ *Compromisso Cancelado/Excluído:* *${target.title}* (${target.date} às ${target.time}) removido da agenda de *${pet.name}*.`,
            actionTaken: "health_record_deleted",
          };
        }
        await convex.mutation(api.health.updateAppointment, {
          appointmentId: target._id,
          userId,
          title: args.newTitle?.trim() || target.title,
          type: target.type,
          date: args.newDate || target.date,
          time: args.newTime || target.time,
          location: target.location,
          veterinarian: target.veterinarian,
          notes: target.notes,
        });
        return {
          replyText: `✏️ *Compromisso Atualizado:* *${args.newTitle?.trim() || target.title}* (${args.newDate || target.date} às ${args.newTime || target.time}).`,
          actionTaken: "health_record_updated",
        };
      }

      return { replyText: "⚠️ Tipo de registro de saúde inválido." };
    }

    case "get_pet_share_code_or_invite": {
      const petDetails = await convex.query(api.pets.getById, { petId: pet._id });
      const shareCode = petDetails?.shareCode || `PET-${String(pet._id).slice(-6).toUpperCase()}`;
      const appUrl = (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_HOST_URL ||
        "https://petrec.vercel.app"
      ).replace(/\/+$/, "");

      if (args.createInvite || args.invitedName || args.invitedEmail || args.invitedPhone) {
        const res = await convex.mutation(api.users.inviteOrAddMember, {
          petId: pet._id,
          invitedName: args.invitedName?.trim() || undefined,
          invitedEmail: args.invitedEmail?.trim() || undefined,
          invitedPhone: args.invitedPhone?.trim() || undefined,
          invitedById: userId,
          role: args.role || "caregiver",
          accessDays: typeof args.accessDays === "number" ? args.accessDays : undefined,
        });
        const token = res?.invitation?.token || shareCode;
        return {
          replyText:
            `🤝 *Convite Gerado para ${pet.name}!*\n\n` +
            `• Código do convite: \`${token}\`\n` +
            `• Link direto: ${appUrl}/convite/${token}\n\n` +
            `💡 _A pessoa convidada pode abrir o link ou enviar \`${token}\` aqui no WhatsApp do PetRec para se vincular na hora._`,
          actionTaken: "invite_created",
        };
      }

      return {
        replyText:
          `🔑 *Compartilhamento de ${pet.name}:*\n\n` +
          `• Código permanente do pet: \`${shareCode}\`\n` +
          `• Link de acesso: ${appUrl}/convite/${shareCode}\n\n` +
          `💡 _Para convidar outro tutor ou veterinário, compartilhe o código \`${shareCode}\` ou peça: "Gerar convite para [Nome] como veterinário"._`,
        actionTaken: "question_answered",
      };
    }

    case "list_pet_members": {
      const petDetails = await convex.query(api.pets.getById, { petId: pet._id });
      const members = petDetails?.members || [];
      if (members.length === 0) {
        return {
          replyText: `👥 *${pet.name}* não possui membros carregados.`,
          actionTaken: "question_answered",
        };
      }

      const lines = members.map((m: any) => {
        const roleLabel =
          m.role === "owner"
            ? "Tutor(a) Principal"
            : m.role === "co_owner"
            ? "Coproprietário(a)"
            : m.role === "vet_limited"
            ? "Médico Veterinário"
            : m.role === "clinic_admin"
            ? "Clínica / Recepção"
            : m.role === "caregiver_pro"
            ? "Cuidador Pro"
            : m.role === "viewer"
            ? "Visualizador"
            : "Tutor Familiar";
        const prefs = resolveNotificationPreferences(m.role, m.notificationPreferences);
        const activeCats = ALL_NOTIFICATION_CATEGORY_KEYS.filter((k) => prefs[k]).map((k) => {
          const meta = getCategoryMeta(k);
          return `${meta.emoji} ${meta.shortLabel}`;
        });
        const notifStatus =
          m.notifyWhatsApp === false
            ? "🔕 Geral silenciado"
            : activeCats.length > 0
            ? `🔔 ${activeCats.join(", ")}`
            : "🔕 Todas categorias silenciadas";
        return `• *${m.user?.name || "Tutor"}* — ${roleLabel}\n  ${notifStatus}`;
      });

      return {
        replyText: `👥 *Equipe de Cuidados — ${pet.name}:*\n\n${lines.join("\n")}`,
        actionTaken: "question_answered",
      };
    }

    case "toggle_whatsapp_notifications": {
      const petDetails = await convex.query(api.pets.getById, { petId: pet._id });
      const members = petDetails?.members || [];
      const selfMembership = members.find(
        (m: any) => String(m.userId) === String(userId)
      );

      let targetMembership = selfMembership;
      if (args.targetMemberName && String(args.targetMemberName).trim()) {
        const targetHint = normalizeText(String(args.targetMemberName));
        const matched = members.find((m: any) => {
          const memberNameNorm = normalizeText(m.user?.name || "");
          if (
            memberNameNorm &&
            (memberNameNorm === targetHint ||
              memberNameNorm.includes(targetHint) ||
              targetHint.includes(memberNameNorm))
          ) {
            return true;
          }
          if (
            (targetHint === "vet" || targetHint.includes("veterinari")) &&
            m.role === "vet_limited"
          ) {
            return true;
          }
          if (
            (targetHint.includes("clinica") || targetHint.includes("recepcao")) &&
            m.role === "clinic_admin"
          ) {
            return true;
          }
          if (
            (targetHint.includes("cuidador") || targetHint.includes("sitter")) &&
            (m.role === "caregiver" || m.role === "caregiver_pro")
          ) {
            return true;
          }
          if (targetHint.includes("coproprietari") && m.role === "co_owner") {
            return true;
          }
          if (targetHint.includes("visualiz") && m.role === "viewer") {
            return true;
          }
          return false;
        });

        if (!matched) {
          return {
            replyText: `⚠️ Não encontrei o membro *${args.targetMemberName}* vinculado a *${pet.name}*. Envie *"Quem são os tutores?"* para conferir os nomes.`,
          };
        }
        targetMembership = matched;
      }

      if (!targetMembership) {
        return { replyText: `⚠️ Não encontrei seu vínculo com *${pet.name}*.` };
      }

      const isSelf = String(targetMembership.userId) === String(userId);
      const actorCanManage =
        selfMembership?.isPrimary === true ||
        selfMembership?.role === "owner" ||
        selfMembership?.role === "co_owner";

      const validCategories: NotificationCategory[] = Array.isArray(args.categories)
        ? args.categories.filter((c: any): c is NotificationCategory =>
            ALL_NOTIFICATION_CATEGORY_KEYS.includes(c)
          )
        : [];

      if ((args.showCurrent || (validCategories.length === 0 && typeof args.enabled !== "boolean")) && targetMembership) {
        const currentPrefs = resolveNotificationPreferences(
          targetMembership.role,
          targetMembership.notificationPreferences
        );
        const ownerLabel = isSelf ? "Suas notificações" : `Notificações de *${targetMembership.user?.name || "Membro"}*`;
        const masterLabel =
          targetMembership.notifyWhatsApp === false
            ? "🔕 *Status geral:* Silenciado"
            : "🔔 *Status geral:* Ativo";
        return {
          replyText:
            `⚙️ *${ownerLabel} — ${pet.name}*\n` +
            `${masterLabel}\n` +
            `${formatNotificationPreferencesSummary(currentPrefs)}\n\n` +
            `💡 _Exemplos: "Não receber avisos de compra de remédio", "Ativar apenas notas clínicas para o veterinário" ou "Silenciar notificações"._`,
          actionTaken: "question_answered",
        };
      }

      if (!isSelf && !actorCanManage) {
        return {
          replyText: `🔒 Apenas o proprietário ou coproprietário de *${pet.name}* pode alterar as notificações de outro membro.`,
        };
      }

      const targetLabel = isSelf ? "para você" : `para *${targetMembership.user?.name || "o membro"}*`;

      if (args.onlyCategories && validCategories.length > 0) {
        const nextPrefs = ALL_NOTIFICATION_CATEGORY_KEYS.reduce((acc, key) => {
          acc[key] = validCategories.includes(key);
          return acc;
        }, {} as NotificationPreferences);

        await convex.mutation(api.users.toggleMemberWhatsAppNotifications, {
          memberId: targetMembership._id,
          notifyWhatsApp: true,
          notificationPreferences: nextPrefs,
          actorUserId: userId,
        });

        return {
          replyText:
            `🔔 *Preferências Exclusivas Atualizadas (${targetLabel}) — ${pet.name}:*\n\n` +
            `${formatNotificationPreferencesSummary(nextPrefs)}`,
          actionTaken: "notifications_toggled",
        };
      }

      if (validCategories.length > 0) {
        const enableFlag = typeof args.enabled === "boolean" ? args.enabled : true;
        const categoryUpdates: Partial<NotificationPreferences> = {};
        for (const cat of validCategories) {
          categoryUpdates[cat] = enableFlag;
        }

        const res = await convex.mutation(api.users.toggleMemberWhatsAppNotifications, {
          memberId: targetMembership._id,
          categoryUpdates,
          actorUserId: userId,
        });

        const updatedPrefs = resolveNotificationPreferences(
          targetMembership.role,
          res?.notificationPreferences
        );
        const catNames = validCategories.map((c) => {
          const meta = getCategoryMeta(c);
          return `${meta.emoji} ${meta.label}`;
        });

        return {
          replyText:
            `${enableFlag ? "🔔" : "🔕"} *Categorias ${
              enableFlag ? "Ativadas" : "Silenciadas"
            } (${targetLabel}) — ${pet.name}:*\n` +
            `Alterado: ${catNames.join(", ")}\n\n` +
            `${formatNotificationPreferencesSummary(updatedPrefs)}`,
          actionTaken: "notifications_toggled",
        };
      }

      const enabled = Boolean(args.enabled);
      await convex.mutation(api.users.toggleMemberWhatsAppNotifications, {
        memberId: targetMembership._id,
        notifyWhatsApp: enabled,
        actorUserId: userId,
      });

      return {
        replyText: isSelf
          ? enabled
            ? `🔔 *Notificações Ativadas!*\nVocê voltará a receber avisos de atividades de outros tutores de *${pet.name}* no WhatsApp.`
            : `🔕 *Notificações Silenciadas!*\nVocê não receberá avisos de rotina de outros tutores de *${pet.name}* no WhatsApp (pode reativar quando quiser enviando *"Ativar notificações"*).`
          : enabled
          ? `🔔 *Notificações Ativadas ${targetLabel}!*\n*${targetMembership.user?.name}* voltará a receber alertas de *${pet.name}* no WhatsApp.`
          : `🔕 *Notificações Silenciadas ${targetLabel}!*\n*${targetMembership.user?.name}* não receberá mais alertas de *${pet.name}* no WhatsApp.`,
        actionTaken: "notifications_toggled",
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
    let finalNewPetId: string | undefined;

    for (const clause of clauses) {
      const subRes = await interpretSingleClauseNlu(clause.trim(), snapshot, convex, userId);
      if (subRes.handled) {
        replies.push(subRes.replyText);
        if (subRes.actionTaken) actions.push(subRes.actionTaken);
        if (subRes.nextState !== "IDLE") {
          finalState = subRes.nextState;
          finalPayload = subRes.pendingActionPayload;
        }
        if (subRes.newActivePetId) {
          finalNewPetId = subRes.newActivePetId;
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
        newActivePetId: finalNewPetId,
        usedGemini: false,
      };
    }
  }

  return interpretSingleClauseNlu(messageText, snapshot, convex, userId);
}

async function callNluTool(
  convex: ConvexHttpClient,
  toolName: string,
  args: Record<string, any>,
  snapshot: PetContextSnapshot,
  userId: any
): Promise<AiAssistantResult> {
  const exec = await executeAssistantToolCall({
    convex,
    toolName,
    args,
    snapshot,
    userId,
  });
  return {
    handled: true,
    replyText: exec.replyText,
    actionTaken: exec.actionTaken,
    nextState: exec.nextState || "IDLE",
    pendingActionPayload: exec.pendingActionPayload,
    newActivePetId: exec.newActivePetId,
    usedGemini: false,
  };
}

function parseExplicitClinicalNote(
  messageText: string,
  petNames: string[] = []
): string | null {
  const trimmed = messageText.trim();
  if (!trimmed) return null;

  const prefixRegex =
    /^(?:anot[aei](?:r)?(?:\s+a[ií])?(?:\s+no\s+prontu[aá]rio)?(?:\s+que)?|nota(?:\s+cl[ií]nica)?|observa[çc][ãa]o|obs|prontu[aá]rio|registr[ae](?:r)?\s+no\s+prontu[aá]rio|adicione?\s+(?:uma\s+)?nota(?:\s+cl[ií]nica)?|nova\s+nota(?:\s+cl[ií]nica)?)\s*(?:[:,-]\s*|\s+que\s+|\s+)([\s\S]+)$/i;

  const directMatch = trimmed.match(prefixRegex);
  if (directMatch?.[1]?.trim()) {
    return directMatch[1].trim();
  }

  for (const pet of petNames) {
    if (!pet?.trim()) continue;
    const escaped = escapeRegex(pet.trim());
    const afterPetMatch = trimmed.match(
      new RegExp(`^(?:o|a|para\\s+o|para\\s+a|pro|pra)?\\s*${escaped}\\s*[,:-]?\\s+([\\s\\S]+)$`, "i")
    );
    if (afterPetMatch?.[1]) {
      const innerMatch = afterPetMatch[1].trim().match(prefixRegex);
      if (innerMatch?.[1]?.trim()) {
        return innerMatch[1].trim();
      }
    }
  }

  return null;
}

async function interpretSingleClauseNlu(
  messageText: string,
  snapshot: PetContextSnapshot,
  convex: ConvexHttpClient,
  userId: any
): Promise<AiAssistantResult> {
  const clean = normalizeText(messageText);
  const petNamesList = snapshot.allPets.map((p: any) => p.name);

  // 0. Nota clínica explícita ("Anote: ...", "Observação: ...", "Prontuário: ...")
  const explicitNoteContent = parseExplicitClinicalNote(messageText, petNamesList);
  const isExplicitVaccineNote =
    !clean.startsWith("anote") &&
    !clean.startsWith("nota") &&
    !clean.startsWith("obs") &&
    !clean.startsWith("prontuario") &&
    Boolean(parseVaccineFromText(messageText));

  if (explicitNoteContent && !isExplicitVaccineNote) {
    return callNluTool(convex, "record_clinical_note", { content: explicitNoteContent }, snapshot, userId);
  }

  // 0a. Cadastro explícito de novo pet ("Cadastre o Serelepe, meu saruê de estimação", "Adotei uma gata chamada Luna")
  const petCreation = parsePetCreationFromText(messageText, petNamesList);
  if (petCreation) {
    return callNluTool(convex, "create_pet", petCreation, snapshot, userId);
  }

  // 0b. Silenciar, reativar, consultar ou personalizar notificações do WhatsApp (por usuário ou membro)
  const extractNotificationTargetMember = (): string | undefined => {
    const roleHintMatch = clean.match(
      /\b(veterinari[oa]|vet|clinic[oa]|recepcao|cuidador(?:a)?|pet\s*sitter|sitter|coproprietari[oa]|visualizador(?:a)?)\b/
    );
    if (roleHintMatch?.[1]) {
      return roleHintMatch[1];
    }

    const nameMatch = messageText.match(
      /(?:\bpara\s+(?:o\s+|a\s+)?|\bque\s+(?:o\s+|a\s+)?|\bd[oa]\s+)(Dr\.?\s+[A-ZÀ-Úa-zà-ú]+|Dra\.?\s+[A-ZÀ-Úa-zà-ú]+|[A-ZÀ-Ú][a-zà-ú]{2,24})(?=\s+(?:nao\s+|tambem\s+)?receb|\s+(?:em|sobre|de|dos|das|os|as|apenas|somente|$))/
    );
    if (nameMatch?.[1]) {
      const candidate = nameMatch[1].trim();
      const candNorm = normalizeText(candidate);
      const isPetName = petNamesList.some((p) => normalizeText(p) === candNorm);
      if (!isPetName) return candidate;
    }
    return undefined;
  };

  const notifCategories = parseNotificationCategoriesFromText(messageText);
  const onlyCategoriesFlag = /\b(?:apenas|somente|so)\b/.test(clean) && notifCategories.length > 0;
  const hasDisableNotifVerb =
    /\b(?:silenci(?:a|e|ar)|desativ(?:a|e|ar)|paus(?:a|e|ar)|mut(?:a|e|ar)|evit(?:a|e|ar)|imped(?:e|ir)|tir(?:a|e|ar)|bloque(?:a|ie|ar))\b/.test(
      clean
    ) ||
    /\b(?:par(?:a|e|ar)\s+de\s+(?:enviar|receber|mandar)|nao\s+(?:quero\s+|quer\s+|vai\s+)?(?:enviar|receb(?:a|e|er)|mandar))\b/.test(
      clean
    );
  const hasEnableNotifVerb =
    !hasDisableNotifVerb &&
    /\b(?:ativ(?:a|e|ar)|reativ(?:a|e|ar)|lig(?:a|ue|ar)|habilit(?:a|e|ar)|quero\s+receber|receb(?:a|er))\b/.test(
      clean
    );
  const mentionsNotifTopic =
    /\b(?:notificac(?:ao|oes)|avisos?|alertas?)\b/.test(clean) ||
    (onlyCategoriesFlag && /\b(?:receb(?:a|er)|notific|avis|alert)\b/.test(clean));

  if (
    (/\b(?:minhas|suas|quais|ver|mostrar|como\s+estao|configuracoes)\b.*\bnotificac(?:ao|oes)\b/.test(
      clean
    ) ||
      /^notificac(?:ao|oes)\??$/.test(clean)) &&
    !hasDisableNotifVerb &&
    !hasEnableNotifVerb
  ) {
    return callNluTool(
      convex,
      "toggle_whatsapp_notifications",
      { showCurrent: true, targetMemberName: extractNotificationTargetMember() },
      snapshot,
      userId
    );
  }

  if (mentionsNotifTopic && (hasDisableNotifVerb || hasEnableNotifVerb)) {
    const enabled = hasDisableNotifVerb ? false : true;
    return callNluTool(
      convex,
      "toggle_whatsapp_notifications",
      {
        enabled,
        categories: notifCategories.length > 0 ? notifCategories : undefined,
        onlyCategories: onlyCategoriesFlag || undefined,
        targetMemberName: extractNotificationTargetMember(),
      },
      snapshot,
      userId
    );
  }

  // 0c. Alternar modo de rotina ("Mudar para modo manual", "Ativar modo por exceção")
  const hasRoutineSwitchVerb =
    /\b(?:mud(?:a|e|ar)|alter(?:a|e|ar)|ativ(?:a|e|ar)|defin(?:a|e|ir)|troc(?:a|e|ar)|coloc(?:a|ue|ar))\b/.test(
      clean
    );
  if (clean.includes("modo manual") && hasRoutineSwitchVerb) {
    return callNluTool(convex, "update_pet", { routineMode: "manual" }, snapshot, userId);
  }
  if (
    (clean.includes("modo por excecao") || clean.includes("modo automatico")) &&
    hasRoutineSwitchVerb
  ) {
    return callNluTool(convex, "update_pet", { routineMode: "automatic_by_exception" }, snapshot, userId);
  }

  // 0d. Listar pets / Listar membros / Código de compartilhamento / Gerar convite
  if (
    /^(?:meus\s+pets|quais\s+(?:sao\s+)?(?:os\s+)?(?:meus\s+)?pets|listar\s+pets)\??$/.test(clean)
  ) {
    return callNluTool(convex, "list_pets", {}, snapshot, userId);
  }
  if (
    /\b(?:tutores|membros|equipe)\b/.test(clean) &&
    /\b(?:quais|quem|listar|ver|mostrar)\b/.test(clean)
  ) {
    return callNluTool(convex, "list_pet_members", {}, snapshot, userId);
  }
  if (
    /\b(?:gerar|criar|fazer|enviar)\s+(?:um\s+)?convite\b/.test(clean) ||
    /\bconvidar\s+([A-Za-zÀ-ú0-9\s]{2,30})/.test(clean)
  ) {
    const nameMatch = messageText.match(
      /(?:convite\s+para\s+|convidar\s+)(?:o\s+|a\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú.\s]{1,25}?)(?=\s*(?:como\b|por\b|,|$))/i
    );
    const emailMatch = messageText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phoneMatch = messageText.match(/\+?\d[\d\s()-]{8,16}\d/);
    const role = clean.includes("vet")
      ? "vet_limited"
      : clean.includes("cuidador") || clean.includes("sitter")
      ? "caregiver_pro"
      : clean.includes("visualiz")
      ? "viewer"
      : "caregiver";
    return callNluTool(
      convex,
      "get_pet_share_code_or_invite",
      {
        createInvite: true,
        invitedName: nameMatch?.[1]?.trim(),
        invitedEmail: emailMatch?.[0],
        invitedPhone: phoneMatch?.[0],
        role,
        accessDays: role === "vet_limited" || role === "caregiver_pro" ? 30 : undefined,
      },
      snapshot,
      userId
    );
  }
  if (
    clean.includes("codigo de compartilhamento") ||
    clean.includes("codigo para compartilhar") ||
    /\bcodigo\s+do\s+pet\b/.test(clean) ||
    (/\b(?:qual|ver|mostrar)\b.*\bcodigo\b/.test(clean) && !clean.includes("medicamento"))
  ) {
    return callNluTool(convex, "get_pet_share_code_or_invite", {}, snapshot, userId);
  }

  // 0e. Excluir pet / Editar perfil do pet
  const deletePetMatch = messageText.match(
    /^(?:exclu(?:i|a|ir)|delet(?:a|e|ar)|apag(?:a|ue|ar)|remov(?:a|e|er))\s+(?:o\s+|a\s+)?pet\s+(.+)$/i
  );
  if (deletePetMatch?.[1]?.trim()) {
    return callNluTool(
      convex,
      "delete_pet",
      { petName: deletePetMatch[1].trim() },
      snapshot,
      userId
    );
  }

  const updatePetFieldMatch = messageText.match(
    /^(?:mud(?:a|e|ar)|alter(?:a|e|ar)|atualiz(?:a|e|ar)|defin(?:a|e|ir)|edit(?:a|e|ar))\s+(?:o\s+|a\s+)?(nome|raca|raça|especie|espécie|sexo|microchip|cor|pelagem|nascimento)\s+(?:do\s+pet\s+|da\s+pet\s+|de\s+[A-Za-zÀ-ú0-9]+\s+)?para\s+(.+)$/i
  );
  if (updatePetFieldMatch?.[1] && updatePetFieldMatch?.[2]) {
    const field = normalizeText(updatePetFieldMatch[1]);
    const val = updatePetFieldMatch[2].trim();
    const argsMap: Record<string, any> = {};
    if (field === "nome") argsMap.newName = val;
    else if (field === "raca") argsMap.breed = val;
    else if (field === "especie") argsMap.species = val;
    else if (field === "sexo") argsMap.sex = normalizeText(val).includes("femea") ? "Fêmea" : "Macho";
    else if (field === "microchip") argsMap.microchip = val;
    else if (field === "cor" || field === "pelagem") argsMap.color = val;
    else if (field === "nascimento") argsMap.birthDate = parseBrOrIsoDateToIso(val) || val;
    return callNluTool(convex, "update_pet", argsMap, snapshot, userId);
  }

  // 0f. Gestão do Prontuário / Saúde: Compromissos (Agendar / Listar) & Prescrições & Edição/Exclusão
  const newAppt = parseAppointmentFromText(messageText);
  if (newAppt) {
    return callNluTool(convex, "record_appointment", newAppt, snapshot, userId);
  }

  if (
    (/\b(?:consultas?|compromissos?|exames?|agenda)\b/.test(clean) &&
      /\b(?:proxim[ao]s?|agenda|quais|ver|listar|tem|marcadas?)\b/.test(clean) &&
      !clean.includes("remedio")) ||
    clean === "agenda" ||
    clean === "consultas"
  ) {
    return callNluTool(convex, "list_appointments", {}, snapshot, userId);
  }

  const rxReviewMatch = clean.match(
    /^(aprov(?:a|e|ar)|aceit(?:a|e|ar)|recus(?:a|e|ar)|rejeit(?:a|e|ar))\s+(?:a\s+)?(?:prescricao|receita)(?:\s+(?:d[eoa]\s+)?(.+))?$/i
  );
  if (rxReviewMatch) {
    const isReject = rxReviewMatch[1].startsWith("recus") || rxReviewMatch[1].startsWith("rejeit");
    const stockMatch = extractStockQuantityAndUnit(clean);
    const tail = rxReviewMatch[2]
      ? rxReviewMatch[2].replace(/\bcom\s+\d+.*$/i, "").trim()
      : undefined;
    return callNluTool(
      convex,
      "review_prescription",
      {
        action: isReject ? "reject" : "approve",
        medicationName: tail,
        initialStockQuantity: stockMatch?.quantity,
      },
      snapshot,
      userId
    );
  }

  // Editar ou excluir registros de saúde (nota clínica, pesagem, vacina, compromisso)
  const isHealthCrud =
    /\b(?:exclu(?:i|a|ir)|apag(?:a|ue|ar)|delet(?:a|e|ar)|remov(?:a|e|er)|cancel(?:a|e|ar)|edit(?:a|e|ar)|alter(?:a|e|ar)|corrig(?:e|ir)|mud(?:a|e|ar))\b/.test(
      clean
    ) &&
    /\b(?:nota|anotacao|prontuario|pesagem|peso|vacina|consulta|exame|compromisso|retorno|banho)\b/.test(
      clean
    );

  if (isHealthCrud) {
    const isEdit = /\b(?:edit|alter|corrig|mud)/.test(clean);
    const action = isEdit ? "edit" : "delete";
    let recordType: "clinical_note" | "weight" | "vaccine" | "appointment" = "clinical_note";
    if (/\b(?:peso|pesagem)\b/.test(clean)) recordType = "weight";
    else if (/\bvacina\b/.test(clean)) recordType = "vaccine";
    else if (/\b(?:consulta|exame|compromisso|retorno|banho)\b/.test(clean)) recordType = "appointment";

    const paraSplit = messageText.match(/\b(?:para|por)\s*[:,-]?\s+([\s\S]+)$/i);
    const newVal = paraSplit?.[1]?.trim();

    if (recordType === "clinical_note") {
      return callNluTool(
        convex,
        "manage_health_record",
        {
          recordType,
          action,
          newContent: isEdit ? newVal : undefined,
        },
        snapshot,
        userId
      );
    }

    if (recordType === "weight") {
      const wMatch = newVal?.match(/(\d+(?:[.,]\d+)?)/);
      return callNluTool(
        convex,
        "manage_health_record",
        {
          recordType,
          action,
          newWeightKg: wMatch ? parseFloat(wMatch[1].replace(",", ".")) : undefined,
        },
        snapshot,
        userId
      );
    }

    if (recordType === "vaccine") {
      const hintMatch = messageText.match(/\bvacina\s+(?:de\s+)?(.+?)(?=\s+(?:para|em)\b|$)/i);
      const hintClean = hintMatch?.[1]?.trim();
      const targetHint =
        hintClean && !/^(?:ultima|ultimo|recente)$/i.test(normalizeText(hintClean))
          ? hintClean
          : undefined;
      return callNluTool(
        convex,
        "manage_health_record",
        {
          recordType,
          action,
          targetHint,
          newDate: isEdit && newVal ? parseBrOrIsoDateToIso(newVal) : undefined,
          newTitle: isEdit && newVal && !parseBrOrIsoDateToIso(newVal) ? newVal : undefined,
        },
        snapshot,
        userId
      );
    }

    if (recordType === "appointment") {
      const hintMatch = messageText.match(
        /\b(?:consulta|exame|compromisso|retorno|banho)\s+(.+?)(?=\s+(?:para|dia)\b|$)/i
      );
      const hintClean = hintMatch?.[1]?.trim();
      const targetHint =
        hintClean && !/^(?:ultimo|ultima|recente|do|da)$/i.test(normalizeText(hintClean))
          ? hintClean
          : undefined;
      const newDate = isEdit && newVal ? parseBrOrIsoDateToIso(newVal) : undefined;
      const newTimeMatch = isEdit && newVal ? newVal.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i) : null;
      const newTime = newTimeMatch
        ? `${newTimeMatch[1].padStart(2, "0")}:${newTimeMatch[2] || "00"}`
        : undefined;
      return callNluTool(
        convex,
        "manage_health_record",
        {
          recordType,
          action,
          targetHint,
          newDate,
          newTime,
          newTitle: isEdit && newVal && !newDate && !newTime ? newVal : undefined,
        },
        snapshot,
        userId
      );
    }
  }

  // 0g. Medicamentos: Ficha completa, Editar horário/dose/instrução, Excluir/Parar medicamento
  if (
    (/\b(?:quais\s+(?:remedios|medicamentos)|ficha\s+de\s+(?:remedios|medicamentos)|listar\s+(?:remedios|medicamentos)|(?:remedios|medicamentos)\s+cadastrados)\b/.test(
      clean
    ) ||
      (clean.includes("toma") && clean.includes("?") && (clean.includes("remedio") || clean.includes("medicamento")))) &&
    !clean.includes("estoque")
  ) {
    return callNluTool(convex, "list_medications", {}, snapshot, userId);
  }

  const matchedMedInMsg = findMatchingMedicationCandidates(snapshot.medications, messageText).filter((m) =>
    hasWordInNormalizedText(clean, normalizeText(m.name))
  );

  if (
    /\b(?:exclu(?:i|a|ir)|delet(?:a|e|ar)|apag(?:a|ue|ar)|remov(?:a|e|er)|parou\s+de\s+tomar|suspend(?:a|e|er))\b/.test(
      clean
    ) &&
    (clean.includes("medicamento") || clean.includes("remedio") || matchedMedInMsg.length > 0) &&
    !clean.includes("estoque")
  ) {
    const explicitMedMatch = messageText.match(
      /(?:medicamento|rem[eé]dio|tomar)\s+([A-Za-zÀ-ú0-9\s-]{2,30})$/i
    );
    const medTarget = matchedMedInMsg[0]?.name || explicitMedMatch?.[1]?.trim();
    if (medTarget) {
      return callNluTool(convex, "delete_medication", { medicationName: medTarget }, snapshot, userId);
    }
  }

  if (
    /\b(?:mud(?:a|e|ar)|alter(?:a|e|ar)|atualiz(?:a|e|ar)|ajust(?:a|e|ar))\b/.test(clean) &&
    (clean.includes("horario") ||
      clean.includes("posologia") ||
      clean.includes("dosagem") ||
      clean.includes("dose") ||
      clean.includes("instruc") ||
      (matchedMedInMsg.length > 0 && /\b\d{1,2}\s*(?:h|:)\b/.test(clean))) &&
    !clean.includes("estoque") &&
    !clean.includes("saldo")
  ) {
    const targetMed =
      matchedMedInMsg[0] ||
      snapshot.medications.find((m) => clean.includes(normalizeText(m.name)));
    if (targetMed) {
      const timesInfo = extractTimesAndFrequency(messageText);
      const dosageMatch = messageText.match(/(\d+(?:[.,]\d+)?\s*(?:mg\/ml|mcg\/ml|mg|ml|mcg|ui))/i);
      const qtyDoseMatch = clean.includes("dose")
        ? clean.match(/(\d+(?:[.,]\d+)?)\s*(?:comprimidos?|capsulas?|doses?|gotas?|unidades?)/)
        : null;
      const instrMatch = clean.includes("instruc")
        ? messageText.match(/\b(?:para|como)\s+([\s\S]+)$/i)
        : null;
      return callNluTool(
        convex,
        "update_medication",
        {
          medicationName: targetMed.name,
          times: timesInfo.hasExplicitHint ? timesInfo.times : undefined,
          dosage: dosageMatch ? dosageMatch[1].replace(/\s+/g, "") : undefined,
          quantityPerAdministration: qtyDoseMatch
            ? parseFloat(qtyDoseMatch[1].replace(",", "."))
            : undefined,
          instructions: instrMatch?.[1]?.trim() || undefined,
        },
        snapshot,
        userId
      );
    }
  }

  // 0h. Estoque Avançado (Excluir do estoque / Alterar antecedência de alerta)
  if (
    /\b(?:exclu(?:i|a|ir)|delet(?:a|e|ar)|apag(?:a|ue|ar)|remov(?:a|e|er))\b/.test(clean) &&
    (clean.includes("estoque") || clean.includes("item"))
  ) {
    const matchedInv = findInventoryMatchesInMessage(messageText, snapshot);
    const nameMatch = messageText.match(
      /(?:exclu(?:i|a|ir)|delet(?:a|e|ar)|apag(?:a|ue|ar)|remov(?:a|e|er))\s+(?:o\s+|a\s+)?(?:item\s+)?(.+?)(?:\s+do\s+estoque|\s+de\s+estoque|$)/i
    );
    const targetName = matchedInv[0]?.name || nameMatch?.[1]?.trim();
    if (targetName) {
      return callNluTool(convex, "delete_inventory_item", { itemName: targetName }, snapshot, userId);
    }
  }

  if (
    (clean.includes("antecedencia") || clean.includes("dias antes") || /\bavisar\b.*\bdias\b/.test(clean)) &&
    /\b\d+\s*dias?\b/.test(clean)
  ) {
    const daysMatch = clean.match(/(\d+)\s*dias?/);
    const matchedInv = findInventoryMatchesInMessage(messageText, snapshot);
    if (daysMatch && matchedInv[0]) {
      return callNluTool(
        convex,
        "update_inventory_lead_time",
        {
          itemName: matchedInv[0].name,
          purchaseLeadTimeDays: parseInt(daysMatch[1], 10),
        },
        snapshot,
        userId
      );
    }
  }

  // 0i. Lista de Compras (Adicionar / Marcar como comprado / Desmarcar) e Histórico de Compras (Gastos)
  if (
    /\b(?:historico\s+de\s+compras|ultimas\s+compras|quanto\s+gastei|gastos?\s+(?:com\s+)?(?:pet|compras)|resumo\s+de\s+compras)\b/.test(
      clean
    )
  ) {
    return callNluTool(convex, "list_purchases", {}, snapshot, userId);
  }

  const addShopMatch = messageText.match(
    /^(?:adicion(?:a|e|ar)|coloc(?:a|ue|ar)|inclu(?:i|a|ir)|bota(?:r)?|anot(?:a|e|ar))\s+(?:o\s+|a\s+|um\s+|uma\s+)?(.+?)\s+(?:na|à|a|no)\s+lista\s+de\s+compras\b/i
  );
  if (addShopMatch?.[1]?.trim()) {
    const bodyShop = addShopMatch[1].trim();
    const qtyUnit = extractStockQuantityAndUnit(bodyShop);
    const itemName = qtyUnit
      ? bodyShop.replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|unidades?|un|comprimidos?|c[aá]psulas?|ml)?\s*(?:de\s+)?/i, "").trim() || bodyShop
      : bodyShop;
    return callNluTool(
      convex,
      "add_shopping_list_item",
      {
        itemName,
        quantity: qtyUnit?.quantity || 1,
        unit: qtyUnit?.unit || "un",
      },
      snapshot,
      userId
    );
  }

  const toggleShopMatch = messageText.match(
    /^(?:marcar|marque|riscar|risque|desmarcar|desmarque)\s+(?:o\s+|a\s+)?(.+?)\s+(?:como\s+(?:comprad[oa]|pendente)|da\s+lista(?:\s+de\s+compras)?)$/i
  );
  if (toggleShopMatch?.[1]?.trim()) {
    const isUnmark = clean.includes("desmarc") || clean.includes("pendente");
    return callNluTool(
      convex,
      "toggle_shopping_list_item",
      {
        itemName: toggleShopMatch[1].trim(),
        isPurchased: !isUnmark,
      },
      snapshot,
      userId
    );
  }

  // 1. Perguntas de consulta rápida (Q&A) e consultas de estoque
  const hasStockMutationVerb =
    /\b(?:comprei|compramos|chegou|chegaram|adicionei|adiciona|adicionou|repus|repor|atualiza|atualizar|atualize|muda|mudar|mude|define|definir|defina|coloca|colocar|ajusta|ajustar|ajuste|altera|alterar|altere|pesei|contei)\b/.test(
      clean
    );
  const looksLikeStockAssignment =
    /\b(?:e|sao|esta com|tem|foi para|agora tem)\s+\d+(?:[.,]\d+)?/.test(clean) ||
    /[:=]\s*\d/.test(clean);
  const isQuestionLike =
    clean.includes("?") ||
    /^(?:qual|quais|quanto|quantos|quando|como esta|alguem|ja deram|tem )\b/.test(clean);
  const isDirectStockQuery =
    !hasStockMutationVerb &&
    !looksLikeStockAssignment &&
    (/^(?:estoque|saldo|previsao)\b/.test(clean) ||
      clean.includes("o que esta acabando") ||
      clean.includes("quais remedios estao acabando") ||
      clean.includes("o que precisa comprar") ||
      clean.includes("itens em falta"));

  if (isQuestionLike || isDirectStockQuery) {
    const matchedInventory = findInventoryMatchesInMessage(messageText, snapshot);
    const isAskingAboutTodayDose =
      clean.includes("ja deram") ||
      clean.includes("tomei") ||
      clean.includes("tomou") ||
      clean.includes("horario") ||
      clean.includes("doses de hoje") ||
      clean.includes("tomou o remedio");

    // 1a. Consulta específica de item no estoque ("Qual é o estoque atual de bezafibrato?")
    if (
      matchedInventory.length > 0 &&
      !isAskingAboutTodayDose &&
      (clean.includes("estoque") ||
        clean.includes("saldo") ||
        clean.includes("quanto") ||
        clean.includes("quantos") ||
        clean.includes("restam") ||
        clean.includes("sobrou") ||
        clean.includes("acabar") ||
        clean.includes("acaba") ||
        clean.includes("dura") ||
        isQuestionLike ||
        isDirectStockQuery)
    ) {
      return {
        handled: true,
        replyText: matchedInventory
          .map((item) => formatInventoryItemDetail(item, snapshot.pet.name))
          .join("\n\n---\n\n"),
        actionTaken: "question_answered",
        nextState: "IDLE",
        usedGemini: false,
      };
    }

    // 1a-ii. O que está acabando / precisa comprar
    if (
      clean.includes("acabando") ||
      clean.includes("precisa comprar") ||
      clean.includes("em falta") ||
      clean.includes("estoque baixo")
    ) {
      const lowItems = snapshot.inventory.filter((i) => i.forecast.status !== "OK");
      if (lowItems.length === 0) {
        return {
          handled: true,
          replyText: `✅ Todo o estoque de *${snapshot.pet.name}* está em dia no momento! Nenhum item em estado de atenção ou falta.`,
          actionTaken: "question_answered",
          nextState: "IDLE",
          usedGemini: false,
        };
      }
      const lines = lowItems.map((i) => {
        const dStr =
          i.forecast.daysRemaining === Infinity
            ? "sob demanda"
            : `~${Math.round(i.forecast.daysRemaining)} dia(s)`;
        return `⚠️ *${i.name}*: *${i.currentQuantity} ${i.unit}* (${dStr}) — *${i.forecast.status}*`;
      });
      return {
        handled: true,
        replyText:
          `⚠️ *Itens em Alerta de Estoque — ${snapshot.pet.name}:*\n\n${lines.join("\n")}\n\n` +
          `💡 _Para repor, envie: "Comprei X de [nome]"._`,
        actionTaken: "question_answered",
        nextState: "IDLE",
        usedGemini: false,
      };
    }

    // 1a-iii. Estoque geral dos medicamentos/remédios
    if (
      (clean.includes("estoque") ||
        clean.includes("saldo") ||
        clean.includes("duram") ||
        clean.includes("previsao")) &&
      (clean.includes("remedio") || clean.includes("medicamento"))
    ) {
      const medsInv = snapshot.inventory.filter((i) => i.category === "medicamento");
      if (medsInv.length === 0) {
        return {
          handled: true,
          replyText: `💊 *${snapshot.pet.name}* ainda não possui medicamentos cadastrados no estoque.`,
          actionTaken: "question_answered",
          nextState: "IDLE",
          usedGemini: false,
        };
      }
      const lines = medsInv.map((m) => {
        const dStr =
          m.forecast.daysRemaining === Infinity
            ? "sob demanda"
            : `~${Math.round(m.forecast.daysRemaining)} dia(s)`;
        return `• *${m.name}*: *${m.currentQuantity} ${m.unit}* (${m.dailyConsumption}/dia • ${dStr}) — *${m.forecast.status}*`;
      });
      return {
        handled: true,
        replyText: `💊 *Estoque de Medicamentos — ${snapshot.pet.name}:*\n\n${lines.join("\n")}`,
        actionTaken: "question_answered",
        nextState: "IDLE",
        usedGemini: false,
      };
    }

    // 1a-iv. Previsão de ração ou estoque geral
    if (
      clean.includes("racao") ||
      clean.includes("comida") ||
      clean.includes("acabar") ||
      clean.includes("dura") ||
      clean.includes("estoque") ||
      clean.includes("saldo")
    ) {
      if (!clean.includes("racao") && !clean.includes("comida") && snapshot.inventory.length > 0) {
        const lines = snapshot.inventory.map((i) => {
          const dStr =
            i.forecast.daysRemaining === Infinity
              ? "sob demanda"
              : `~${Math.round(i.forecast.daysRemaining)} dia(s)`;
          return `• *${i.name}*: *${i.currentQuantity} ${i.unit}* (${dStr}) — *${i.forecast.status}*`;
        });
        return {
          handled: true,
          replyText: `📦 *Resumo do Estoque — ${snapshot.pet.name}:*\n\n${lines.join("\n")}`,
          actionTaken: "question_answered",
          nextState: "IDLE",
          usedGemini: false,
        };
      }

      const racao = snapshot.inventory.find((i) => i.category === "racao") || snapshot.inventory[0];
      if (!racao) {
        return {
          handled: true,
          replyText: `📦 *${snapshot.pet.name}* ainda não tem nenhuma ração cadastrada no estoque.`,
          nextState: "IDLE",
          usedGemini: false,
        };
      }
      return {
        handled: true,
        replyText: formatInventoryItemDetail(racao, snapshot.pet.name),
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

  // 1e. Receita / Uso contínuo / Novos Medicamentos (suporta 1 ou múltiplos medicamentos na mesma frase)
  const medCreations = parseMedicationsFromText(messageText, petNamesList);
  if (medCreations.length > 0) {
    const replies: string[] = [];
    const actions: string[] = [];
    let finalState = "IDLE";
    let finalPayload: string | undefined;

    for (const med of medCreations) {
      const exec = await executeAssistantToolCall({
        convex,
        toolName: "create_medication",
        args: med,
        snapshot,
        userId,
      });
      replies.push(exec.replyText);
      if (exec.actionTaken && !actions.includes(exec.actionTaken)) {
        actions.push(exec.actionTaken);
      }
      if (exec.nextState && exec.nextState !== "IDLE") {
        finalState = exec.nextState;
        finalPayload = exec.pendingActionPayload;
      }
    }

    return {
      handled: true,
      replyText: replies.join("\n\n---\n\n"),
      actionTaken: actions.join(",") || "medication_created",
      nextState: finalState,
      pendingActionPayload: finalPayload,
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

  // 1g. Cadastro direto de item/ração no estoque ("Cadastre Fresh Meat para o Tonico")
  const inventoryCreation = parseInventoryItemCreationFromText(messageText, petNamesList);
  if (inventoryCreation) {
    const exec = await executeAssistantToolCall({
      convex,
      toolName: "create_inventory_item",
      args: {
        name: inventoryCreation.name,
        category: inventoryCreation.category,
        unit: inventoryCreation.unit,
        initialQuantity: inventoryCreation.initialQuantity,
        notes: messageText.trim(),
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

  const extractDoseTimeHint = (): string | undefined => {
    const timeMatch = clean.match(/(\d{1,2})\s*(?:h|hs|horas|:(\d{2}))/);
    if (timeMatch) {
      return `${timeMatch[1].padStart(2, "0")}:${timeMatch[2] || "00"}`;
    }
    if (clean.includes("manha") || clean.includes("cedo")) return "manha";
    if (clean.includes("tarde")) return "tarde";
    if (clean.includes("noite")) return "noite";
    return undefined;
  };

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
    const matchedMed = snapshot.medications.find((m) =>
      clean.includes(normalizeText(m.name))
    );

    const exec = await executeAssistantToolCall({
      convex,
      toolName: "update_medication_dose",
      args: {
        medicationName: matchedMed?.name,
        scheduledTimeHint: extractDoseTimeHint(),
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

  // 2a. Administração positiva de medicamento ("Dei Bezafibrato agora", "Tomou o remédio das 12h")
  const matchedAdminMed = snapshot.medications.find((m) =>
    clean.includes(normalizeText(m.name))
  );
  const hasAdminVerb = /\b(?:dei|demos|administrei|administrado|apliquei|tomou)\b/.test(
    clean
  );
  if (
    hasAdminVerb &&
    (Boolean(matchedAdminMed) ||
      /\b(?:remedio|medicamento|dose)\b/.test(clean)) &&
    !clean.includes("nao ") &&
    !clean.includes("racao") &&
    !clean.includes("comida") &&
    !clean.includes("kg") &&
    !clean.includes("?")
  ) {
    const exec = await executeAssistantToolCall({
      convex,
      toolName: "update_medication_dose",
      args: {
        medicationName: matchedAdminMed?.name,
        scheduledTimeHint: extractDoseTimeHint(),
        status: "administered",
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
    clean.includes("chegaram") ||
    clean.includes("repor") ||
    clean.includes("repus") ||
    clean.includes("reposicao") ||
    ((clean.includes("adicionei") || clean.includes("coloquei")) && clean.includes("estoque"))
  ) {
    const qtyUnit = extractStockQuantityAndUnit(clean);
    const matchedItems = findInventoryMatchesInMessage(messageText, snapshot);

    // Tentar descobrir qual item do estoque foi comprado ou extrair nome da frase
    let itemName = matchedItems[0]?.name;

    if (!itemName) {
      if (clean.includes("racao") || clean.includes("comida")) {
        itemName = "Ração";
      } else {
        const deMatch = messageText.match(/\bde\s+([A-Za-zÀ-ú0-9\s-]{2,30})$/i);
        itemName = deMatch ? deMatch[1].trim() : "Item de Pet";
      }
    }

    if (!qtyUnit) {
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

    const qty = qtyUnit.quantity;
    const unit = qtyUnit.unit || matchedItems[0]?.unit || "unidades";
    const { totalPrice, supplier } = extractPurchasePriceAndSupplier(messageText);

    const exec = await executeAssistantToolCall({
      convex,
      toolName: "record_purchase",
      args: {
        itemName,
        quantity: qty,
        unit,
        totalPrice,
        supplier,
        notes: messageText.trim(),
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

  // 4. Ajuste físico ou definição direta de estoque ("Atualiza o estoque de bezafibrato para 4", "pesei o balde e tem 4,2kg")
  const matchedForAdjust = findInventoryMatchesInMessage(messageText, snapshot);
  const isDirectStockCommand =
    /\b(?:atualiz(?:a|e|ar)|mud(?:a|e|ar)|defin(?:a|e|ir)|ajust(?:a|e|ar)|alter(?:a|e|ar))\b/.test(
      clean
    ) &&
    (clean.includes("estoque") ||
      clean.includes("saldo") ||
      matchedForAdjust.length > 0);
  const isDirectStockDeclaration =
    (clean.includes("estoque") || clean.includes("saldo")) &&
    /\b(?:e|sao|esta com|tem|foi para|agora tem)\s+\d+(?:[.,]\d+)?/.test(clean) &&
    !/\b(?:qual|quanto|quantos|como)\b/.test(clean);
  const isPhysicalStockCheck =
    (clean.includes("balde") ||
      clean.includes("pote") ||
      clean.includes("saco") ||
      clean.includes("cartela") ||
      clean.includes("caixa") ||
      clean.includes("estoque") ||
      clean.includes("contei") ||
      matchedForAdjust.length > 0) &&
    (clean.includes("tem ") ||
      clean.includes("restam") ||
      clean.includes("sobrou") ||
      clean.includes("sobraram") ||
      clean.includes("so tem") ||
      clean.includes("so estao"));

  if (
    (isDirectStockCommand || isDirectStockDeclaration || isPhysicalStockCheck) &&
    !clean.includes("?")
  ) {
    const qtyUnit = extractStockQuantityAndUnit(clean);
    if (qtyUnit) {
      const qty = qtyUnit.quantity;
      const matchedItem = matchedForAdjust[0];
      const unit = qtyUnit.unit || matchedItem?.unit;
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

  // 5a-config. Configuração de consumo diário ("O consumo diário de ração é 240g", "Consumo diário de bezafibrato é 2 comprimidos")
  const isDailyConfig =
    (clean.includes("consumo diario") ||
      clean.includes("por dia") ||
      clean.includes("diariamente") ||
      clean.includes("porcao diaria") ||
      /\bcome\s+\d+/.test(clean)) &&
    !clean.includes("nao ") &&
    !clean.includes("comeu");

  if (isDailyConfig) {
    const matchedDaily = findInventoryMatchesInMessage(messageText, snapshot)[0];
    const dailyQtyMatch = extractStockQuantityAndUnit(clean);
    if (dailyQtyMatch && dailyQtyMatch.quantity > 0) {
      const exec = await executeAssistantToolCall({
        convex,
        toolName: "update_daily_consumption",
        args: {
          itemName: matchedDaily?.name,
          dailyQuantityGrams: dailyQtyMatch.quantity,
          unit: dailyQtyMatch.unit,
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

  // 6. Nota clínica / diário de sintomas e observações livres
  const clinicalKeywordPatterns = [
    /\bincontinencia\b/,
    /\burinari[ao]s?\b/,
    /\burina(?:r|ndo|da)?\b/,
    /\bxixi\b/,
    /\bfezes\b/,
    /\bsangue\b/,
    /\bferid[ao]s?\b/,
    /\bmachucad[ao]s?\b/,
    /\bles(?:ao|oes)\b/,
    /\bcaroc[ao]s?\b/,
    /\bnodul[ao]s?\b/,
    /\balergi(?:a|as|c[ao]s?)\b/,
    /\bdermatite\b/,
    /\botite\b/,
    /\binfecc(?:ao|oes)\b/,
    /\binflamac(?:ao|oes)\b/,
    /\bdor(?:es)?\b/,
    /\bfebre\b/,
    /\bconvuls(?:ao|oes)\b/,
    /\btrem(?:or|ores|endo)\b/,
    /\bcansac[oa]\b/,
    /\bcansad[ao]\b/,
    /falta\s+de\s+ar/,
    /\bengasg/,
    /\bsecrec(?:ao|oes)\b/,
    /\bremela\b/,
    /\bolhos?\b/,
    /\bpele\b/,
    /queda\s+de\s+pelo/,
    /\bdentes?\b/,
    /\bgengiva\b/,
    /\bestomago\b/,
    /\bintestino\b/,
    /\bconstipa/,
    /\bdiarreia\b/,
    /\bcocando\b/,
    /\bcoceira\b/,
    /\borelha\b/,
    /\bmancando\b/,
    /\bvomit(?:ou|o|ando|os)?\b/,
    /\bapati(?:a|c[ao])\b/,
    /\btoss(?:e|indo)\b/,
    /\bespirr/,
    /\bmelhor(?:a|ou|ando)?\b/,
    /\bpior(?:a|ou|ando)?\b/,
    /\breac(?:ao|oes)\b/,
    /efeito\s+colateral/,
    /\bsintomas?\b/,
    /\bobservac(?:ao|oes)\b/,
    /\binchad[ao]s?\b/,
    /\binchaco\b/,
    /\bvermelhid/,
    /\blambendo\b/,
    /\bchorando\b/,
    /\bgemendo\b/,
    /\bintoxic/,
  ];

  const hasClinicalDescriptor =
    /\b(?:esta\s+com|ta\s+com|teve|apresentou|apareceu\s+com|diagnosticad[oa]\s+com|suspeita\s+de|em\s+observacao|testando\s+.+\b(?:medicamento|remedio|tratamento|melhora))\b/.test(
      clean
    );

  const isClinicalNote =
    Boolean(explicitNoteContent) ||
    clinicalKeywordPatterns.some((rx) => rx.test(clean)) ||
    hasClinicalDescriptor;

  if (isClinicalNote && !clean.includes("?")) {
    const cleanedContent =
      explicitNoteContent ||
      messageText
        .replace(/^(?:anot[ae]\s+(?:a[ií]\s+)?(?:que\s+)?|nota\s*:\s*)/i, "")
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

      const interactionPromise = client.interactions.create({
        model: AI_MODEL_NAME,
        system_instruction: buildSystemInstruction(snapshot),
        input: interactionInput,
        tools: ASSISTANT_TOOLS,
        store: false,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini interactions timeout (5500ms)")), 5500)
      );
      const interaction = await Promise.race([interactionPromise, timeoutPromise]);

      const functionCalls = (interaction.steps || []).filter(
        (step): step is Extract<typeof step, { type: "function_call" }> =>
          step.type === "function_call"
      );

      if (functionCalls.length > 0) {
        const replies: string[] = [];
        const actions: string[] = [];
        let nextState = "IDLE";
        let pendingActionPayload: string | undefined;
        let newActivePetId: string | undefined;

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
          if (exec.newActivePetId) {
            newActivePetId = exec.newActivePetId;
          }
        }

        return {
          handled: true,
          replyText: `${mediaPrefix}${replies.join("\n\n")}`,
          actionTaken: actions.length > 0 ? actions.join(",") : undefined,
          nextState,
          pendingActionPayload,
          newActivePetId,
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
