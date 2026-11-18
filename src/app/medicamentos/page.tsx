"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import {
  Pill,
  Clock,
  CheckCircle2,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Package,
  Sparkles,
  Search,
  Filter,
  RotateCcw,
} from "lucide-react";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MedicationModal } from "@/components/MedicationModal";
import { StockForecastBadge } from "@/components/StockForecastBadge";

function safeFormat(dateVal: any, formatPattern: string, options?: any): string {
  if (!dateVal) return "";
  try {
    const d = typeof dateVal === "number" || typeof dateVal === "string" ? new Date(dateVal) : dateVal;
    if (!isValid(d)) return "";
    return format(d, formatPattern, options);
  } catch {
    return "";
  }
}

function formatScheduledTime(dateVal: any): string {
  if (!dateVal) return "--:--";
  const match = String(dateVal).match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  return safeFormat(dateVal, "HH:mm") || "--:--";
}

function parseScheduleTimes(rawTimes: any): string[] {
  if (Array.isArray(rawTimes)) {
    return rawTimes.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof rawTimes === "string") {
    try {
      const parsed = JSON.parse(rawTimes);
      if (Array.isArray(parsed)) {
        return parsed.map((t) => String(t).trim()).filter(Boolean);
      }
    } catch {
      return rawTimes
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter((t) => /^\d{1,2}:\d{2}$/.test(t));
    }
  }
  return [];
}

function getTimePeriod(timeStr: string): "morning" | "afternoon" | "night" {
  const hour = parseInt((timeStr || "").split(":")[0] || "0", 10);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "night";
}

