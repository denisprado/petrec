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
  Edit2,
  X,
  RotateCcw,
  MessageCircle,
  ExternalLink,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PetModal } from "@/components/PetModal";
import { LandingPage } from "@/components/LandingPage";

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

export default function DashboardPage() {
  const {
    currentUser,
    activePetId,
    setActivePetId,
    pets,
    refreshTrigger,
    triggerRefresh,
    permissions,
    isAuthenticated,
    isAuthLoading,
    showLandingPage,
    openAuthModal,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [showNewPetModal, setShowNewPetModal] = useState(false);
  const [showEditPetModal, setShowEditPetModal] = useState(false);
  const [onboardingPhone, setOnboardingPhone] = useState("");
  const [connectingOnboardingWa, setConnectingOnboardingWa] = useState(false);

  // Estados de Exceção (Modo Por Exceção / Regular)
  const [feedingExceptionModalOpen, setFeedingExceptionModalOpen] = useState(false);
  const [selectedRacaoForException, setSelectedRacaoForException] = useState<any>(null);
  const [exceptionGrams, setExceptionGrams] = useState<number>(200);
  const [exceptionReason, setExceptionReason] = useState<string>("Jejum para exames");
  const [customExceptionReason, setCustomExceptionReason] = useState<string>("");

  const [skipMedModalOpen, setSkipMedModalOpen] = useState(false);
  const [selectedAdmToSkip, setSelectedAdmToSkip] = useState<any>(null);
  const [skipMedReason, setSkipMedReason] = useState<string>("Vomitou / recusou o medicamento");
  const [customSkipReason, setCustomSkipReason] = useState<string>("");

  // Carregar dados agregados do dashboard apenas quando autenticado
  useEffect(() => {
    let isCancelled = false;

    async function loadDashboard() {
      if (!isAuthenticated || !currentUser?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        queryParams.set("userId", currentUser.id);
        if (activePetId) queryParams.set("petId", activePetId);

        const res = await fetch(`/api/dashboard?${queryParams.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (!isCancelled) {
            setData(json);
            if (!activePetId && json.activePet?.id) {
              setActivePetId(json.activePet.id);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dashboard:", err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [activePetId, currentUser?.id, isAuthenticated, refreshTrigger]);

  // Ação de administrar medicamento hoje
  const handleAdminister = async (
    administrationId: string,
    status: "administered" | "skipped",
    notes?: string
  ) => {
    try {
      const res = await fetch("/api/medications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          administrationId,
          status,
          notes,
          userId: currentUser.id,
        }),
      });

      if (res.ok) {
        setActionSuccessMessage(
          status === "administered"
            ? `✓ Medicamento registrado por ${currentUser.name.split(" ")[0]}!`
            : `⚠️ Dose marcada como pulada! Estoque de comprimidos preservado/estornado.`
        );
        setTimeout(() => setActionSuccessMessage(null), 4000);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Alternar Modo de Rotina (Manual vs Por Exceção)
  const handleToggleRoutineMode = async (newMode: "manual" | "automatic_by_exception") => {
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_routine_mode",
          petId: activePetId,
          routineMode: newMode,
          userId: currentUser.id,
        }),
      });
      if (res.ok) {
        setActionSuccessMessage(
          newMode === "automatic_by_exception"
            ? "🔄 Modo por Exceção Ativado! Rações e remédios são consumidos automaticamente."
            : "✍️ Modo Manual Ativado! Estoque deduzido apenas quando você confirmar."
        );
        setTimeout(() => setActionSuccessMessage(null), 4000);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Registrar Exceção de Alimentação (não comeu / jejum)
  const handleFeedingExceptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRacaoForException) return;

    const finalReason =
      exceptionReason === "Outro"
        ? customExceptionReason.trim() || "Exceção de alimentação"
        : exceptionReason;

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "feeding_exception",
          inventoryItemId: selectedRacaoForException.id || selectedRacaoForException._id,
          quantityNotConsumed: Number(exceptionGrams),
          reason: finalReason,
          userId: currentUser.id,
          petId: activePetId,
        }),
      });

      if (res.ok) {
        setActionSuccessMessage(
          `⚠️ Exceção registrada: +${exceptionGrams}g de ${selectedRacaoForException.name} mantidos no estoque (${finalReason}).`
        );
        setTimeout(() => setActionSuccessMessage(null), 4000);
        setFeedingExceptionModalOpen(false);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Confirmar Pulo de Dose com Motivo
  const handleConfirmSkipMed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmToSkip) return;

    const finalReason =
      skipMedReason === "Outro"
        ? customSkipReason.trim() || "Dose pulada pelo tutor"
        : skipMedReason;

    try {
      await handleAdminister(selectedAdmToSkip.id, "skipped", finalReason);
      setSkipMedModalOpen(false);
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

  if (isAuthLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-3" />
        <p className="text-slate-500 font-medium text-sm">Verificando sessão...</p>
      </div>
    );
  }

  if (!isAuthenticated || showLandingPage) {
    return <LandingPage />;
  }

  if (loading && !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-3" />
        <p className="text-slate-500 font-medium text-sm">Carregando painel de cuidados...</p>
      </div>
    );
  }

  const activePet = data?.activePet;

  // Estado amigável de boas-vindas e onboarding quando nenhum pet está cadastrado ainda
  if (!loading && (!activePet || (data?.pets && data.pets.length === 0))) {
    const hasConnectedWa = Boolean(currentUser?.whatsappPhoneNumber);

    const handleQuickConnectWhatsapp = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!onboardingPhone.trim() || !currentUser?.id) return;
      setConnectingOnboardingWa(true);
      try {
        const res = await fetch("/api/whatsapp/pairing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUser.id,
            phone: onboardingPhone.trim(),
          }),
        });
        if (res.ok) {
          setActionSuccessMessage("✓ WhatsApp conectado à sua conta!");
          setTimeout(() => setActionSuccessMessage(null), 4000);
          setOnboardingPhone("");
          triggerRefresh();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setConnectingOnboardingWa(false);
      }
    };

    return (
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14 space-y-6">
        {actionSuccessMessage && (
          <div className="fixed top-16 right-4 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>{actionSuccessMessage}</span>
          </div>
        )}

        {/* Boas-vindas & Cadastro do 1º Pet */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 text-center space-y-5 shadow-2xs">
          <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-inner">
            <Heart className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Bem-vindo(a) ao PetRec, {currentUser?.name?.split(" ")[0] || "Tutor"}!
            </h2>
            <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
              Comece adicionando seu primeiro pet pelo botão abaixo <strong>ou diretamente pelo nosso WhatsApp</strong> para gerenciar medicamentos, ração, estoque e vacinas.
            </p>
          </div>
          <button
            onClick={() => setShowNewPetModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl shadow-md transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Meu Primeiro Pet</span>
          </button>
        </div>

        {/* Onboarding do Assistente WhatsApp */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/70 rounded-3xl border border-emerald-200 p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Como usar o PetRec pelo WhatsApp desde já
                </h3>
                <p className="text-xs text-emerald-900/80">
                  Converse em linguagem natural, mande áudios ou fotos de receitas sem precisar abrir o app.
                </p>
              </div>
            </div>

            {hasConnectedWa ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-full self-start sm:self-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Conectado: {currentUser.whatsappPhoneNumber}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-3 py-1 rounded-full self-start sm:self-center">
                <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                <span>Conecte seu número em 1 clique</span>
              </span>
            )}
          </div>

          {!hasConnectedWa && (
            <form
              onSubmit={handleQuickConnectWhatsapp}
              className="flex flex-col sm:flex-row gap-2 bg-white p-3 rounded-2xl border border-emerald-200/80"
            >
              <input
                type="tel"
                required
                value={onboardingPhone}
                onChange={(e) => setOnboardingPhone(e.target.value)}
                placeholder="Seu WhatsApp com DDD (ex: 19999999999)"
                className="flex-1 px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={connectingOnboardingWa}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0"
              >
                {connectingOnboardingWa ? "Conectando..." : "Conectar WhatsApp"}
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="bg-white/90 rounded-2xl p-3 border border-emerald-200/60 space-y-1">
              <div className="font-bold text-slate-900">1. Cadastre seu pet</div>
              <p className="text-[11px] text-slate-600">
                Envie por exemplo: <em>&ldquo;Bidu, cão, 10kg&rdquo;</em> ou <em>&ldquo;Tenho uma gata chamada Luna&rdquo;</em>.
              </p>
            </div>
            <div className="bg-white/90 rounded-2xl p-3 border border-emerald-200/60 space-y-1">
              <div className="font-bold text-slate-900">2. Informe rotina e estoque</div>
              <p className="text-[11px] text-slate-600">
                Diga: <em>&ldquo;Comprei 15kg de ração&rdquo;</em> ou <em>&ldquo;Bidu toma Sepurim 20mg&rdquo;</em>.
              </p>
            </div>
            <div className="bg-white/90 rounded-2xl p-3 border border-emerald-200/60 space-y-1">
              <div className="font-bold text-slate-900">3. Áudios, fotos e exceções</div>
              <p className="text-[11px] text-slate-600">
                Mande foto de receita/vacina ou avise: <em>&ldquo;Deixou metade do pote hoje&rdquo;</em>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <a
              href="https://wa.me/15551874911?text=Oi"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Conversar no WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <Link
              href="/whatsapp"
              className="px-4 py-2.5 bg-white hover:bg-emerald-100/60 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold transition inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Testar no Simulador Web</span>
            </Link>
            <button
              type="button"
              onClick={() => openAuthModal("profile")}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
            >
              Editar meu perfil
            </button>
          </div>
        </div>

        <PetModal
          isOpen={showNewPetModal}
          onClose={() => setShowNewPetModal(false)}
          mode="create"
          onSuccess={(pet) => {
            setActivePetId(pet.id);
            triggerRefresh();
          }}
        />
      </div>
    );
  }
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

            {/* Tutores associados & Ações de Configuração */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Botão de Troca Rápida de Modo de Rotina */}
              <button
                type="button"
                onClick={() =>
                  handleToggleRoutineMode(
                    activePet.routineMode === "automatic_by_exception"
                      ? "manual"
                      : "automatic_by_exception"
                  )
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border backdrop-blur-md flex items-center gap-1.5 shadow-xs ${
                  activePet.routineMode === "automatic_by_exception"
                    ? "bg-emerald-500/30 hover:bg-emerald-500/50 border-emerald-300/40 text-emerald-100"
                    : "bg-white/15 hover:bg-white/25 border-white/20 text-white"
                }`}
                title="Clique para alternar entre Modo por Exceção (Automático) e Modo Manual"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                <span>
                  {activePet.routineMode === "automatic_by_exception"
                    ? "Rotina: Por Exceção"
                    : "Rotina: Manual"}
                </span>
              </button>

              <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                <span className="text-xs text-emerald-200 font-medium">Equipe:</span>
                <div className="flex -space-x-2">
                  {activePet.members
                    ?.filter((m: any) => m && m.user)
                    .map((m: any) => (
                      <img
                        key={m.id || m._id}
                        src={m.user?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
                        title={`${m.user?.name || "Tutor"} (${m.role || "Tutor"})`}
                        alt={m.user?.name || "Tutor"}
                        className="w-7 h-7 rounded-full border-2 border-emerald-900 object-cover"
                      />
                    ))}
                </div>
              </div>

              {permissions.canEditPet && (
                <button
                  type="button"
                  onClick={() => setShowEditPetModal(true)}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition backdrop-blur-md border border-white/20 flex items-center gap-1.5 shadow-xs"
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

      {/* Banner Informativo do Modo por Exceção */}
      {activePet?.routineMode === "automatic_by_exception" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 sm:p-4 flex items-start sm:items-center justify-between gap-3 text-xs text-emerald-950 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-emerald-900">Modo por Exceção Ativo:</span>{" "}
              <span className="text-emerald-800">
                Rações e medicamentos são considerados consumidos regularmente conforme o cronograma. O estoque diminui automaticamente. Você só precisa registrar quando <strong>NÃO</strong> tiver dado algo (jejum, dose pulada).
              </span>
            </div>
          </div>
          <button
            onClick={() => handleToggleRoutineMode("manual")}
            className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline shrink-0 transition"
          >
            Mudar para Manual
          </button>
        </div>
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
                    <strong>{safeFormat(vac.nextDueDate, "dd/MM/yyyy") || "Não informado"}</strong>
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
                  const timeStr = safeFormat(adm.scheduledAt, "HH:mm") || "--:--";
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
                            {adm.medication?.name || "Medicamento"}
                          </div>
                          <div className="text-xs text-slate-500">
                            Dose: {adm.quantity} {adm.medication?.unit || "dose"}
                            {adm.notes && ` • ${adm.notes}`}
                          </div>

                          {/* Quem administrou (Auditoria Compartilhada) */}
                          {isDone && (
                            <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                Administrado por {adm.administeredBy?.name || "Tutor"} às{" "}
                                {safeFormat(adm.administeredAt || adm.scheduledAt, "HH:mm") || "--:--"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botões de Ação para o Tutor Logado */}
                      <div className="flex items-center gap-1.5">
                        {isSkipped && (
                          <span className="text-xs text-slate-500 font-semibold px-2 py-1 bg-slate-100 rounded-md">
                            Dose Pulada (Exceção)
                          </span>
                        )}

                        {isDone && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-emerald-700 font-bold px-2 py-1 bg-emerald-100 rounded-md">
                              {adm.notes?.includes("Rotina regular") ? "Rotina ✓" : "Feito ✓"}
                            </span>
                            {activePet?.routineMode === "automatic_by_exception" && permissions.canAdministerMedications && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAdmToSkip(adm);
                                  setSkipMedModalOpen(true);
                                }}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition"
                                title="Registrar que NÃO deu esta dose (estorna comprimido ao estoque)"
                              >
                                ❌ Não dei / Pular
                              </button>
                            )}
                          </div>
                        )}

                        {!isDone && !isSkipped && permissions.canAdministerMedications && (
                          <>
                            <button
                              onClick={() => handleAdminister(adm.id, "administered")}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                              title="Marcar administrado"
                            >
                              ✓ Administrar
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAdmToSkip(adm);
                                setSkipMedModalOpen(true);
                              }}
                              className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs transition"
                              title="Pular dose (registrar exceção)"
                            >
                              Pular
                            </button>
                          </>
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
                  {activePet?.routineMode === "automatic_by_exception"
                    ? "Alimentação — Rotina Regular Automática"
                    : "Alimentação Rápida — Consumo Real"}
                </h2>
              </div>
              <Link href="/estoque" className="text-xs text-teal-700 hover:underline font-bold">
                Ver estoque detalhado →
              </Link>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              {activePet?.routineMode === "automatic_by_exception"
                ? "Neste modo, o consumo de ração é deduzido automaticamente a cada dia decorrido. Você não precisa registrar refeições diárias, apenas registre abaixo quando NÃO tiver dado comida (jejum ou sobras no pote)."
                : "Ao registrar uma refeição manualmente, o estoque de ração diminui instantaneamente e a previsão de término é recalculada."}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {data?.inventory
                ?.filter((it: any) => it.category === "racao")
                .map((racao: any) => (
                  <div
                    key={racao.id}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <div className="font-bold text-xs text-slate-800 line-clamp-1">
                          {racao.name}
                        </div>
                        <Link
                          href="/estoque"
                          className="text-slate-400 hover:text-teal-700 p-0.5 hover:bg-slate-200/60 rounded transition shrink-0"
                          title="Gerenciar / Editar no Estoque"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Estoque atual: <strong>{(racao.currentQuantity / 1000).toFixed(1)} kg</strong>
                        {racao.dailyConsumption > 0 && (
                          <span className="text-slate-400 block">
                            Consumo previsto: {racao.dailyConsumption}g/dia
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      {activePet?.routineMode === "automatic_by_exception" ? (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRacaoForException(racao);
                              setExceptionGrams(racao.dailyConsumption ? Math.round(racao.dailyConsumption / 2) : 200);
                              setFeedingExceptionModalOpen(true);
                            }}
                            className="w-full py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs rounded-lg transition flex items-center justify-center gap-1.5 shadow-2xs"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Registrar Exceção (Não Comeu / Jejum)</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
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
                      )}
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
                <div key={log.id || log._id} className="py-2.5 flex items-start gap-2.5 text-xs">
                  <img
                    src={log.user?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
                    alt={log.user?.name || "Tutor"}
                    className="w-6 h-6 rounded-full object-cover mt-0.5 ring-1 ring-slate-200"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-slate-900">{log.user?.name || "Tutor"}: </span>
                    <span className="text-slate-600">{log.action}</span>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {safeFormat(log.timestamp, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) || "Data não registrada"}
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

      {/* Modal: Registrar Exceção de Alimentação (Jejum / Não Comeu) */}
      {feedingExceptionModalOpen && selectedRacaoForException && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Registrar Exceção de Alimentação
                  </h3>
                  <p className="text-[11px] text-slate-500">{selectedRacaoForException.name}</p>
                </div>
              </div>
              <button
                onClick={() => setFeedingExceptionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFeedingExceptionSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Quantidade que NÃO foi consumida:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="5000"
                    value={exceptionGrams}
                    onChange={(e) => setExceptionGrams(Math.max(1, Number(e.target.value)))}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <span className="text-slate-500 font-semibold">{selectedRacaoForException.unit || "g"}</span>
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setExceptionGrams(200)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-900 rounded-lg text-[11px] font-semibold transition"
                  >
                    200g (Refeição)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExceptionGrams(400)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-900 rounded-lg text-[11px] font-semibold transition"
                  >
                    400g (Dia Todo)
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Motivo da Exceção:
                </label>
                <select
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium text-slate-800"
                >
                  <option value="Jejum para exames / cirurgia">Jejum para exames / cirurgia</option>
                  <option value="Não comeu a porção da manhã">Não comeu a porção da manhã</option>
                  <option value="Não comeu a porção da noite">Não comeu a porção da noite</option>
                  <option value="Sobrou ração no pote">Sobrou ração no pote</option>
                  <option value="Apetite reduzido / comeu menos">Apetite reduzido / comeu menos</option>
                  <option value="Outro">Outro motivo...</option>
                </select>

                {exceptionReason === "Outro" && (
                  <input
                    type="text"
                    placeholder="Descreva o motivo..."
                    value={customExceptionReason}
                    onChange={(e) => setCustomExceptionReason(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                )}
              </div>

              <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
                💡 <strong>Efeito no estoque:</strong> Como o PetRec deduz o consumo regular automaticamente, registrar esta exceção manterá <strong>+{exceptionGrams}g</strong> no estoque disponível.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFeedingExceptionModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition shadow-xs"
                >
                  Confirmar Exceção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pular Dose de Medicamento (Exceção) */}
      {skipMedModalOpen && selectedAdmToSkip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Pill className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Pular Dose (Registrar Exceção)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {selectedAdmToSkip.medication?.name} • Horário: {safeFormat(selectedAdmToSkip.scheduledAt, "HH:mm")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSkipMedModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSkipMed} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Motivo de não ter administrado:
                </label>
                <select
                  value={skipMedReason}
                  onChange={(e) => setSkipMedReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none font-medium text-slate-800"
                >
                  <option value="Vomitou / recusou o medicamento">Vomitou / recusou o medicamento</option>
                  <option value="Esqueci de administrar no horário">Esqueci de administrar no horário</option>
                  <option value="Jejum / orientação veterinária">Jejum / orientação veterinária</option>
                  <option value="Animal ausente (viagem / clínica)">Animal ausente (viagem / clínica)</option>
                  <option value="Outro">Outro motivo...</option>
                </select>

                {skipMedReason === "Outro" && (
                  <input
                    type="text"
                    placeholder="Descreva o motivo..."
                    value={customSkipReason}
                    onChange={(e) => setCustomSkipReason(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                )}
              </div>

              <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200/80 text-[11px] text-rose-900 leading-relaxed">
                💡 <strong>Efeito no estoque:</strong> Ao marcar esta dose como pulada, o PetRec garante que <strong>{selectedAdmToSkip.quantity} {selectedAdmToSkip.medication?.unit || "dose"}</strong> permaneça no estoque disponível do medicamento.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSkipMedModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition shadow-xs"
                >
                  Confirmar Pulo de Dose
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
