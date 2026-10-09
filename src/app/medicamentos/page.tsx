"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import {
  Pill,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Calendar,
  User,
  ShieldCheck,
  Edit2,
  Trash2,
  AlertTriangle,
  Package,
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

export default function MedicamentosPage() {
  const { activePetId, setActivePetId, pets, currentUser, refreshTrigger, triggerRefresh, permissions } = useApp();
  const [medications, setMedications] = useState<any[]>([]);
  const [administrations, setAdministrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

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
        const res = await fetch(`/api/medications?petId=${petIdToFetch}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setMedications(data.medications || []);
            setAdministrations(data.administrationsToday || []);
            if (!activePetId && petIdToFetch) {
              setActivePetId(petIdToFetch);
            }
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
  }, [activePetId, pets, refreshTrigger]);

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

      {/* Seção 1: Programação de Hoje (Administrações) */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
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

        {administrations.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">
            Nenhuma dose de medicamento programada para hoje.
          </p>
        ) : (
          <div className="space-y-3">
            {administrations.map((adm) => {
              const timeStr = safeFormat(adm.scheduledAt, "HH:mm") || "--:--";
              const isDone = adm.status === "administered";
              const isSkipped = adm.status === "skipped";

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
                      className={`w-14 text-center py-2 rounded-xl text-sm font-black ${
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
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-base">
                          {adm.medication?.name || "Medicamento"}
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
                            {safeFormat(
                              adm.administeredAt || adm.scheduledAt,
                              "HH:mm",
                              { locale: ptBR }
                            ) || "--:--"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações de Administração */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!isDone && permissions.canAdministerMedications && (
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            Medicamentos Cadastrados para este Pet
          </h2>
          <span className="text-xs font-semibold text-slate-500">
            Total: {medications.length} {medications.length === 1 ? "medicamento" : "medicamentos"}
          </span>
        </div>

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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {medications.map((med) => (
              <div
                key={med.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3 hover:border-slate-300 transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Top Bar do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                        <span>{med.name}</span>
                        {med.status === "pending_tutor_approval" && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                            Aguardando Aprovação
                          </span>
                        )}
                      </h3>
                      <div className="text-xs text-slate-500">
                        {med.activeIngredient && `Princípio ativo: ${med.activeIngredient} • `}
                        {med.presentation || "Comprimidos"}
                      </div>
                    </div>

                    {/* Ações (Editar / Excluir) */}
                    <div className="flex items-center gap-1">
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
                        {med.dosage || "1 dose padrão"}
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
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
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
                      {med.schedules?.map((sch: any) => {
                        let times: string[] = [];
                        try {
                          times = JSON.parse(sch.times || "[]");
                        } catch {
                          times = [];
                        }
                        return times.map((t: string) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold"
                          >
                            <Clock className="w-3 h-3 text-emerald-600" />
                            <span>{t}</span>
                          </span>
                        ));
                      })}
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
                Esta ação removerá o medicamento, seu cronograma de horários e o item de estoque correspondente. O histórico de administrações passadas será mantido para auditoria.
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
