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
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TutoresPage() {
  const { activePetId, setActivePetId, pets, currentUser, refreshTrigger, triggerRefresh, permissions } = useApp();
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Convite
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteType, setInviteType] = useState<"family" | "professional">("family");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("caregiver");
  const [inviteAccessDays, setInviteAccessDays] = useState<string>("30");
  const [createdInvite, setCreatedInvite] = useState<any | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);

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

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

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
          petId: activePetId,
          invitedEmail: inviteEmail,
          invitedById: currentUser.id,
          role: finalRole,
          accessDays: finalAccessDays,
          canPrescribe: finalRole === "vet_limited",
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setFeedback(`✓ Convite gerado para ${inviteEmail}!`);
        setTimeout(() => setFeedback(null), 4000);
        setCreatedInvite(json.invitation);
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
            Gerencie os tutores da família e credencie profissionais de saúde com controle rígido de privacidade.
          </p>
        </div>

        {permissions.canManageMembers && (
          <button
            onClick={() => {
              setCreatedInvite(null);
              setShowInviteModal(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>Convidar Tutor ou Profissional</span>
          </button>
        )}
      </div>

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
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                    <div className="flex items-center gap-2">
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
              <div
                key={member.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
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

                <div className="flex items-center gap-3 self-end sm:self-center">
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
              <div key={inv.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-800">{inv.invitedEmail}</div>
                  <div className="text-slate-500 text-[11px]">
                    Papel proposto: <strong>{roleBadge[inv.role]?.label || inv.role}</strong>
                    {inv.accessDays && <span> • Validade de {inv.accessDays} dias</span>} • Enviado em{" "}
                    {format(new Date(inv.createdAt), "dd/MM/yyyy")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 space-y-4">
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
                      ? "E-mail do Médico Veterinário / Clínica / Sitter *"
                      : "E-mail do Convidado *"}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder={
                      inviteType === "professional"
                        ? "ex: dra.camila@veterinaria.com"
                        : "ex: ana@exemplo.com"
                    }
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Papel e Atribuições
                  </label>
                  {inviteType === "family" ? (
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="co_owner">Co-owner (Coproprietário - Aprova prescrições)</option>
                      <option value="caregiver">Caregiver (Cuidador - Registra rotinas)</option>
                      <option value="viewer">Viewer (Somente Leitura)</option>
                    </select>
                  ) : (
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
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

                <div className="bg-slate-100 p-2.5 rounded-xl text-xs font-mono text-slate-700 break-all select-all flex items-center justify-between gap-2">
                  <span>https://petrec.app/convite/{createdInvite.token}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `https://petrec.app/convite/${createdInvite.token}`
                      );
                      setFeedback("Link copiado para a área de transferência!");
                      setTimeout(() => setFeedback(null), 3000);
                    }}
                    className="p-1 hover:bg-slate-200 rounded text-slate-600"
                    title="Copiar Link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setCreatedInvite(null);
                    }}
                    className="px-6 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl"
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
