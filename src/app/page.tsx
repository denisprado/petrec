"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { StockForecastBadge } from "@/components/StockForecastBadge";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pill,
  ShoppingCart,
  Calendar,
  Utensils,
  ChevronRight,
  ShieldCheck,
  Plus,
  TrendingDown,
  History,
  Activity,
  Heart,
  Syringe,
  Sparkles,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PetModal } from "@/components/PetModal";

export default function DashboardPage() {
  const {
    currentUser,
    activePetId,
    setActivePetId,
    pets,
    refreshTrigger,
    triggerRefresh,
    permissions,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [showNewPetModal, setShowNewPetModal] = useState(false);
  const [showEditPetModal, setShowEditPetModal] = useState(false);

  // Carregar dados agregados do dashboard
  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard?petId=${activePetId}&userId=${currentUser.id}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Erro ao carregar dashboard:", err);
      } finally {
        setLoading(false);
      }
    }

    if (activePetId) {
      loadDashboard();
    }
  }, [activePetId, currentUser.id, refreshTrigger]);

  // Ação de administrar medicamento hoje
  const handleAdminister = async (administrationId: string, status: "administered" | "skipped") => {
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
        setActionSuccessMessage(
          status === "administered"
            ? `✓ Medicamento marcado como administrado por ${currentUser.name.split(" ")[0]}!`
            : "Dose marcada como pulada."
        );
        setTimeout(() => setActionSuccessMessage(null), 4000);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Registrar consumo rápido de ração
  const handleQuickMeal = async (itemId: string, grams: number) => {
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: itemId,
          type: "consumption",
          quantity: grams,
          userId: currentUser.id,
          petId: activePetId,
          notes: "Refeição diária registrada via dashboard",
        }),
      });

      if (res.ok) {
        setActionSuccessMessage(`✓ Refeição (${grams}g) registrada por ${currentUser.name.split(" ")[0]}!`);
        setTimeout(() => setActionSuccessMessage(null), 4000);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading && !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-3" />
        <p className="text-slate-500 font-medium text-sm">Carregando painel de cuidados...</p>
      </div>
    );
  }

  const activePet = data?.activePet;
  const criticalStock = data?.attention?.criticalStock || [];
  const attentionStock = data?.attention?.attentionStock || [];
  const administrations = data?.today?.administrations || [];
  const upcomingVaccines = data?.attention?.upcomingVaccines || [];
  const pendingPrescriptions = data?.attention?.pendingPrescriptions || [];
  const shoppingPending = data?.purchases?.pendingList || [];
  const recentActivities = data?.recentActivities || [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-6">
      {/* Toast Notification Feedback */}
      {actionSuccessMessage && (
        <div className="fixed top-16 right-4 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Multi-Pet Quick Status Header Bar */}
      <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Meus Pets — Visão Geral
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNewPetModal(true)}
              className="text-xs text-emerald-600 font-bold hover:underline flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Novo Pet</span>
            </button>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Logado como: <strong>{currentUser.name}</strong>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {pets.map((p) => {
            const isSelected = p.id === activePet?.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setActivePetId(p.id);
                  triggerRefresh();
                }}
                className={`flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl border text-left transition ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-50/70 shadow-xs ring-2 ring-emerald-500/20"
                    : "border-slate-200 bg-slate-50/60 hover:bg-slate-100/60"
                }`}
              >
                <div className="relative">
                  {p.photo ? (
                    <img
                      src={p.photo}
                      alt={p.name}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover ring-2 ring-white"
                    />
                  ) : (
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                      {p.name.charAt(0)}
                    </div>
                  )}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                      p.statusColor === "red"
                        ? "bg-red-500 animate-pulse"
                        : p.statusColor === "yellow"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 truncate">{p.name}</div>
                  <div className="text-[11px] font-medium text-slate-500 truncate">
                    {p.statusText}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active Pet Hero Card */}
      {activePet && (
        <section className="bg-gradient-to-r from-emerald-800 to-teal-900 rounded-2xl p-4 sm:p-6 text-white shadow-md relative overflow-hidden">
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {activePet.photo && (
                <img
                  src={activePet.photo}
                  alt={activePet.name}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-4 ring-white/20 shadow-lg"
                />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                    {activePet.name}
                  </h1>
                  <span className="text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-semibold backdrop-blur-xs">
                    {activePet.species} • {activePet.breed || "Sem raça definida"}
                  </span>
                </div>
                <p className="text-emerald-100 text-xs sm:text-sm mt-1">
                  Peso atual: <strong>{activePet.weight ? `${activePet.weight} kg` : "Não informado"}</strong>{" "}
                  • Tutores ativos:{" "}
                  <strong>{activePet.members ? activePet.members.length : 1}</strong>
                </p>
              </div>
            </div>

            {/* Tutores associados & Ação de Editar */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10">
                <span className="text-xs text-emerald-200 font-medium">Equipe:</span>
                <div className="flex -space-x-2">
                  {activePet.members?.map((m: any) => (
                    <img
                      key={m.id}
                      src={m.user.avatar}
                      title={`${m.user.name} (${m.role})`}
                      alt={m.user.name}
                      className="w-7 h-7 rounded-full border-2 border-emerald-900 object-cover"
                    />
                  ))}
                </div>
              </div>

              {permissions.canEditPet && (
                <button
                  type="button"
                  onClick={() => setShowEditPetModal(true)}
                  className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition backdrop-blur-md border border-white/20 flex items-center gap-1.5 shadow-xs"
                  title="Editar informações cadastrais do pet"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Editar Pet</span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 🔴 SEÇÃO PRINCIPAL DE ATENÇÃO IMEDIATA (O que exige ação) */}
      {(criticalStock.length > 0 || upcomingVaccines.length > 0 || pendingPrescriptions.length > 0) && (
        <section className="bg-red-50/80 border-2 border-red-300 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-900 font-bold text-base sm:text-lg">
              <AlertTriangle className="w-5 h-5 text-red-600 animate-bounce" />
              <span>Atenção Imediata — Ação Necessária Hoje</span>
            </div>
            <span className="text-xs font-bold bg-red-200 text-red-900 px-2.5 py-0.5 rounded-full">
              {criticalStock.length + upcomingVaccines.length + pendingPrescriptions.length} pendência(s)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Itens de Estoque Crítico */}
            {criticalStock.map((item: any) => (
              <div
                key={item.id}
                className="bg-white rounded-xl p-3.5 border border-red-200 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-bold text-slate-900 text-sm">{item.name}</span>
                    <StockForecastBadge
                      status={item.forecast.status}
                      overdueDays={item.forecast.overdueDays}
                    />
                  </div>
                  <p className="text-xs text-slate-600">
                    Estoque disponível:{" "}
                    <strong className="text-red-700">
                      {item.currentQuantity} {item.unit}
                    </strong>{" "}
                    (Consumo: {item.dailyConsumption} {item.unit}/dia)
                  </p>
                  <p className="text-xs text-red-600 font-medium mt-1">
                    {item.forecast.description}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-medium">
                    Comprar até:{" "}
                    <strong className="text-red-700">{item.forecast.comprarAteLabel}</strong>
                  </span>
                  <Link
                    href="/compras"
                    className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg font-semibold transition"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Comprar</span>
                  </Link>
                </div>
              </div>
            ))}

            {/* Vacinas Próximas */}
            {upcomingVaccines.map((vac: any) => (
              <div
                key={vac.id}
                className="bg-white rounded-xl p-3.5 border border-amber-200 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-bold text-slate-900 text-sm">Vacina: {vac.name}</span>
                    <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-bold">
                      {vac.daysUntil <= 0
                        ? "Vencida!"
                        : `Vence em ${vac.daysUntil} dias`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Veterinário / Clínica: {vac.veterinarian || "A confirmar"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 italic">
                    *Protocolo sujeito à confirmação do médico veterinário.
                  </p>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">
                    Reforço previsto:{" "}
                    <strong>{format(new Date(vac.nextDueDate), "dd/MM/yyyy")}</strong>
                  </span>
                  <Link
                    href="/saude"
                    className="text-amber-700 hover:underline font-bold"
                  >
                    Ver detalhes →
                  </Link>
                </div>
              </div>
            ))}

            {/* Prescrições Médicas Aguardando Validação */}
            {pendingPrescriptions.map((med: any) => (
              <div
                key={med.id}
                className="bg-white rounded-xl p-3.5 border border-indigo-200 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-bold text-slate-900 text-sm">Prescrição: {med.name}</span>
                    <span className="bg-indigo-100 text-indigo-900 text-xs px-2 py-0.5 rounded-full font-bold">
                      Aguardando Tutor
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Posologia: <strong>{med.dosage || "Conforme receita"}</strong> ({med.instructions || "Uso veterinário"})
                  </p>
                  <p className="text-[11px] text-indigo-700 font-medium mt-1">
                    Sugerido por: {med.prescribedBy?.name || med.veterinarian || "Médico Veterinário"}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-medium">Requer aprovação do tutor</span>
                  <Link
                    href="/saude"
                    className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg font-semibold transition"
                  >
                    <span>Revisar no Prontuário →</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grid Principal: HOJE (Medicamentos & Refeições) + ESTOQUE & PREVISÕES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Esquerda/Centro (2 cols): HOJE & MEDICAMENTOS */}
        <div className="lg:col-span-2 space-y-6">
          {/* Seção HOJE: Medicamentos do Dia */}
          <section className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Hoje — Medicamentos & Rotina</h2>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </span>
            </div>

            {administrations.length === 0 ? (
              <p className="text-sm text-slate-500 py-3">
                Nenhum medicamento agendado para hoje.
              </p>
            ) : (
              <div className="space-y-3">
                {administrations.map((adm: any) => {
                  const timeStr = format(new Date(adm.scheduledAt), "HH:mm");
                  const isDone = adm.status === "administered";
                  const isSkipped = adm.status === "skipped";

                  return (
                    <div
                      key={adm.id}
                      className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                        isDone
                          ? "bg-emerald-50/50 border-emerald-200"
                          : isSkipped
                          ? "bg-slate-100 border-slate-200 opacity-60"
                          : "bg-white border-amber-200 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-12 text-center py-1 rounded-lg text-xs font-black ${
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
                          <div className="font-bold text-slate-900 text-sm">
                            {adm.medication.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            Dose: {adm.quantity} {adm.medication.unit || "dose"}
                            {adm.notes && ` • ${adm.notes}`}
                          </div>

                          {/* Quem administrou (Auditoria Compartilhada) */}
                          {isDone && (
                            <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                Administrado por {adm.administeredBy?.name || "Tutor"} às{" "}
                                {format(new Date(adm.administeredAt || adm.scheduledAt), "HH:mm")}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botões de Ação para o Tutor Logado */}
                      <div className="flex items-center gap-1.5">
                        {!isDone && permissions.canAdministerMedications && (
                          <>
                            <button
                              onClick={() => handleAdminister(adm.id, "administered")}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                              title="Marcar administrado"
                            >
                              ✓ Administrar
                            </button>
                            <button
                              onClick={() => handleAdminister(adm.id, "skipped")}
                              className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs transition"
                              title="Pular dose"
                            >
                              Pular
                            </button>
                          </>
                        )}
                        {isDone && (
                          <span className="text-xs text-emerald-600 font-bold px-2 py-1 bg-emerald-100 rounded-md">
                            Feito ✓
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Ações Rápidas de Alimentação & Consumo */}
          <section className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Utensils className="w-5 h-5 text-teal-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Alimentação Rápida — Consumo Real
                </h2>
              </div>
              <Link href="/estoque" className="text-xs text-teal-700 hover:underline font-bold">
                Ver estoque detalhado →
              </Link>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Ao registrar uma refeição, o estoque de ração diminui instantaneamente e a previsão de término é recalculada.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {data?.inventory
                ?.filter((it: any) => it.category === "racao")
                .map((racao: any) => (
                  <div
                    key={racao.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-800 line-clamp-1">
                        {racao.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Restam: <strong>{(racao.currentQuantity / 1000).toFixed(1)} kg</strong>
                      </div>
                    </div>

                    <div className="mt-2.5 flex gap-1.5">
                      <button
                        onClick={() => handleQuickMeal(racao.id, 200)}
                        className="flex-1 py-1 bg-white hover:bg-teal-50 border border-teal-300 text-teal-800 font-bold text-xs rounded-lg transition"
                      >
                        + 200g
                      </button>
                      <button
                        onClick={() => handleQuickMeal(racao.id, 400)}
                        className="flex-1 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg transition shadow-2xs"
                      >
                        + 400g (dia)
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>

          {/* Histórico Compartilhado de Atividades Recentes */}
          <section className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Histórico de Atividades — Quem Fez o Quê
                </h2>
              </div>
              <span className="text-[11px] text-slate-400">Auditoria multi-tutor</span>
            </div>

            <div className="divide-y divide-slate-100">
              {recentActivities.slice(0, 5).map((log: any) => (
                <div key={log.id} className="py-2.5 flex items-start gap-2.5 text-xs">
                  <img
                    src={log.user?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
                    alt={log.user?.name}
                    className="w-6 h-6 rounded-full object-cover mt-0.5 ring-1 ring-slate-200"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-slate-900">{log.user?.name}: </span>
                    <span className="text-slate-600">{log.action}</span>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {format(new Date(log.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Coluna Direita (1 col): PREVISÃO DE COMPRAS & ESTOQUE */}
        <div className="space-y-6">
          {/* Card Previsão de Estoque do Pet Ativo */}
          <section className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-amber-600" />
                <h2 className="text-base font-bold text-slate-900">Previsão de Compras</h2>
              </div>
              <Link href="/estoque" className="text-xs text-emerald-700 font-bold hover:underline">
                Gerenciar
              </Link>
            </div>

            <div className="space-y-3">
              {data?.inventory?.map((item: any) => {
                const fc = item.forecast;
                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-bold text-slate-800 text-xs">{item.name}</span>
                      <StockForecastBadge
                        status={fc.status}
                        overdueDays={fc.overdueDays}
                        compact
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Restam:</span>
                      <strong className="text-slate-800">
                        {item.currentQuantity} {item.unit} ({Math.round(fc.daysRemaining)} dias)
                      </strong>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Comprar até:</span>
                      <strong
                        className={
                          fc.status === "COMPRAR AGORA" || fc.status === "SEM ESTOQUE"
                            ? "text-red-700"
                            : "text-slate-800"
                        }
                      >
                        {fc.comprarAteLabel}
                      </strong>
                    </div>

                    {/* Barra de progresso visual do estoque */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full ${
                          fc.status === "COMPRAR AGORA" || fc.status === "SEM ESTOQUE"
                            ? "bg-red-500"
                            : fc.status === "ATENÇÃO"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{
                          width: `${Math.min(100, (fc.daysRemaining / (item.purchaseLeadTimeDays * 3)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Lista de Compras Compartilhada Rápida */}
          <section className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-900">Lista Compartilhada</h2>
              </div>
              <Link href="/compras" className="text-xs text-emerald-700 font-bold hover:underline">
                Abrir lista →
              </Link>
            </div>

            {shoppingPending.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Nenhum item pendente de compra.</p>
            ) : (
              <ul className="space-y-2">
                {shoppingPending.map((shop: any) => (
                  <li
                    key={shop.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                  >
                    <span className="font-semibold text-slate-800">
                      ☐ {shop.customName || shop.inventoryItem?.name}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {shop.quantity ? `${shop.quantity} ${shop.unit || ""}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Modal: Cadastrar Novo Pet */}
      <PetModal
        isOpen={showNewPetModal}
        onClose={() => setShowNewPetModal(false)}
        mode="create"
      />

      {/* Modal: Editar Pet Ativo */}
      {activePet && (
        <PetModal
          isOpen={showEditPetModal}
          onClose={() => setShowEditPetModal(false)}
          mode="edit"
          initialData={activePet}
        />
      )}
    </div>
  );
}
