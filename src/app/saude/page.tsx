"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import {
  HeartPulse,
  Syringe,
  Calendar,
  Scale,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  MapPin,
  User,
  Stethoscope,
  Lock,
  ShieldCheck,
  Check,
  X,
  FileCheck,
  ChevronDown,
  Info,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function SaudePage() {
  const { activePetId, setActivePetId, pets, currentUser, refreshTrigger, triggerRefresh, permissions } = useApp();
  const [data, setData] = useState<any>({
    vaccines: [],
    weightHistory: [],
    appointments: [],
    healthEvents: [],
  });
  const [prescriptions, setPrescriptions] = useState<{ pending: any[]; history: any[] }>({
    pending: [],
    history: [],
  });
  const [clinicalNotes, setClinicalNotes] = useState<any[]>([]);
  const [userCanViewPrivateVetNotes, setUserCanViewPrivateVetNotes] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modais de Cadastro Rápido de Saúde
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightValue, setWeightValue] = useState("");
  const [weightNotes, setWeightNotes] = useState("");

  const [showApptModal, setShowApptModal] = useState(false);
  const [apptTitle, setApptTitle] = useState("");
  const [apptType, setApptType] = useState("consulta");
  const [apptDate, setApptDate] = useState("");
  const [apptTime, setApptTime] = useState("14:00");
  const [apptLocation, setApptLocation] = useState("");
  const [apptVet, setApptVet] = useState("");

  const [showVaccineModal, setShowVaccineModal] = useState(false);
  const [vaccName, setVaccName] = useState("");
  const [vaccDate, setVaccDate] = useState("");
  const [vaccDueDate, setVaccDueDate] = useState("");
  const [vaccVet, setVaccVet] = useState("");

  // Modais de Prescrição & Prontuário
  const [showPrescribeModal, setShowPrescribeModal] = useState(false);
  const [prescName, setPrescName] = useState("");
  const [prescActiveIng, setPrescActiveIng] = useState("");
  const [prescPresentation, setPrescPresentation] = useState("Comprimido");
  const [prescDosage, setPrescDosage] = useState("1 comprimido");
  const [prescUnit, setPrescUnit] = useState("comprimidos");
  const [prescFrequency, setPrescFrequency] = useState("daily");
  const [prescTimes, setPrescTimes] = useState("08:00");
  const [prescDurationDays, setPrescDurationDays] = useState("7");
  const [prescInstructions, setPrescInstructions] = useState("");
  const [prescNotes, setPrescNotes] = useState("");

  // Modal de Aprovação de Prescrição
  const [selectedPendingMed, setSelectedPendingMed] = useState<any | null>(null);
  const [approvalStockQuantity, setApprovalStockQuantity] = useState("1");

  // Modal de Rejeição de Prescrição
  const [selectedRejectMed, setSelectedRejectMed] = useState<any | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState("");

  // Modal de Nova Nota Clínica
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"ALL_TUTORS" | "PROFESSIONALS_ONLY">("ALL_TUTORS");

  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadHealthData() {
      const petIdToFetch = activePetId || pets[0]?.id;
      if (!petIdToFetch) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [healthRes, prescRes, notesRes] = await Promise.all([
          fetch(`/api/saude?petId=${petIdToFetch}`),
          fetch(`/api/medications/prescriptions?petId=${petIdToFetch}`),
          fetch(`/api/saude/notas?petId=${petIdToFetch}&userId=${currentUser.id}`),
        ]);

        if (healthRes.ok) {
          const json = await healthRes.json();
          if (!isCancelled) setData(json);
        }

        if (prescRes.ok) {
          const json = await prescRes.json();
          if (!isCancelled) setPrescriptions(json);
        }

        if (notesRes.ok) {
          const json = await notesRes.json();
          if (!isCancelled) {
            setClinicalNotes(json.notes || []);
            setUserCanViewPrivateVetNotes(json.userCanViewPrivateVetNotes || false);
          }
        }

        if (!activePetId && petIdToFetch && !isCancelled) {
          setActivePetId(petIdToFetch);
        }
      } catch (err) {
        console.error("Erro ao carregar dados de saúde:", err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadHealthData();

    return () => {
      isCancelled = true;
    };
  }, [activePetId, pets, currentUser.id, refreshTrigger]);

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightValue) return;

    try {
      const res = await fetch("/api/saude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "weight",
          petId: activePetId,
          userId: currentUser.id,
          data: {
            weight: parseFloat(weightValue),
            notes: weightNotes,
          },
        }),
      });

      if (res.ok) {
        setFeedback("Peso registrado com sucesso!");
        setTimeout(() => setFeedback(null), 3500);
        setShowWeightModal(false);
        setWeightValue("");
        setWeightNotes("");
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptTitle || !apptDate) return;

    try {
      const res = await fetch("/api/saude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "appointment",
          petId: activePetId,
          userId: currentUser.id,
          data: {
            title: apptTitle,
            type: apptType,
            date: apptDate,
            time: apptTime,
            location: apptLocation,
            veterinarian: apptVet,
          },
        }),
      });

      if (res.ok) {
        setFeedback("Compromisso agendado!");
        setTimeout(() => setFeedback(null), 3500);
        setShowApptModal(false);
        setApptTitle("");
        setApptDate("");
        setApptLocation("");
        setApptVet("");
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddVaccine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaccName || !vaccDate) return;

    try {
      const res = await fetch("/api/saude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "vaccination",
          petId: activePetId,
          userId: currentUser.id,
          data: {
            name: vaccName,
            applicationDate: vaccDate,
            nextDueDate: vaccDueDate || null,
            veterinarian: vaccVet,
          },
        }),
      });

      if (res.ok) {
        setFeedback("Vacina registrada!");
        setTimeout(() => setFeedback(null), 3500);
        setShowVaccineModal(false);
        setVaccName("");
        setVaccDate("");
        setVaccDueDate("");
        setVaccVet("");
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreatePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prescName) return;

    const timesArray = prescTimes.split(",").map((t) => t.trim()).filter(Boolean);

    try {
      const res = await fetch("/api/medications/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: activePetId,
          prescribedById: currentUser.id,
          name: prescName,
          activeIngredient: prescActiveIng,
          presentation: prescPresentation,
          dosage: prescDosage,
          unit: prescUnit,
          instructions: prescInstructions,
          frequency: prescFrequency,
          times: timesArray.length > 0 ? timesArray : ["08:00"],
          durationDays: prescDurationDays ? parseInt(prescDurationDays) : null,
          clinicalNotes: prescNotes,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        const msg =
          json.initialStatus === "active"
            ? "Prescrição cadastrada e ativada!"
            : "Prescrição enviada! Aguardando aprovação do tutor.";
        setFeedback(msg);
        setTimeout(() => setFeedback(null), 4000);
        setShowPrescribeModal(false);
        setPrescName("");
        setPrescActiveIng("");
        setPrescInstructions("");
        setPrescNotes("");
        triggerRefresh();
      } else {
        alert(json.error || "Erro ao prescrever medicamento");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprovePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPendingMed) return;

    try {
      const res = await fetch("/api/medications/prescriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicationId: selectedPendingMed.id,
          action: "approve",
          userId: currentUser.id,
          initialStockQuantity: parseFloat(approvalStockQuantity) || 0,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setFeedback(`✓ Prescrição de ${selectedPendingMed.name} aprovada! Estoque e horários ativados.`);
        setTimeout(() => setFeedback(null), 4000);
        setSelectedPendingMed(null);
        triggerRefresh();
      } else {
        alert(json.error || "Erro ao aprovar prescrição");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRejectMed) return;

    try {
      const res = await fetch("/api/medications/prescriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicationId: selectedRejectMed.id,
          action: "reject",
          userId: currentUser.id,
          notes: rejectionNotes,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setFeedback(`Prescrição recusada.`);
        setTimeout(() => setFeedback(null), 3500);
        setSelectedRejectMed(null);
        setRejectionNotes("");
        triggerRefresh();
      } else {
        alert(json.error || "Erro ao rejeitar prescrição");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddClinicalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent) return;

    try {
      const res = await fetch("/api/saude/notas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: activePetId,
          authorId: currentUser.id,
          content: noteContent,
          visibility: noteVisibility,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setFeedback("Nota clínica registrada no prontuário!");
        setTimeout(() => setFeedback(null), 3500);
        setShowNoteModal(false);
        setNoteContent("");
        setNoteVisibility("ALL_TUTORS");
        triggerRefresh();
      } else {
        alert(json.error || "Erro ao registrar nota");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-6">
      {/* Toast de Feedback */}
      {feedback && (
        <div className="fixed top-16 right-4 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-rose-600" />
            <span>Saúde, Prontuário & Prescrições</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Histórico veterinário integrado, prescrições clínicas, controle de vacinas e evolução de peso.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {permissions.canPrescribe && (
            <button
              onClick={() => setShowPrescribeModal(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <Stethoscope className="w-4 h-4" />
              <span>+ Prescrever Medicamento</span>
            </button>
          )}

          {permissions.canAddClinicalNotes && (
            <button
              onClick={() => setShowNoteModal(true)}
              className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-purple-600" />
              <span>+ Nota Clínica</span>
            </button>
          )}

          <button
            onClick={() => setShowWeightModal(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Scale className="w-4 h-4 text-emerald-600" />
            <span>+ Peso</span>
          </button>

          <button
            onClick={() => setShowVaccineModal(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Syringe className="w-4 h-4 text-amber-600" />
            <span>+ Vacina</span>
          </button>

          <button
            onClick={() => setShowApptModal(true)}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <Calendar className="w-4 h-4" />
            <span>+ Compromisso</span>
          </button>
        </div>
      </div>

      {/* Alerta de Prescrições Pendentes de Aprovação (Fluxo Clínico em 2 Etapas) */}
      {prescriptions.pending.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>
                {permissions.canApprovePrescriptions
                  ? "Prescrições Veterinárias Pendentes de Aprovação"
                  : "Prescrições Emitidas (Aguardando Aprovação do Tutor)"}
              </span>
            </div>
            <span className="bg-amber-200/80 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {prescriptions.pending.length} pendente(s)
            </span>
          </div>

          <p className="text-xs text-amber-800 leading-relaxed">
            {permissions.canApprovePrescriptions
              ? "O médico veterinário prescreveu novas medicações. Ao aprovar, o sistema inicializa automaticamente os lembretes de posologia e a gestão contínua de estoque para compras futuras."
              : "Sua prescrição foi registrada no prontuário. O tutor principal foi notificado para aprovar o início do tratamento e informar a quantidade adquirida para o estoque."}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {prescriptions.pending.map((med: any) => (
              <div
                key={med.id}
                className="bg-white rounded-xl border border-amber-200 p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{med.name}</h3>
                    {med.activeIngredient && (
                      <p className="text-xs text-slate-500">Princípio: {med.activeIngredient}</p>
                    )}
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                    Aguardando Tutor
                  </span>
                </div>

                <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                  <div>
                    <strong>Posologia:</strong> {med.dosage || "Conforme instrução"} ({med.presentation || "uso veterinário"})
                  </div>
                  {med.instructions && (
                    <div className="italic text-slate-600">
                      &ldquo;{med.instructions}&rdquo;
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      Prescrito por:{" "}
                      <strong>
                        {med.prescribedBy?.name || med.veterinarian || "Veterinário"}
                      </strong>
                      {med.prescribedBy?.professionalProfile?.registerNumber && (
                        <span> ({med.prescribedBy.professionalProfile.registerNumber})</span>
                      )}
                    </span>
                  </div>
                </div>

                {permissions.canApprovePrescriptions && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        setSelectedPendingMed(med);
                        setApprovalStockQuantity("1");
                      }}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>Aprovar & Iniciar</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedRejectMed(med);
                        setRejectionNotes("");
                      }}
                      className="py-2 px-3 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      <span>Rejeitar</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer Médico Obrigatório (Seção 17 e Regra 5) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-slate-700 text-xs flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        <p>
          <strong>Importante:</strong> O PetRec é uma plataforma colaborativa de cuidados.
          Não substitui diagnóstico médico nem consulta veterinária presencial. Todo protocolo posológico
          deve ser validado com o médico veterinário registrado no CRMV.
        </p>
      </div>

      {/* Seção Prontuário Médico & Notas Clínicas Compartilhadas */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Prontuário Médico & Notas Clínicas Compartilhadas
              </h2>
              <p className="text-xs text-slate-500">
                Histórico de avaliações clínicas, evolução médica e orientações multiprofissionais.
              </p>
            </div>
          </div>
          {permissions.canAddClinicalNotes && (
            <button
              onClick={() => setShowNoteModal(true)}
              className="self-start sm:self-auto px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Nota</span>
            </button>
          )}
        </div>

        <div className="space-y-3">
          {clinicalNotes.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Nenhuma anotação registrada no prontuário até o momento.
            </p>
          ) : (
            clinicalNotes.map((note) => {
              const isPrivateVet = note.visibility === "PROFESSIONALS_ONLY";
              return (
                <div
                  key={note.id}
                  className={`p-3.5 rounded-xl border text-xs transition ${
                    isPrivateVet
                      ? "bg-purple-50/70 border-purple-200 text-purple-950"
                      : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0 overflow-hidden">
                        {note.author?.avatar ? (
                          <img
                            src={note.author.avatar}
                            alt={note.author.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          note.author?.name?.charAt(0) || "U"
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{note.author?.name}</span>
                          {note.author?.professionalProfile?.registerNumber && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded">
                              {note.author.professionalProfile.registerNumber}
                            </span>
                          )}
                          {note.author?.professionalProfile?.clinicName && (
                            <span className="text-[10px] text-slate-500">
                              • {note.author.professionalProfile.clinicName}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {format(new Date(note.createdAt), "dd 'de' MMMM 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </div>
                      </div>
                    </div>

                    {isPrivateVet ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200 text-purple-900 border border-purple-300">
                        <Lock className="w-3 h-3" />
                        <span>Confidencial Vet</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Pública (Tutores)</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed whitespace-pre-wrap pl-9">
                    {note.content}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Grid: Carteira de Vacinas & Agenda */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: Carteira de Vacinação */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Syringe className="w-5 h-5 text-amber-600" />
              <span>Carteira de Vacinas</span>
            </h2>
            <span className="text-xs text-slate-500">{data.vaccines.length} registrada(s)</span>
          </div>

          <div className="space-y-3">
            {data.vaccines.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">Nenhuma vacina registrada.</p>
            ) : (
              data.vaccines.map((v: any) => {
                const daysUntil = v.nextDueDate
                  ? differenceInCalendarDays(new Date(v.nextDueDate), new Date())
                  : null;
                const isUpcoming = daysUntil !== null && daysUntil >= 0 && daysUntil <= 30;
                const isOverdue = daysUntil !== null && daysUntil < 0;

                return (
                  <div
                    key={v.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-bold text-slate-900 text-sm">{v.name}</div>
                      {isOverdue && (
                        <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Atrasada há {Math.abs(daysUntil)} dias
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Vence em {daysUntil} dias
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 text-xs text-slate-600 gap-2">
                      <div>
                        <span className="text-slate-400 text-[11px] block">Aplicação:</span>
                        {format(new Date(v.applicationDate), "dd/MM/yyyy")}
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">Próximo Reforço:</span>
                        {v.nextDueDate ? format(new Date(v.nextDueDate), "dd/MM/yyyy") : "Não informado"}
                      </div>
                    </div>

                    {v.veterinarian && (
                      <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                        Aplicado por: {v.veterinarian}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Coluna 2: Próximos Compromissos & Agenda */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              <span>Agenda Veterinária & Compromissos</span>
            </h2>
            <span className="text-xs text-slate-500">{data.appointments.length} evento(s)</span>
          </div>

          <div className="space-y-3">
            {data.appointments.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">Nenhum compromisso agendado.</p>
            ) : (
              data.appointments.map((a: any) => (
                <div
                  key={a.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{a.title}</div>
                      <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                        {a.type}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-900">
                        {format(new Date(a.date), "dd/MM/yyyy")}
                      </div>
                      {a.time && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          <span>{a.time}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {a.location && (
                    <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{a.location}</span>
                    </div>
                  )}

                  {a.veterinarian && (
                    <div className="text-[11px] text-slate-500">
                      Profissional: {a.veterinarian}
                    </div>
                  )}

                  {a.notes && (
                    <p className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-100">
                      {a.notes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Seção 3: Histórico de Peso (Evolução) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">Evolução do Peso Corporal</h2>
          </div>
          <span className="text-xs text-slate-500">
            Última pesagem:{" "}
            <strong>
              {data.weightHistory.length > 0
                ? `${data.weightHistory[data.weightHistory.length - 1].weight} kg`
                : "Sem registros"}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.weightHistory.map((rec: any) => (
            <div
              key={rec.id}
              className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-1"
            >
              <div className="text-xl font-black text-slate-900">{rec.weight} kg</div>
              <div className="text-[11px] text-slate-500 font-medium">
                {format(new Date(rec.date), "dd/MM/yyyy")}
              </div>
              {rec.user && (
                <div className="text-[10px] text-slate-400">Por {rec.user.name.split(" ")[0]}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* MODAL: Aprovar Prescrição & Iniciar Estoque */}
      {selectedPendingMed && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-700 font-black text-lg">
                <FileCheck className="w-6 h-6" />
                <span>Aprovar Prescrição Médica</span>
              </div>
              <button
                onClick={() => setSelectedPendingMed(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1 text-xs">
              <div className="text-slate-900 font-bold text-sm">{selectedPendingMed.name}</div>
              <div className="text-slate-600">
                <strong>Posologia:</strong> {selectedPendingMed.dosage || "1 dose"} ({selectedPendingMed.presentation || "medicamento"})
              </div>
              {selectedPendingMed.instructions && (
                <div className="text-slate-500 italic">
                  &ldquo;{selectedPendingMed.instructions}&rdquo;
                </div>
              )}
              <div className="text-[11px] text-indigo-700 font-semibold pt-1">
                Prescrito por: {selectedPendingMed.prescribedBy?.name || selectedPendingMed.veterinarian}
              </div>
            </div>

            <form onSubmit={handleApprovePrescription} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Quantidade Adquirida Inicial (para iniciar o controle de estoque)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={approvalStockQuantity}
                    onChange={(e) => setApprovalStockQuantity(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Ex: 1, 10, 30"
                  />
                  <span className="text-xs text-slate-500 font-semibold uppercase">
                    {selectedPendingMed.unit || "unidades"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  O PetRec passará a calcular o consumo diário e preverá automaticamente a data da próxima compra.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedPendingMed(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
                >
                  Confirmar e Ativar Tratamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Rejeitar Prescrição */}
      {selectedRejectMed && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h3 className="text-base font-black text-rose-600">Rejeitar Prescrição</h3>
            <p className="text-xs text-slate-600">
              Deseja recusar a sugestão de <strong>{selectedRejectMed.name}</strong>?
            </p>
            <form onSubmit={handleRejectPrescription} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Motivo (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Animal já possui medicamento similar"
                  value={rejectionNotes}
                  onChange={(e) => setRejectionNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedRejectMed(null)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
                >
                  Confirmar Rejeição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Nova Prescrição Médica (Veterinário ou Tutor) */}
      {showPrescribeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-700 font-black text-lg">
                <Stethoscope className="w-6 h-6" />
                <span>Nova Prescrição Veterinária</span>
              </div>
              <button
                onClick={() => setShowPrescribeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePrescription} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome do Medicamento / Produto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Simparic 20mg, Amoxicilina 250mg, Shampoo Clorexiderm"
                  value={prescName}
                  onChange={(e) => setPrescName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Princípio Ativo
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Sarolaner, Clorexidina"
                    value={prescActiveIng}
                    onChange={(e) => setPrescActiveIng(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Apresentação
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Comprimido, Frasco, Gotas"
                    value={prescPresentation}
                    onChange={(e) => setPrescPresentation(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Dosagem / Posologia
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 1 comprimido, 1 banho"
                    value={prescDosage}
                    onChange={(e) => setPrescDosage(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Unidade de Estoque
                  </label>
                  <select
                    value={prescUnit}
                    onChange={(e) => setPrescUnit(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="comprimidos">comprimidos</option>
                    <option value="ml">ml</option>
                    <option value="gotas">gotas</option>
                    <option value="banhos">banhos</option>
                    <option value="unidades">unidades</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Frequência
                  </label>
                  <select
                    value={prescFrequency}
                    onChange={(e) => setPrescFrequency(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="daily">1x ao dia (24h)</option>
                    <option value="every_12h">2x ao dia (12h/12h)</option>
                    <option value="every_8h">3x ao dia (8h/8h)</option>
                    <option value="every_4_days">A cada 4 dias</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Horários
                  </label>
                  <input
                    type="text"
                    placeholder="08:00, 20:00"
                    value={prescTimes}
                    onChange={(e) => setPrescTimes(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Duração (dias)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Contínuo ou 7"
                    value={prescDurationDays}
                    onChange={(e) => setPrescDurationDays(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Instruções Posológicas de Uso
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Administrar com alimento. Não interromper sem orientar o veterinário."
                  value={prescInstructions}
                  onChange={(e) => setPrescInstructions(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Justificativa / Nota no Prontuário
                </label>
                <input
                  type="text"
                  placeholder="Ex: Prescrito após citologia auricular e retorno clínico"
                  value={prescNotes}
                  onChange={(e) => setPrescNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPrescribeModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs"
                >
                  Emitir Prescrição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Nova Nota Clínica no Prontuário */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-purple-700 font-black text-lg">
                <FileText className="w-6 h-6" />
                <span>Nova Nota no Prontuário</span>
              </div>
              <button
                onClick={() => setShowNoteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddClinicalNote} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Conteúdo da Anotação Clínica *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Registre a evolução do animal, orientações médicas, conduta clínica ou relatório de cuidado..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nível de Visibilidade
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                    <input
                      type="radio"
                      name="noteVisibility"
                      checked={noteVisibility === "ALL_TUTORS"}
                      onChange={() => setNoteVisibility("ALL_TUTORS")}
                      className="mt-0.5 text-purple-600"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-900 block">
                        Pública (Tutores & Cuidadores)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Visível para todos os membros associados ao pet.
                      </span>
                    </div>
                  </label>

                  {userCanViewPrivateVetNotes && (
                    <label className="flex items-start gap-2.5 p-2 rounded-xl border border-purple-200 bg-purple-50/50 cursor-pointer hover:bg-purple-100/50 transition">
                      <input
                        type="radio"
                        name="noteVisibility"
                        checked={noteVisibility === "PROFESSIONALS_ONLY"}
                        onChange={() => setNoteVisibility("PROFESSIONALS_ONLY")}
                        className="mt-0.5 text-purple-600"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-purple-900 flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          <span>🔒 Confidencial Vet (Somente Profissionais)</span>
                        </span>
                        <span className="text-[11px] text-purple-700">
                          Anotação técnica inter-veterinária protegida contra visualização leiga.
                        </span>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs"
                >
                  Salvar no Prontuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar Peso */}
      {showWeightModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 mb-1">Registrar Peso</h3>
            <p className="text-xs text-slate-500 mb-4">Acompanhamento contínuo da saúde.</p>
            <form onSubmit={handleAddWeight} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Peso (kg)</label>
                <input
                  type="number"
                  step="0.05"
                  required
                  placeholder="Ex: 32.5"
                  value={weightValue}
                  onChange={(e) => setWeightValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Observações</label>
                <input
                  type="text"
                  placeholder="Ex: Pós-consulta, banho"
                  value={weightNotes}
                  onChange={(e) => setWeightNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWeightModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar Vacina */}
      {showVaccineModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 mb-1">Registrar Vacina</h3>
            <p className="text-xs text-slate-500 mb-4">Adicione o histórico ou reforço.</p>
            <form onSubmit={handleAddVaccine} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nome da Vacina</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Antirrábica, V10, Giardia"
                  value={vaccName}
                  onChange={(e) => setVaccName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Data Aplicação</label>
                  <input
                    type="date"
                    required
                    value={vaccDate}
                    onChange={(e) => setVaccDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Próximo Reforço</label>
                  <input
                    type="date"
                    value={vaccDueDate}
                    onChange={(e) => setVaccDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Veterinário / Clínica</label>
                <input
                  type="text"
                  placeholder="Ex: Dra. Camila Ramos"
                  value={vaccVet}
                  onChange={(e) => setVaccVet(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowVaccineModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                >
                  Salvar Vacina
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Agendar Consulta */}
      {showApptModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 mb-1">Agendar Compromisso</h3>
            <p className="text-xs text-slate-500 mb-4">Consulta, retorno, banho ou exame.</p>
            <form onSubmit={handleAddAppointment} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Título</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Consulta Dermatológica"
                  value={apptTitle}
                  onChange={(e) => setApptTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Tipo</label>
                  <select
                    value={apptType}
                    onChange={(e) => setApptType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="consulta">Consulta</option>
                    <option value="retorno">Retorno</option>
                    <option value="exame">Exame</option>
                    <option value="banho">Banho / Tosa</option>
                    <option value="cirurgia">Cirurgia</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={apptDate}
                    onChange={(e) => setApptDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Horário</label>
                  <input
                    type="time"
                    value={apptTime}
                    onChange={(e) => setApptTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Veterinário</label>
                  <input
                    type="text"
                    placeholder="Ex: Dra. Camila"
                    value={apptVet}
                    onChange={(e) => setApptVet(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Local / Clínica</label>
                <input
                  type="text"
                  placeholder="Ex: Clínica Morumbi"
                  value={apptLocation}
                  onChange={(e) => setApptLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApptModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                >
                  Agendar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
