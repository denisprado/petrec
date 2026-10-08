import React from "react";
import { StockStatus } from "@/lib/stockCalculation";
import { AlertCircle, AlertTriangle, CheckCircle, PackageX } from "lucide-react";

interface Props {
  status: StockStatus;
  comprarAteLabel?: string;
  isOverdue?: boolean;
  overdueDays?: number;
  compact?: boolean;
}

export function StockForecastBadge({
  status,
  comprarAteLabel,
  isOverdue,
  overdueDays = 0,
  compact = false,
}: Props) {
  switch (status) {
    case "COMPRAR AGORA":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-sm ${
            compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs"
          } bg-red-100 text-red-800 border-red-300 animate-pulse`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
          <span>COMPRAR AGORA</span>
          {overdueDays > 0 && !compact && (
            <span className="text-[10px] bg-red-200 text-red-900 px-1.5 py-0.2 rounded font-bold">
              +{overdueDays}d atrasado
            </span>
          )}
        </span>
      );

    case "SEM ESTOQUE":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-sm ${
            compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs"
          } bg-red-600 text-white border-red-700`}
        >
          <PackageX className="w-3.5 h-3.5" />
          <span>SEM ESTOQUE</span>
        </span>
      );

    case "ESTOQUE INSUFICIENTE":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-sm ${
            compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs"
          } bg-rose-100 text-rose-800 border-rose-300`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          <span>ESTOQUE INSUFICIENTE</span>
        </span>
      );

    case "ATENÇÃO":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-sm ${
            compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs"
          } bg-amber-100 text-amber-800 border-amber-300`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>ATENÇÃO</span>
        </span>
      );

    case "OK":
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-sm ${
            compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs"
          } bg-emerald-100 text-emerald-800 border-emerald-300`}
        >
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span>EM DIA (OK)</span>
        </span>
      );
  }
}
