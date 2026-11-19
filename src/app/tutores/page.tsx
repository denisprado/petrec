"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import {
  Users,
  UserPlus,
  Shield,
  Mail,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Trash2,
  Send,
  Stethoscope,
  Building2,
  Sparkles,
  QrCode,
  Lock,
  Calendar,
  AlertCircle,
  Copy,
  ExternalLink,
  KeyRound,
  MessageCircle,
  Share2,
  Bell,
  BellOff,
  SlidersHorizontal,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getDefaultNotificationPreferences,
  NOTIFICATION_CATEGORIES,
  NotificationCategory,
  NotificationPreferences,
  resolveNotificationPreferences,
} from "@/lib/notificationPreferences";

export default function TutoresPage() {
  const { activePetId, setActivePetId, pets, currentUser, refreshTrigger, triggerRefresh, permissions } = useApp();
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [petInfo, setPetInfo] = useState<{
    id: string;
    name: string;
    species: string;
    shareCode?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal Convite
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteType, setInviteType] = useState<"family" | "professional">("family");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState("caregiver");
  const [inviteAccessDays, setInviteAccessDays] = useState<string>("30");
  const [inviteNotifPrefs, setInviteNotifPrefs] = useState<NotificationPreferences>(() =>
    getDefaultNotificationPreferences("caregiver")
  );
  const [createdInvite, setCreatedInvite] = useState<any | null>(null);
  const [lastInvitePhone, setLastInvitePhone] = useState("");
  const [savingNotifMemberId, setSavingNotifMemberId] = useState<string | null>(null);

  // Vincular a outro pet por código/ID e convite geral de conta
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [accountInvitePhone, setAccountInvitePhone] = useState("");

  const [feedback, setFeedback] = useState<string | null>(null);

  const getAppOrigin = () =>
    typeof window !== "undefined" ? window.location.origin : "https://petrec.app";

  useEffect(() => {
    let isCancelled = false;

    async function loadMembers() {
      const petIdToFetch = activePetId || pets[0]?.id;
      if (!petIdToFetch) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/tutores?petId=${petIdToFetch}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setMembers(data.members || []);
            setInvitations(data.invitations || []);
            setPetInfo(data.pet || null);
            if (!activePetId && petIdToFetch) {
              setActivePetId(petIdToFetch);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar tutores:", err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadMembers();

    return () => {
      isCancelled = true;
    };
  }, [activePetId, pets, refreshTrigger]);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim() || !currentUser?.id) return;
    setJoiningByCode(true);
    setJoinError(null);
    try {
      const res = await fetch("/api/tutores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join_by_code",
          userId: currentUser.id,
          code: joinCodeInput.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setJoinError(json.error || "Código ou ID do pet não encontrado.");
        return;
      }
      if (json.pet?.id) {
        setActivePetId(json.pet.id);
      }
      setFeedback(`✓ Você foi vinculado(a) ao pet ${json.pet?.name || ""}!`);
      setTimeout(() => setFeedback(null), 4000);
      setJoinCodeInput("");
      triggerRefresh();
    } catch {
      setJoinError("Falha de conexão ao vincular ao pet.");
    } finally {
      setJoiningByCode(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPetId = activePetId || pets[0]?.id;
    if (!targetPetId) {
      alert("Selecione ou cadastre um pet primeiro.");
      return;
    }

    const finalRole =
      inviteType === "family"
        ? inviteRole
        : inviteRole.startsWith("vet") ||
          inviteRole.startsWith("clinic") ||
          inviteRole.startsWith("caregiver_pro")
        ? inviteRole
        : "vet_limited";

    const finalAccessDays =
      inviteType === "professional" && inviteAccessDays !== "unlimited"
        ? parseInt(inviteAccessDays)
        : null;

    try {
      const res = await fetch("/api/tutores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: targetPetId,
          invitedEmail: inviteEmail.trim() || undefined,
          invitedPhone: invitePhone.trim() || undefined,
          invitedName: inviteName.trim() || undefined,
          invitedById: currentUser.id,
          role: finalRole,
          accessDays: finalAccessDays,
          canPrescribe: finalRole === "vet_limited",
          notificationPreferences: inviteNotifPrefs,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        const targetLabel =
          inviteName.trim() ||
          inviteEmail.trim() ||
          invitePhone.trim() ||
          json.invitation?.token;
        setFeedback(`✓ Convite criado (${targetLabel})!`);
        setTimeout(() => setFeedback(null), 4000);
        setLastInvitePhone(invitePhone.trim());
        setCreatedInvite(json.invitation);
        setInviteName("");
        setInviteEmail("");
        setInvitePhone("");
        triggerRefresh();
      } else {
        alert(json.error || "Erro ao convidar tutor ou profissional");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Deseja revogar o acesso de ${memberName}?`)) return;

    try {
      const res = await fetch(
        `/api/tutores?petId=${activePetId}&memberId=${memberId}&userId=${currentUser.id}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (res.ok) {
        setFeedback(`Acesso de ${memberName} revogado com sucesso.`);
        setTimeout(() => setFeedback(null), 3500);
        triggerRefresh();
      } else {
        alert(json.error || "Erro ao revogar acesso");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleNotifications = async (memberId: string, currentlyEnabled: boolean) => {
    setSavingNotifMemberId(memberId);
    try {
      const nextValue = !currentlyEnabled;
      const res = await fetch("/api/tutores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          notifyWhatsApp: nextValue,
          actorUserId: currentUser?.id,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === memberId
              ? {
                  ...m,
                  notifyWhatsApp: nextValue,
                  ...(json.notificationPreferences
                    ? { notificationPreferences: json.notificationPreferences }
                    : {}),
                }
              : m
          )
        );
        setFeedback(
          nextValue
            ? "🔔 Alertas no WhatsApp ativados para este membro!"
            : "🔕 Alertas no WhatsApp silenciados para este membro."
        );
        setTimeout(() => setFeedback(null), 3500);
        triggerRefresh();
      } else {
        alert(json.error || "Erro ao alterar preferência de notificação.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNotifMemberId(null);
    }
  };

  const handleUpdateNotificationCategory = async (
    member: any,
    category: NotificationCategory,
    nextValue: boolean
  ) => {
    setSavingNotifMemberId(member.id);
    try {
      const res = await fetch("/api/tutores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          categoryUpdates: { [category]: nextValue },
          actorUserId: currentUser?.id,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id
              ? {
                  ...m,
                  notifyWhatsApp: json.notifyWhatsApp,
                  notificationPreferences: json.notificationPreferences,
                }
              : m
          )
        );
        setFeedback("Preferências de notificação atualizadas!");
        setTimeout(() => setFeedback(null), 2500);
        triggerRefresh();
      } else {
        alert(json.error || "Erro ao atualizar categoria de notificação.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNotifMemberId(null);
    }
  };

  const handleApplyNotificationPreset = async (
    member: any,
    preset: "clinical" | "all" | "none"
  ) => {
    setSavingNotifMemberId(member.id);
    try {
      const nextPrefs: NotificationPreferences =
        preset === "all"
          ? {
              stock: true,
              medications: true,
              feeding: true,
              vaccinations: true,
              notes: true,
              appointments: true,
            }
          : preset === "none"
          ? {
              stock: false,
              medications: false,
              feeding: false,
              vaccinations: false,
              notes: false,
              appointments: false,
            }
          : member.role === "clinic_admin" || member.role === "caregiver_pro"
          ? getDefaultNotificationPreferences(member.role)
          : getDefaultNotificationPreferences("vet_limited");

      const res = await fetch("/api/tutores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          notifyWhatsApp: preset !== "none",
          notificationPreferences: nextPrefs,
          actorUserId: currentUser?.id,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id
              ? {
                  ...m,
                  notifyWhatsApp: json.notifyWhatsApp,
                  notificationPreferences: json.notificationPreferences,
                }
              : m
          )
        );
        setFeedback("Perfil de notificações aplicado!");
        setTimeout(() => setFeedback(null), 2500);
        triggerRefresh();
      } else {
        alert(json.error || "Erro ao aplicar perfil de notificações.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNotifMemberId(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const res = await fetch(
        `/api/tutores?petId=${activePetId}&invitationId=${invitationId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setFeedback("Convite cancelado.");
        setTimeout(() => setFeedback(null), 3500);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const roleBadge: Record<
    string,
    { label: string; color: string; desc: string; icon?: any }
  > = {
    owner: {
      label: "Owner (Proprietário)",
      color: "bg-purple-100 text-purple-800 border-purple-200",
      desc: "Controle total, gerencia tutores e estoque.",
    },
    co_owner: {
      label: "Co-owner (Coproprietário)",
      color: "bg-blue-100 text-blue-800 border-blue-200",
      desc: "Cadastra remédios, registra compras e vacinas.",
    },
    caregiver: {
      label: "Caregiver (Cuidador)",
      color: "bg-amber-100 text-amber-800 border-amber-200",
      desc: "Registra alimentação e administra medicamentos.",
    },
    viewer: {
      label: "Viewer (Visualizador)",
      color: "bg-slate-100 text-slate-800 border-slate-200",
      desc: "Somente leitura dos dados e agenda.",
    },
    vet_limited: {
      label: "Médico Veterinário",
      color: "bg-indigo-100 text-indigo-900 border-indigo-300",
      desc: "Prescreve medicações, acessa prontuário e histórico de saúde.",
      icon: Stethoscope,
    },
    clinic_admin: {
      label: "Clínica / Recepção",
      color: "bg-teal-100 text-teal-900 border-teal-300",
      desc: "Gerencia agendamentos e contatos da clínica.",
      icon: Building2,
    },
    caregiver_pro: {
      label: "Pet Sitter / Adestrador",
      color: "bg-emerald-100 text-emerald-900 border-emerald-300",
      desc: "Registra passeios, refeições e ocorrências com notas de cuidado.",
      icon: Sparkles,
    },
  };

  // Separar membros familiares de profissionais
  const isProRole = (role: string) =>
    ["vet_limited", "clinic_admin", "caregiver_pro"].includes(role);

  const familyMembers = members.filter((m) => !isProRole(m.role));
  const proMembers = members.filter((m) => isProRole(m.role));
  const selfMember = members.find((m) => m.user?.id === currentUser?.id);
  const canEditMemberNotifs = (member: any) =>
    member.user?.id === currentUser?.id || permissions.canManageMembers;

  const renderMemberNotificationChips = (member: any) => {
    const prefs = resolveNotificationPreferences(
      member.role,
      member.notificationPreferences
    );
    const editable = canEditMemberNotifs(member);
    const isBusy = savingNotifMemberId === member.id;
    const isMasterOff = member.notifyWhatsApp === false;

    return (
      <div className="mt-2 pt-2 border-t border-slate-200/70 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-emerald-600" />
            <span>Tipos de notificação no WhatsApp:</span>
            {isMasterOff && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                Geral silenciado
              </span>
            )}
          </span>
          {editable && (
            <div className="flex items-center gap-1 text-[10px]">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleApplyNotificationPreset(member, "all")}
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 font-semibold transition cursor-pointer disabled:opacity-50"
              >
                Todas
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleApplyNotificationPreset(member, "clinical")}
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 font-semibold transition cursor-pointer disabled:opacity-50"
                title="Notas clínicas, vacinas, remédios e consultas (sem compras/estoque)"
              >
                Padrão Clínico
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleApplyNotificationPreset(member, "none")}
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 font-semibold transition cursor-pointer disabled:opacity-50"
              >
                Nenhuma
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {NOTIFICATION_CATEGORIES.map((cat) => {
            const active = prefs[cat.key];
            return (
              <button
                key={cat.key}
                type="button"
                disabled={!editable || isBusy}
                onClick={() =>
                  handleUpdateNotificationCategory(member, cat.key, !active)
                }
                title={cat.description}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition ${
                  active && !isMasterOff
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                    : active && isMasterOff
                    ? "bg-slate-100 text-slate-500 border-slate-200 opacity-70"
                    : "bg-slate-50 text-slate-400 border-slate-200 line-through hover:bg-slate-100"
                } ${editable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span>{cat.emoji}</span>
                <span>{cat.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-6">
      {/* Toast */}
      {feedback && (
        <div className="fixed top-16 right-4 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>Compartilhamento, Tutores & Equipe Médica</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerencie os tutores da família, profissionais de saúde e quem recebe cada tipo de notificação no WhatsApp.
          </p>
        </div>

        {permissions.canManageMembers && (activePetId || pets[0]?.id) && (
          <button
            onClick={() => {
              setCreatedInvite(null);
              setLastInvitePhone("");
              setInviteType("family");
              setInviteRole("caregiver");
              setInviteNotifPrefs(getDefaultNotificationPreferences("caregiver"));
              setShowInviteModal(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Convidar para Este Pet</span>
          </button>
        )}
      </div>

      {/* Três Fluxos Rápidos: Código do Pet, Vincular-se por Código/ID e Convidar para Criar Conta */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Código e ID do Pet Atual */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Código & ID deste Pet
                </h2>
                <p className="text-[11px] text-slate-500">
                  Quem já tem conta pode entrar usando o código ou ID de{" "}
                  <strong>{petInfo?.name || "seu pet"}</strong>.
                </p>
              </div>
            </div>

            {activePetId ? (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Código Curto do Pet
                    </div>
                    <div className="text-sm font-black font-mono text-emerald-700">
                      {petInfo?.shareCode || `PET-${activePetId.slice(-6).toUpperCase()}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const code =
                        petInfo?.shareCode || `PET-${activePetId.slice(-6).toUpperCase()}`;
                      navigator.clipboard.writeText(code);
                      setFeedback(`Código ${code} copiado!`);
                      setTimeout(() => setFeedback(null), 3000);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      ID Completo do Pet
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 truncate">
                      {activePetId}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activePetId);
                      setFeedback("ID do pet copiado!");
                      setTimeout(() => setFeedback(null), 3000);
                    }}
                    className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>ID</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 pt-1">
                Cadastre ou vincule um pet para gerar o código compartilhável.
              </p>
            )}
          </div>

          {activePetId && (
            <button
              type="button"
              onClick={() => {
                const code =
                  petInfo?.shareCode || `PET-${activePetId.slice(-6).toUpperCase()}`;
                const link = `${getAppOrigin()}/convite/${encodeURIComponent(code)}`;
                const msg = `Oi! Você pode acompanhar ${
                  petInfo?.name || "meu pet"
                } comigo no PetRec! Acesse ${link} ou use o código *${code}* (ID: ${activePetId}).`;
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(msg)}`,
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Enviar Código pelo WhatsApp</span>
            </button>
          )}
        </div>

        {/* 2. Vincular-se a outro Pet por Código ou ID */}
        <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Vincular-me a Outro Pet
                </h2>
                <p className="text-[11px] text-slate-500">
                  Cole um código de convite (<strong>CONV-...</strong>), código do pet (<strong>PET-...</strong>) ou ID.
                </p>
              </div>
            </div>

            <form onSubmit={handleJoinByCode} className="space-y-2.5 pt-1">
              <input
                type="text"
                required
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="Ex: CONV-7K9M2P, PET-8A2C4F ou ID"
                className="w-full px-3 py-2 text-xs sm:text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              {joinError && (
                <p className="text-[11px] font-semibold text-rose-600">{joinError}</p>
              )}
              <button
                type="submit"
                disabled={joiningByCode}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {joiningByCode ? "Vinculando..." : "Vincular ao Pet Agora"}
              </button>
            </form>
          </div>
          <p className="text-[11px] text-slate-400">
            Você também pode enviar o código direto no WhatsApp do PetRec!
          </p>
        </div>

        {/* 3. Convidar Alguém para Criar Conta no PetRec */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/70 rounded-2xl border border-emerald-200 p-4 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Convidar para Criar Conta
                </h2>
                <p className="text-[11px] text-emerald-900/80">
                  Indique o PetRec para outro tutor criar uma conta gratuita.
                </p>
              </div>
            </div>

            <input
              type="tel"
              value={accountInvitePhone}
              onChange={(e) => setAccountInvitePhone(e.target.value)}
              placeholder="WhatsApp do amigo com DDD (opcional)"
              className="w-full px-3 py-2 text-xs bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => {
                const link = `${getAppOrigin()}/convite/conta?de=${encodeURIComponent(
                  currentUser?.name || "Tutor"
                )}`;
                navigator.clipboard.writeText(link);
                setFeedback("Link de convite para cadastro copiado!");
                setTimeout(() => setFeedback(null), 3000);
              }}
              className="flex-1 py-2 px-3 bg-white hover:bg-emerald-100/60 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-emerald-700" />
              <span>Copiar Link</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const link = `${getAppOrigin()}/convite/conta?de=${encodeURIComponent(
                  currentUser?.name || "Tutor"
                )}`;
                const digits = accountInvitePhone.replace(/\D/g, "");
                const target =
                  digits.length >= 10
                    ? digits.startsWith("55")
                      ? digits
                      : `55${digits}`
                    : "";
                const msg = `Oi! Estou usando o PetRec para controlar a ração, remédios e saúde dos pets até pelo WhatsApp. Crie sua conta grátis aqui: ${link}`;
                window.open(
                  `https://wa.me/${target}?text=${encodeURIComponent(msg)}`,
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>
      </section>

      {/* Minhas Preferências de Notificação neste Pet */}
      {selfMember && activePetId && (() => {
        const selfPrefs = resolveNotificationPreferences(
          selfMember.role,
          selfMember.notificationPreferences
        );
        const selfMasterOn = selfMember.notifyWhatsApp !== false;
        const isBusy = savingNotifMemberId === selfMember.id;
        return (
          <section className="bg-white rounded-2xl border border-emerald-200 p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Minhas Preferências de Notificação em {petInfo?.name || "este Pet"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selfMember.user?.whatsappPhoneNumber
                      ? `Escolha quais avisos de outros tutores você deseja receber no WhatsApp (${selfMember.user.whatsappPhoneNumber}).`
                      : "Configure quais categorias deseja receber assim que conectar seu WhatsApp na aba WhatsApp."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  handleToggleNotifications(selfMember.id, selfMasterOn)
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                  selfMasterOn
                    ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                    : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                }`}
              >
                {selfMasterOn ? (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    <span>Recebimento Geral: Ativo</span>
                  </>
                ) : (
                  <>
                    <BellOff className="w-3.5 h-3.5" />
                    <span>Tudo Silenciado</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {NOTIFICATION_CATEGORIES.map((cat) => {
                const active = selfPrefs[cat.key];
                return (
                  <button
                    key={cat.key}
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      handleUpdateNotificationCategory(
                        selfMember,
                        cat.key,
                        !active
                      )
                    }
                    className={`p-3 rounded-xl border text-left transition flex items-start justify-between gap-2 cursor-pointer disabled:opacity-50 ${
                      active && selfMasterOn
                        ? "bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100/70"
                        : active
                        ? "bg-slate-50 border-slate-200 opacity-75 hover:bg-slate-100"
                        : "bg-slate-50/60 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{cat.emoji}</span>
                        <span>{cat.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {cat.description}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        active
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : "bg-slate-200 text-slate-600 border-slate-300"
                      }`}
                    >
                      {active ? "Ativo" : "Off"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Seção 1: Equipe Médica & Profissionais Credenciados */}
      <section className="bg-white rounded-2xl border border-indigo-100 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-50 pb-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Equipe Médica & Profissionais Credenciados ({proMembers.length})
              </h2>
              <p className="text-xs text-slate-500">
                Veterinários, clínicas e cuidadores com permissão clínica contextual e privacidade financeira garantida.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200">
            <Lock className="w-3.5 h-3.5 text-indigo-500" />
            <span>Privacidade: dados financeiros e compras da família são blindados</span>
          </div>
        </div>

        {proMembers.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
            <Stethoscope className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs text-slate-500">
              Nenhum médico veterinário ou profissional credenciado para este pet ainda.
            </p>
            {permissions.canManageMembers && (
              <button
                onClick={() => {
                  setInviteType("professional");
                  setInviteRole("vet_limited");
                  setInviteNotifPrefs(getDefaultNotificationPreferences("vet_limited"));
                  setShowInviteModal(true);
                }}
                className="text-xs text-indigo-600 font-bold hover:underline"
              >
                + Conectar Médico Veterinário agora
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {proMembers.map((member) => {
              const roleInfo = roleBadge[member.role] || roleBadge.vet_limited;
              const profile = member.user?.professionalProfile;
              const daysRemaining = member.accessExpiresAt
                ? differenceInCalendarDays(new Date(member.accessExpiresAt), new Date())
                : null;

              let specialtiesList: string[] = [];
              if (profile?.specialties) {
                try {
                  specialtiesList = JSON.parse(profile.specialties);
                } catch {
                  specialtiesList = [profile.specialties];
                }
              }

              return (
                <div
                  key={member.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3 relative group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={member.user.avatar || "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=120"}
                        alt={member.user.name}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-indigo-200"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                          <span>{member.user.name}</span>
                          {profile?.isVerified && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{member.user.email}</div>
                        {profile?.clinicName && (
                          <div className="text-[11px] text-indigo-700 font-semibold mt-0.5">
                            {profile.clinicName}
                          </div>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${roleInfo.color}`}
                    >
                      {roleInfo.label}
                    </span>
                  </div>

                  {/* Detalhes Profissionais */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs space-y-1.5">
                    {profile?.registerNumber && (
                      <div className="text-slate-700">
                        <strong>Registro:</strong> {profile.registerNumber}
                      </div>
                    )}

                    {specialtiesList.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center pt-0.5">
                        <span className="text-[10px] text-slate-400 font-medium">Especialidades:</span>
                        {specialtiesList.map((spec, i) => (
                          <span
                            key={i}
                            className="bg-indigo-50 text-indigo-800 text-[10px] font-semibold px-2 py-0.2 rounded-md"
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                    )}

                    {profile?.bio && (
                      <p className="text-[11px] text-slate-500 italic pt-0.5">&ldquo;{profile.bio}&rdquo;</p>
                    )}
                  </div>

                  {/* Permissões & Status de Acesso */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Prescrição médica</span>
                      </span>
                      <span>•</span>
                      {daysRemaining !== null ? (
                        <span className="text-amber-700 font-medium">
                          Expira em {daysRemaining} dia(s)
                        </span>
                      ) : (
                        <span className="text-slate-600 font-medium">Acesso contínuo</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {member.user?.whatsappPhoneNumber ? (
                        <button
                          type="button"
                          disabled={!(member.user.id === currentUser.id || permissions.canManageMembers)}
                          onClick={() =>
                            handleToggleNotifications(member.id, member.notifyWhatsApp !== false)
                          }
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold transition ${
                            member.notifyWhatsApp !== false
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                          } ${
                            member.user.id === currentUser.id || permissions.canManageMembers
                              ? "cursor-pointer"
                              : "opacity-75 cursor-default"
                          }`}
                          title="Alternar notificações de atividades pelo WhatsApp"
                        >
                          {member.notifyWhatsApp !== false ? (
                            <>
                              <Bell className="w-3 h-3 text-emerald-600" />
                              <span>Alertas WhatsApp: Ativos</span>
                            </>
                          ) : (
                            <>
                              <BellOff className="w-3 h-3 text-slate-500" />
                              <span>Alertas WhatsApp: Silenciados</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200 text-[10px] font-medium">
                          Sem WhatsApp cadastrado
                        </span>
                      )}

                      {permissions.canManageMembers && (
                        <button
                          onClick={() => handleRemoveMember(member.id, member.user.name)}
                          className="text-rose-600 hover:text-rose-800 text-[11px] font-bold flex items-center gap-1 p-1 hover:bg-rose-50 rounded"
                          title="Revogar Acesso"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Revogar</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {renderMemberNotificationChips(member)}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Seção 2: Tutores Familiares Ativos */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          Tutores & Cuidadores Familiares ({familyMembers.length})
        </h2>

        <div className="divide-y divide-slate-100">
          {familyMembers.map((member) => {
            const roleInfo = roleBadge[member.role] || roleBadge.caregiver;
            const isSelf = member.user.id === currentUser.id;

            return (
              <div key={member.id} className="py-3.5 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={member.user.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
                      alt={member.user.name}
                      className="w-11 h-11 rounded-full object-cover ring-2 ring-slate-200"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {member.user.name}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                            Você
                          </span>
                        )}
                        {member.isPrimary && (
                          <span className="text-[10px] bg-purple-200 text-purple-900 font-bold px-1.5 py-0.5 rounded">
                            Principal
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{member.user.email}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {roleInfo.desc}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                    {member.user?.whatsappPhoneNumber ? (
                      <button
                        type="button"
                        disabled={!(isSelf || permissions.canManageMembers)}
                        onClick={() =>
                          handleToggleNotifications(member.id, member.notifyWhatsApp !== false)
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition ${
                          member.notifyWhatsApp !== false
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                        } ${
                          isSelf || permissions.canManageMembers
                            ? "cursor-pointer"
                            : "opacity-75 cursor-default"
                        }`}
                        title="Ativar ou silenciar notificações pelo WhatsApp quando outro tutor registrar algo"
                      >
                        {member.notifyWhatsApp !== false ? (
                          <>
                            <Bell className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Alertas WhatsApp: Ativos</span>
                          </>
                        ) : (
                          <>
                            <BellOff className="w-3.5 h-3.5 text-slate-500" />
                            <span>Alertas WhatsApp: Silenciados</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-400 border border-slate-200 text-[11px] font-medium">
                        Sem WhatsApp cadastrado
                      </span>
                    )}

                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full border ${roleInfo.color}`}
                    >
                      {roleInfo.label}
                    </span>

                    {permissions.canManageMembers && !member.isPrimary && !isSelf && (
                      <button
                        onClick={() => handleRemoveMember(member.id, member.user.name)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition"
                        title="Remover Tutor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {renderMemberNotificationChips(member)}
              </div>
            );
          })}
        </div>
      </section>

      {/* Convites Pendentes */}
      {invitations.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-600" />
            <span>Convites Enviados</span>
          </h2>
          <div className="divide-y divide-slate-100">
            {invitations.map((inv) => (
              <div key={inv.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-800">
                      {inv.invitedEmail ||
                        inv.invitedPhone ||
                        inv.invitedName ||
                        "Convite por Link / Código"}
                    </span>
                    <span className="font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md">
                      {inv.token}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Papel proposto: <strong>{roleBadge[inv.role]?.label || inv.role}</strong>
                    {inv.accessDays && <span> • Validade de {inv.accessDays} dias</span>} • Enviado em{" "}
                    {format(new Date(inv.createdAt), "dd/MM/yyyy")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!inv.acceptedAt && (
                    <button
                      type="button"
                      onClick={() => {
                        const link = `${getAppOrigin()}/convite/${encodeURIComponent(
                          inv.token
                        )}`;
                        navigator.clipboard.writeText(link);
                        setFeedback(`Link do convite ${inv.token} copiado!`);
                        setTimeout(() => setFeedback(null), 3000);
                      }}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      title="Copiar link do convite"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Link</span>
                    </button>
                  )}
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                      inv.acceptedAt
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {inv.acceptedAt ? "Aceito ✓" : "Pendente"}
                  </span>
                  {!inv.acceptedAt && permissions.canManageMembers && (
                    <button
                      onClick={() => handleCancelInvitation(inv.id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Cancelar Convite"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Matriz de Papéis e Permissões (RBAC) */}
      <section className="bg-slate-900 text-slate-100 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Matriz de Papéis e Permissões Expandida (RBAC + Saúde)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="font-bold text-purple-300 block mb-1">Owner</span>
            <p className="text-slate-300 text-[11px]">
              Proprietário principal. Controle total do pet, tutores e regras de estoque.
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="font-bold text-blue-300 block mb-1">Co-owner</span>
            <p className="text-slate-300 text-[11px]">
              Coproprietário. Aprova prescrições, cadastra medicamentos e compras.
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="font-bold text-amber-300 block mb-1">Caregiver</span>
            <p className="text-slate-300 text-[11px]">
              Cuidador familiar. Administra doses, registra alimentação e rotinas diárias.
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="font-bold text-indigo-300 block mb-1">Vet Limited</span>
            <p className="text-slate-300 text-[11px]">
              Médico Veterinário. Prescreve receitas, emite notas clínicas. Finanças blindadas.
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="font-bold text-teal-300 block mb-1">Clínica Admin</span>
            <p className="text-slate-300 text-[11px]">
              Recepção médica. Gerencia agendamentos, contatos e retornos.
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="font-bold text-emerald-300 block mb-1">Caregiver Pro</span>
            <p className="text-slate-300 text-[11px]">
              Pet Sitter / Adestrador. Registra passeios, incidentes e relatórios de hospedagem.
            </p>
          </div>
        </div>
      </section>

      {/* Modal Convidar Tutor ou Profissional */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900">
                Conectar Novo Membro ou Profissional
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* Abas: Tutor Familiar vs Profissional */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setInviteType("family");
                  setInviteRole("caregiver");
                  setInviteNotifPrefs(getDefaultNotificationPreferences("caregiver"));
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  inviteType === "family"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Tutor Familiar / Cuidador
              </button>
              <button
                type="button"
                onClick={() => {
                  setInviteType("professional");
                  setInviteRole("vet_limited");
                  setInviteNotifPrefs(getDefaultNotificationPreferences("vet_limited"));
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 ${
                  inviteType === "professional"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>Profissional de Saúde / Pet Sitter</span>
              </button>
            </div>

            {!createdInvite ? (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    {inviteType === "professional"
                      ? "Nome do Profissional / Clínica"
                      : "Nome do Convidado"}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      inviteType === "professional"
                        ? "ex: Dra. Camila Ramos"
                        : "ex: Ana Silva"
                    }
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {inviteType === "professional"
                        ? "E-mail do Profissional (opcional)"
                        : "E-mail do Convidado (opcional)"}
                    </label>
                    <input
                      type="email"
                      placeholder={
                        inviteType === "professional"
                          ? "ex: dra.camila@vet.com"
                          : "ex: ana@exemplo.com"
                      }
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      WhatsApp com DDD (opcional)
                    </label>
                    <input
                      type="tel"
                      placeholder="19999999999"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 -mt-2">
                  Você pode deixar e-mail e WhatsApp em branco se quiser apenas gerar o código e link do convite para enviar por onde preferir.
                </p>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Papel e Atribuições
                  </label>
                  {inviteType === "family" ? (
                    <select
                      value={inviteRole}
                      onChange={(e) => {
                        const nextRole = e.target.value;
                        setInviteRole(nextRole);
                        setInviteNotifPrefs(getDefaultNotificationPreferences(nextRole));
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="co_owner">Co-owner (Coproprietário - Aprova prescrições)</option>
                      <option value="caregiver">Caregiver (Cuidador - Registra rotinas)</option>
                      <option value="viewer">Viewer (Somente Leitura)</option>
                    </select>
                  ) : (
                    <select
                      value={inviteRole}
                      onChange={(e) => {
                        const nextRole = e.target.value;
                        setInviteRole(nextRole);
                        setInviteNotifPrefs(getDefaultNotificationPreferences(nextRole));
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="vet_limited">
                        🩺 Médico Veterinário (Emite prescrições e notas no prontuário)
                      </option>
                      <option value="clinic_admin">
                        🏥 Recepção / Clínica (Agenda consultas e exames)
                      </option>
                      <option value="caregiver_pro">
                        🐕 Pet Sitter / Adestrador (Relatório de passeios e cuidados)
                      </option>
                    </select>
                  )}
                </div>

                {inviteType === "professional" && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Período de Validade do Acesso
                    </label>
                    <select
                      value={inviteAccessDays}
                      onChange={(e) => setInviteAccessDays(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="7">7 dias (Consulta ou Procedimento Pontual)</option>
                      <option value="30">30 dias (Tratamento ou Pós-operatório)</option>
                      <option value="90">90 dias (Acompanhamento Trimestral)</option>
                      <option value="unlimited">Ilimitado (Veterinário da Família)</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Após o período determinado, o profissional perde a visualização do histórico sem necessidade de cancelamento manual.
                    </p>
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Notificações no WhatsApp para este membro</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setInviteNotifPrefs(getDefaultNotificationPreferences(inviteRole))
                      }
                      className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                    >
                      Restaurar padrão do papel
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {inviteRole === "vet_limited"
                      ? "Por padrão, veterinários recebem notas clínicas, vacinas, remédios e consultas, mas NÃO recebem avisos de compras ou mudanças de estoque."
                      : "Selecione quais categorias de atividade este membro deve receber no WhatsApp."}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {NOTIFICATION_CATEGORIES.map((cat) => {
                      const checked = inviteNotifPrefs[cat.key];
                      return (
                        <label
                          key={cat.key}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                            checked
                              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                              : "bg-white border-slate-200 text-slate-500"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setInviteNotifPrefs((prev) => ({
                                ...prev,
                                [cat.key]: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>{cat.emoji}</span>
                          <span className="truncate">{cat.shortLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-xs flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gerar Convite / Credenciamento</span>
                  </button>
                </div>
              </form>
            ) : (
              /* QR Code & Link de Credenciamento Rápido no Consultório */
              <div className="space-y-4 py-2 text-center animate-in fade-in">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Convite Pronto para Compartilhamento!
                  </h4>
                  <p className="text-xs text-slate-500">
                    Apresente o QR Code no balcão da clínica ou envie o link seguro.
                  </p>
                </div>

                {/* QR Code Container Mockup */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block shadow-inner mx-auto">
                  <div className="w-36 h-36 bg-white border-2 border-slate-900 rounded-xl p-2 mx-auto flex flex-col items-center justify-center relative">
                    <QrCode className="w-28 h-28 text-slate-900" />
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                      {createdInvite.token.substring(0, 10)}...
                    </span>
                  </div>
                </div>

                {/* Código de Convite Curto */}
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200 flex items-center justify-between gap-2 text-left">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-indigo-500">
                      Código do Convite
                    </div>
                    <div className="text-base font-black font-mono text-indigo-900">
                      {createdInvite.token}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdInvite.token);
                      setFeedback(`Código ${createdInvite.token} copiado!`);
                      setTimeout(() => setFeedback(null), 3000);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-indigo-100 border border-indigo-300 rounded-lg text-xs font-bold text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Código</span>
                  </button>
                </div>

                {/* Link Real de Convite */}
                <div className="bg-slate-100 p-2.5 rounded-xl text-xs font-mono text-slate-700 break-all select-all flex items-center justify-between gap-2">
                  <span>{`${getAppOrigin()}/convite/${createdInvite.token}`}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${getAppOrigin()}/convite/${createdInvite.token}`
                      );
                      setFeedback("Link copiado para a área de transferência!");
                      setTimeout(() => setFeedback(null), 3000);
                    }}
                    className="p-1 hover:bg-slate-200 rounded text-slate-600 shrink-0 cursor-pointer"
                    title="Copiar Link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const inviteUrl = `${getAppOrigin()}/convite/${createdInvite.token}`;
                      const petLabel = petInfo?.name || "meu pet";
                      const digits = lastInvitePhone.replace(/\D/g, "");
                      const target =
                        digits.length >= 10
                          ? digits.startsWith("55")
                            ? digits
                            : `55${digits}`
                          : "";
                      const msg = `Oi! Convidei você para cuidar de *${petLabel}* comigo no PetRec! Aceite pelo link ${inviteUrl} ou use o código *${createdInvite.token}*.`;
                      window.open(
                        `https://wa.me/${target}?text=${encodeURIComponent(msg)}`,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                    className="px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Enviar Convite pelo WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setCreatedInvite(null);
                      setLastInvitePhone("");
                    }}
                    className="px-6 py-2.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl cursor-pointer"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