function normalizeSearch(value: any): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function MedicamentosPage() {
  const { activePetId, setActivePetId, pets, currentUser, refreshTrigger, triggerRefresh, permissions } = useApp();
  const [medications, setMedications] = useState<any[]>([]);
  const [administrations, setAdministrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [routineMode, setRoutineMode] = useState<string>("automatic_by_exception");

  // Filtros e ordenação
  const [searchQuery, setSearchQuery] = useState("");
  const [admStatusFilter, setAdmStatusFilter] = useState<"all" | "pending" | "administered" | "skipped">("all");
  const [admPeriodFilter, setAdmPeriodFilter] = useState<"all" | "morning" | "afternoon" | "night">("all");
  const [medStatusFilter, setMedStatusFilter] = useState<"all" | "active" | "pending_tutor_approval">("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "ok">("all");
  const [presentationFilter, setPresentationFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name_asc" | "next_time" | "lowest_stock">("name_asc");

  // Modal de criação / edição
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedMedication, setSelectedMedication] = useState<any>(null);

  // Modal de confirmação de exclusão rápida
  const [deleteConfirmMed, setDeleteConfirmMed] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      const petIdToFetch = activePetId || pets[0]?.id;
      if (!petIdToFetch) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const dashUrl = currentUser?.id
          ? `/api/dashboard?petId=${petIdToFetch}&userId=${currentUser.id}`
          : `/api/dashboard?petId=${petIdToFetch}`;

        const [medRes, dashRes] = await Promise.all([
          fetch(`/api/medications?petId=${petIdToFetch}`),
          fetch(dashUrl),
        ]);
        if (medRes.ok) {
          const data = await medRes.json();
          if (!isCancelled) {
            setMedications(data.medications || []);
            setAdministrations(data.administrationsToday || []);
            if (!activePetId && petIdToFetch) {
              setActivePetId(petIdToFetch);
            }
          }
        }
        if (dashRes.ok) {
          const dashData = await dashRes.json();
          if (!isCancelled && dashData.activePet?.routineMode) {
            setRoutineMode(dashData.activePet.routineMode);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar medicamentos:", err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [activePetId, pets, currentUser?.id, refreshTrigger, setActivePetId]);

  const handleToggleRoutineMode = async (newMode: "manual" | "automatic_by_exception") => {
    const petId = activePetId || pets[0]?.id;
    if (!petId) return;
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_routine_mode",
          petId,
          routineMode: newMode,
          userId: currentUser.id,
        }),
      });
      if (res.ok) {
        setRoutineMode(newMode);
        setFeedback(
          newMode === "automatic_by_exception"
            ? "🔄 Modo por Exceção Ativado! Doses agendadas são administradas automaticamente."
            : "✍️ Modo Manual Ativado! Doses debitadas apenas quando confirmadas."
        );
        setTimeout(() => setFeedback(null), 3500);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminister = async (
    administrationId: string,
    status: "administered" | "skipped" | "missed"
  ) => {
    try {
      const res = await fetch("/api/medications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          administrationId,
          status,
          userId: currentUser.id,
        }),
      });

      if (res.ok) {
        setFeedback(
          status === "administered"
            ? `✓ Medicamento administrado e registrado por ${currentUser.name.split(" ")[0]}!`
            : status === "skipped"
            ? "✓ Dose marcada como pulada (estoque de medicamento estornado com sucesso)!"
            : "Registro atualizado."
        );
        setTimeout(() => setFeedback(null), 3500);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMedication = async (medId: string) => {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/medications?medicationId=${medId}&userId=${currentUser.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setFeedback("✓ Medicamento excluído com sucesso.");
        setTimeout(() => setFeedback(null), 3000);
        setDeleteConfirmMed(null);
        triggerRefresh();
      } else {
        const data = await res.json();
        alert(data.error || "Erro ao excluir medicamento.");
      }
    } catch (err: any) {
      alert(err.message || "Erro de conexão ao excluir.");
    } finally {
      setDeleting(false);
    }
  };

  const normalizedQuery = normalizeSearch(searchQuery);

  const hasActiveFilters =
    Boolean(normalizedQuery) ||
    admStatusFilter !== "all" ||
    admPeriodFilter !== "all" ||
    medStatusFilter !== "all" ||
    stockFilter !== "all" ||
    presentationFilter !== "all" ||
    sortBy !== "name_asc";

  const clearAllFilters = () => {
    setSearchQuery("");
    setAdmStatusFilter("all");
    setAdmPeriodFilter("all");
    setMedStatusFilter("all");
    setStockFilter("all");
    setPresentationFilter("all");
    setSortBy("name_asc");
  };

  const matchesMedSearch = (med: any) => {
    if (!normalizedQuery) return true;
    const haystack = normalizeSearch(
      [
        med?.name,
        med?.activeIngredient,
        med?.dosage,
        med?.instructions,
        med?.veterinarian,
        med?.presentation,
        med?.notes,
      ]
        .filter(Boolean)
        .join(" ")
    );
    return haystack.includes(normalizedQuery);
  };

  const administrationsBySearchAndPeriod = useMemo(() => {
    return administrations.filter((adm) => {
      if (normalizedQuery) {
        const admHaystack = normalizeSearch(
          [
            adm.medication?.name,
            adm.medication?.activeIngredient,
            adm.medication?.dosage,
            adm.medication?.instructions,
            adm.medication?.veterinarian,
            adm.notes,
          ]
            .filter(Boolean)
            .join(" ")
        );
        if (!admHaystack.includes(normalizedQuery)) return false;
      }

      if (admPeriodFilter !== "all") {
        const timeStr = formatScheduledTime(adm.scheduledAt);
        if (getTimePeriod(timeStr) !== admPeriodFilter) return false;
      }

      return true;
    });
  }, [administrations, normalizedQuery, admPeriodFilter]);

  const admCounts = useMemo(() => {
    let pending = 0;
    let administered = 0;
    let skipped = 0;
    for (const adm of administrationsBySearchAndPeriod) {
      if (adm.status === "administered") administered++;
      else if (adm.status === "skipped") skipped++;
      else pending++;
    }
    return {
      all: administrationsBySearchAndPeriod.length,
      pending,
      administered,
      skipped,
    };
  }, [administrationsBySearchAndPeriod]);

  const filteredAdministrations = useMemo(() => {
    return administrationsBySearchAndPeriod.filter((adm) => {
      if (admStatusFilter === "pending") {
        return adm.status !== "administered" && adm.status !== "skipped";
      }
      if (admStatusFilter === "administered") {
        return adm.status === "administered";
      }
      if (admStatusFilter === "skipped") {
        return adm.status === "skipped";
      }
      return true;
    });
  }, [administrationsBySearchAndPeriod, admStatusFilter]);

  const availablePresentations = useMemo(() => {
    const set = new Set<string>();
    for (const med of medications) {
      set.add((med.presentation || "Comprimido").trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [medications]);

  const filteredMedications = useMemo(() => {
    const filtered = medications.filter((med) => {
      if (!matchesMedSearch(med)) return false;

      if (medStatusFilter !== "all" && med.status !== medStatusFilter) {
        return false;
      }

      const invStatus = med.inventoryItem?.status;
      if (stockFilter === "low") {
        if (!invStatus || invStatus === "OK") return false;
      } else if (stockFilter === "ok") {
        if (!invStatus || invStatus !== "OK") return false;
      }

      if (presentationFilter !== "all") {
        const pres = (med.presentation || "Comprimido").trim();
        if (pres !== presentationFilter) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "next_time") {
        const tA = parseScheduleTimes(a.schedules?.[0]?.times)[0] || "99:99";
        const tB = parseScheduleTimes(b.schedules?.[0]?.times)[0] || "99:99";
        if (tA !== tB) return tA.localeCompare(tB);
      } else if (sortBy === "lowest_stock") {
        const qA = a.inventoryItem?.currentQuantity ?? Number.MAX_SAFE_INTEGER;
        const qB = b.inventoryItem?.currentQuantity ?? Number.MAX_SAFE_INTEGER;
        if (qA !== qB) return qA - qB;
      }
      return (a.name || "").localeCompare(b.name || "", "pt-BR");
    });
  }, [
    medications,
    normalizedQuery,
    medStatusFilter,
    stockFilter,
    presentationFilter,
    sortBy,
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div className="fixed top-16 right-4 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Header com Ação de Cadastro */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Pill className="w-6 h-6 text-emerald-600" />
            <span>Medicamentos & Cronograma</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Horários, administração compartilhada entre tutores e controle de posologia.
          </p>
        </div>

        {permissions.canManageMedications && (
          <button
            onClick={() => {
              setSelectedMedication(null);
              setModalMode("create");
              setModalOpen(true);
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Medicamento</span>
          </button>
        )}
      </div>

      {/* Banner de Modo de Rotina e Consumo de Medicamentos */}
      <div
        className={`rounded-2xl p-4 sm:p-5 border transition-all ${
          routineMode === "automatic_by_exception"
            ? "bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-emerald-200"
            : "bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-amber-200"
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                routineMode === "automatic_by_exception"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-amber-600 text-white shadow-xs"
              }`}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-slate-900">
                  {routineMode === "automatic_by_exception"
                    ? "🔄 Modo por Exceção Ativo (Doses Assumidas Regulares)"
                    : "✍️ Modo Manual Ativo (Confirmação Pontual)"}
                </h3>
                <span
                  className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                    routineMode === "automatic_by_exception"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {routineMode === "automatic_by_exception"
                    ? "Baixa Automática no Horário"
                    : "Baixa Manual"}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                {routineMode === "automatic_by_exception" ? (
                  <>
                    Os medicamentos são considerados administrados conforme os horários agendados e abatidos do estoque de farmácia. Caso você <strong>não tenha dado</strong> a dose (ou o pet vomitou), basta clicar em <em>"Não dei / Pular"</em> para registrar a exceção e estornar o medicamento de volta ao estoque.
                  </>
                ) : (
                  <>
                    As doses agendadas só são consideradas administradas e debitadas do estoque quando você clica em confirmar manualmente.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            <button
              type="button"
              onClick={() =>
                handleToggleRoutineMode(
                  routineMode === "automatic_by_exception"
                    ? "manual"
                    : "automatic_by_exception"
                )
              }
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer ${
                routineMode === "automatic_by_exception"
                  ? "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
            >
              {routineMode === "automatic_by_exception" ? (
                <span>Alternar para Modo Manual</span>
              ) : (
                <span>Ativar Modo por Exceção (Regular)</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Barra Global de Busca e Limpeza de Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar medicamento por nome, dosagem, princípio ativo, veterinário ou instrução..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpar filtros</span>
          </button>
        )}
      </div>

      {/* Seção 1: Programação de Hoje (Administrações) */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Administrações de Hoje — {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Logado como: <strong>{currentUser.name}</strong>
          </span>
        </div>

        {/* Filtros de Administrações de Hoje */}
        {administrations.length > 0 && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1 border-b border-slate-100">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { key: "all" as const, label: "Todas", count: admCounts.all },
                { key: "pending" as const, label: "Pendentes", count: admCounts.pending },
                { key: "administered" as const, label: "Administradas", count: admCounts.administered },
                { key: "skipped" as const, label: "Puladas", count: admCounts.skipped },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAdmStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    admStatusFilter === tab.key
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      admStatusFilter === tab.key
                        ? "bg-white/20 text-white"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                aria-label="Filtrar administrações por período"
                value={admPeriodFilter}
                onChange={(e) => setAdmPeriodFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-emerald-600"
              >
                <option value="all">Todos os períodos</option>
                <option value="morning">Manhã (05h–11h59)</option>
                <option value="afternoon">Tarde (12h–17h59)</option>
                <option value="night">Noite (18h–04h59)</option>
              </select>
            </div>
          </div>
        )}

        {administrations.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">
            Nenhuma dose de medicamento programada para hoje.
          </p>
        ) : filteredAdministrations.length === 0 ? (
          <div className="py-5 text-center space-y-2">
            <p className="text-sm text-slate-500">
              Nenhuma dose encontrada para os filtros selecionados.
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAdministrations.map((adm) => {
              const timeStr = formatScheduledTime(adm.scheduledAt);
              const isDone = adm.status === "administered";
              const isSkipped = adm.status === "skipped";
              const isRoutineAuto =
                Boolean(adm.notes?.includes("Rotina regular")) ||
                adm.administeredAt === adm.scheduledAt;

              return (
                <div
                  key={adm.id}
                  className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isDone
                      ? "bg-emerald-50/60 border-emerald-200"
                      : isSkipped
                      ? "bg-slate-100 border-slate-200 opacity-60"
                      : "bg-white border-amber-300 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-14 text-center py-2 rounded-xl text-sm font-black shrink-0 ${
                        isDone
                          ? "bg-emerald-600 text-white"
                          : isSkipped
                          ? "bg-slate-300 text-slate-700"
                          : "bg-amber-500 text-white animate-pulse"
                      }`}
                    >
                      {timeStr}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-base">
                          {adm.medication?.name || "Medicamento"}
                          {adm.medication?.dosage ? (
                            <span className="ml-1.5 text-xs font-semibold text-slate-500">
                              ({adm.medication.dosage})
                            </span>
                          ) : null}
                        </span>
                        {isDone ? (
                          <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            ✓ Administrado
                          </span>
                        ) : isSkipped ? (
                          <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                            Pulado
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                            ⚠ Pendente
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 mt-0.5">
                        Dose: {adm.quantity} {adm.medication?.unit || "dose"} •{" "}
                        {adm.medication?.instructions || "Sem instruções adicionais"}
                      </div>

                      {/* Informação de quem administrou (Auditoria Cruzada de Tutores) */}
                      {isDone && (
                        <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 mt-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>
                            Administrado por <strong>{adm.administeredBy?.name || "Tutor"}</strong> às{" "}
                            {isRoutineAuto
                              ? formatScheduledTime(adm.scheduledAt)
                              : safeFormat(
                                  adm.administeredAt || adm.scheduledAt,
                                  "HH:mm",
                                  { locale: ptBR }
                                ) || "--:--"}
                            {adm.notes?.includes("Rotina regular") ? " (Rotina regular)" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações de Administração */}
                  <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                    {!isDone ? (
                      permissions.canAdministerMedications && (
                        <>
                          <button
                            onClick={() => handleAdminister(adm.id, "administered")}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Marcar Administrado</span>
                          </button>
                          <button
                            onClick={() => handleAdminister(adm.id, "skipped")}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                          >
                            Pular
                          </button>
                        </>
                      )
                    ) : (
                      permissions.canAdministerMedications && (
                        <button
                          onClick={() => handleAdminister(adm.id, "skipped")}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition flex items-center gap-1.5 cursor-pointer"
                          title="Registrar que não deu esta dose (estorna o estoque)"
                        >
                          <span>❌ Não dei / Pular (Estornar)</span>
                        </button>
                      )
                    )}
                    {isSkipped && permissions.canAdministerMedications && (
                      <button
                        onClick={() => handleAdminister(adm.id, "administered")}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 transition flex items-center gap-1.5 cursor-pointer"
                        title="Reverter e marcar como administrado"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Reverter para Administrado</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Seção 2: Lista Completa de Medicamentos Cadastrados */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">
            Medicamentos Cadastrados para este Pet
          </h2>
          <span className="text-xs font-semibold text-slate-500">
            {filteredMedications.length !== medications.length
              ? `Exibindo ${filteredMedications.length} de ${medications.length} medicamentos`
              : `Total: ${medications.length} ${medications.length === 1 ? "medicamento" : "medicamentos"}`}
          </span>
        </div>

        {/* Barra de Filtros da Lista de Medicamentos */}
        {medications.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Status
              </label>
              <select
                aria-label="Filtrar por status do medicamento"
                value={medStatusFilter}
                onChange={(e) => setMedStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-emerald-600"
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="pending_tutor_approval">Aguardando Aprovação</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Situação do Estoque
              </label>
              <select
                aria-label="Filtrar por situação do estoque"
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-emerald-600"
              >
                <option value="all">Qualquer estoque</option>
                <option value="low">Estoque em Alerta / Baixo</option>
                <option value="ok">Estoque OK</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Apresentação
              </label>
              <select
                aria-label="Filtrar por apresentação"
                value={presentationFilter}
                onChange={(e) => setPresentationFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-emerald-600"
              >
                <option value="all">Todas apresentações</option>
                {availablePresentations.map((pres) => (
                  <option key={pres} value={pres}>
                    {pres}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Ordenar por
              </label>
              <select
                aria-label="Ordenar medicamentos"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-emerald-600"
              >
                <option value="name_asc">Nome (A–Z)</option>
                <option value="next_time">Próximo horário</option>
                <option value="lowest_stock">Menor estoque</option>
              </select>
            </div>
          </div>
        )}

        {medications.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Pill className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Nenhum medicamento cadastrado</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Cadastre os medicamentos em uso para acompanhar horários diários, histórico e controle automático de reposição.
            </p>
            {permissions.canManageMedications && (
              <button
                onClick={() => {
                  setSelectedMedication(null);
                  setModalMode("create");
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Primeiro Medicamento</span>
              </button>
            )}
          </div>
        ) : filteredMedications.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700">
              Nenhum medicamento corresponde aos filtros selecionados.
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar filtros</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMedications.map((med) => (
              <div
                key={med.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3 hover:border-slate-300 transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Top Bar do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-black text-slate-900 text-base flex items-center gap-2 flex-wrap">
                        <span>{med.name}</span>
                        {med.status === "pending_tutor_approval" && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                            Aguardando Aprovação
                          </span>
                        )}
                      </h3>
                      <div className="text-xs text-slate-500">
                        {med.activeIngredient && `Princípio ativo: ${med.activeIngredient} • `}
                        {med.presentation || "Comprimido"}
                      </div>
                    </div>

                    {/* Ações (Editar / Excluir) */}
                    <div className="flex items-center gap-1 shrink-0">
                      {permissions.canManageMedications && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedMedication(med);
                              setModalMode("edit");
                              setModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition cursor-pointer"
                            title="Editar informações e posologia"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmMed(med)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                            title="Excluir medicamento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Detalhes do Medicamento */}
                  <div className="p-3.5 bg-slate-50 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">Concentração / Dose:</span>
                      <span className="font-bold text-slate-800">
                        {med.dosage || "Não informada"} •{" "}
                        {med.schedules?.[0]?.quantityPerAdministration || 1} {med.unit || "un"}/dose
                      </span>
                    </div>

                    <div>
                      <strong className="text-slate-700">Instruções: </strong>
                      <span className="text-slate-600">{med.instructions || "Uso contínuo"}</span>
                    </div>

                    {med.veterinarian && (
                      <div>
                        <strong className="text-slate-700">Prescrito por: </strong>
                        <span className="text-slate-600">{med.veterinarian}</span>
                      </div>
                    )}

                    {/* Estoque e Status */}
                    {med.inventoryItem && (
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-slate-700 font-semibold">
                            Estoque: <strong>{med.inventoryItem.currentQuantity} {med.inventoryItem.unit}</strong>
                          </span>
                        </div>
                        {med.inventoryItem.status && (
                          <StockForecastBadge
                            status={med.inventoryItem.status}
                            compact={true}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Horários / Schedules */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Horários Programados
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const allTimes: string[] = Array.from(
                          new Set<string>(
                            (med.schedules || []).flatMap((sch: any): string[] =>
                              parseScheduleTimes(sch.times)
                            )
                          )
                        ).sort();
                        if (allTimes.length === 0) {
                          return (
                            <span className="text-xs text-slate-400 italic">
                              Sem horários cadastrados
                            </span>
                          );
                        }
                        return allTimes.map((t: string) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold"
                          >
                            <Clock className="w-3 h-3 text-emerald-600" />
                            <span>{t}</span>
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal de Confirmação de Exclusão Rápida */}
      {deleteConfirmMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-slate-900">
                Excluir &quot;{deleteConfirmMed.name}&quot;?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Esta ação removerá o medicamento, seu cronograma de horários, as doses associadas e o item de estoque vinculado.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteConfirmMed(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => handleDeleteMedication(deleteConfirmMed.id)}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Sim, excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reutilizável de Medicamento */}
      <MedicationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={modalMode}
        initialData={selectedMedication}
        onSuccess={(med) => {
          setFeedback(
            modalMode === "create"
              ? `✓ Medicamento "${med.name}" cadastrado com sucesso!`
              : `✓ Medicamento "${med.name}" atualizado!`
          );
          setTimeout(() => setFeedback(null), 3500);
        }}
      />
    </div>
  );
}
