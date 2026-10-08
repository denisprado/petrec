import { addDays, differenceInCalendarDays, format, isBefore, isToday, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export type StockStatus =
  | "OK"
  | "ATENÇÃO"
  | "COMPRAR AGORA"
  | "SEM ESTOQUE"
  | "ESTOQUE INSUFICIENTE";

export interface StockCalculationResult {
  currentQuantity: number;
  dailyConsumption: number;
  unit: string;
  daysRemaining: number;
  estimatedEndDate: Date | null;
  idealPurchaseDate: Date | null;
  status: StockStatus;
  statusBadgeColor: string;
  isOverdue: boolean;
  overdueDays: number;
  comprarAteLabel: string;
  leadTimeDays: number;
  description: string;
}

/**
 * Calcula o estoque estimado, previsão de término e data ideal de compra.
 * Princípio central: O estoque e o consumo real determinam quando algo precisa ser comprado.
 */
export function calculateStockForecast(params: {
  currentQuantity: number;
  dailyConsumption: number;
  unit: string;
  purchaseLeadTimeDays?: number;
  referenceDate?: Date;
}): StockCalculationResult {
  const {
    currentQuantity,
    dailyConsumption,
    unit,
    purchaseLeadTimeDays = 7,
    referenceDate = new Date(),
  } = params;

  const today = startOfDay(referenceDate);

  // 1. Caso sem consumo diário cadastrado ou quantidade zerada
  if (currentQuantity <= 0) {
    return {
      currentQuantity: 0,
      dailyConsumption,
      unit,
      daysRemaining: 0,
      estimatedEndDate: today,
      idealPurchaseDate: today,
      status: "SEM ESTOQUE",
      statusBadgeColor: "bg-red-500 text-white border-red-600",
      isOverdue: true,
      overdueDays: purchaseLeadTimeDays,
      comprarAteLabel: "HOJE (SEM ESTOQUE)",
      leadTimeDays: purchaseLeadTimeDays,
      description: "Produto esgotado! Necessária reposição imediata.",
    };
  }

  if (dailyConsumption <= 0) {
    return {
      currentQuantity,
      dailyConsumption: 0,
      unit,
      daysRemaining: Infinity,
      estimatedEndDate: null,
      idealPurchaseDate: null,
      status: "OK",
      statusBadgeColor: "bg-emerald-500 text-white border-emerald-600",
      isOverdue: false,
      overdueDays: 0,
      comprarAteLabel: "Sem consumo diário fixo",
      leadTimeDays: purchaseLeadTimeDays,
      description: "Consumo diário sob demanda.",
    };
  }

  // 2. Cálculo dos dias de estoque disponível
  const daysRemaining = Math.max(0, currentQuantity / dailyConsumption);
  const estimatedEndDate = addDays(today, Math.floor(daysRemaining));
  const idealPurchaseDate = addDays(estimatedEndDate, -purchaseLeadTimeDays);

  const daysUntilIdealPurchase = differenceInCalendarDays(idealPurchaseDate, today);
  const isOverdue = daysUntilIdealPurchase < 0;
  const overdueDays = isOverdue ? Math.abs(daysUntilIdealPurchase) : 0;

  // 3. Determinação do Estado do Estoque
  let status: StockStatus = "OK";
  let statusBadgeColor = "bg-emerald-500 text-white border-emerald-600";
  let comprarAteLabel = format(idealPurchaseDate, "dd/MM/yyyy", { locale: ptBR });
  let description = `Resta estoque para aproximadamente ${Math.round(daysRemaining)} dias.`;

  if (daysRemaining <= 0) {
    status = "SEM ESTOQUE";
    statusBadgeColor = "bg-red-600 text-white border-red-700";
    comprarAteLabel = "HOJE";
    description = "Estoque zerado.";
  } else if (daysRemaining < purchaseLeadTimeDays) {
    // O estoque que resta não cobre a antecedência mínima de compra necessária
    status = "ESTOQUE INSUFICIENTE";
    statusBadgeColor = "bg-red-500 text-white border-red-600";
    comprarAteLabel = "HOJE";
    description = `Estoque cobre apenas ${Math.round(daysRemaining)} dias (menor que a antecedência de ${purchaseLeadTimeDays} dias).`;
  } else if (daysUntilIdealPurchase <= 0) {
    status = "COMPRAR AGORA";
    statusBadgeColor = "bg-rose-500 text-white border-rose-600";
    comprarAteLabel = isToday(idealPurchaseDate) ? "HOJE" : `HOJE (Atrasado há ${overdueDays} dia${overdueDays > 1 ? "s" : ""})`;
    description = isOverdue
      ? `Prazo de compra ideal ultrapassado há ${overdueDays} dia${overdueDays > 1 ? "s" : ""}. Comprar urgentemente.`
      : "Data ideal de compra atingida hoje.";
  } else if (daysUntilIdealPurchase <= 5) {
    // Próximo da janela de compra (dentro de 5 dias ou margem)
    status = "ATENÇÃO";
    statusBadgeColor = "bg-amber-500 text-white border-amber-600";
    comprarAteLabel = format(idealPurchaseDate, "dd/MM/yyyy", { locale: ptBR });
    description = `Comprar em ${daysUntilIdealPurchase} dia${daysUntilIdealPurchase > 1 ? "s" : ""} (${format(idealPurchaseDate, "dd/MM")}).`;
  } else {
    status = "OK";
    statusBadgeColor = "bg-emerald-500 text-white border-emerald-600";
    comprarAteLabel = format(idealPurchaseDate, "dd/MM/yyyy", { locale: ptBR });
    description = `Estoque suficiente até ${format(estimatedEndDate, "dd/MM/yyyy")}.`;
  }

  return {
    currentQuantity,
    dailyConsumption,
    unit,
    daysRemaining,
    estimatedEndDate,
    idealPurchaseDate,
    status,
    statusBadgeColor,
    isOverdue,
    overdueDays,
    comprarAteLabel,
    leadTimeDays: purchaseLeadTimeDays,
    description,
  };
}
