"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import {
  X,
  Pill,
  Clock,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Plus,
  PackageCheck,
  Calendar,
} from "lucide-react";

interface MedicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: "create" | "edit";
  initialData?: any;
  onSuccess?: (medication: any) => void;
}

const FREQUENCY_PRESETS = [
  { label: "1x ao dia (24/24h)", times: ["08:00"] },
  { label: "2x ao dia (12/12h)", times: ["08:00", "20:00"] },
  { label: "3x ao dia (8/8h)", times: ["08:00", "14:00", "20:00"] },
  { label: "4x ao dia (6/6h)", times: ["06:00", "12:00", "18:00", "00:00"] },
];

const PRESENTATION_OPTIONS = [
  "Comprimido",
  "Gotas / Solução oral",
  "Cápsula",
  "Xarope",
  "Pomada / Creme",
  "Injetável",
  "Spray / Tópico",
  "Outro",
];

const UNIT_OPTIONS = ["comprimidos", "ml", "gotas", "doses", "cápsulas", "unidades"];

export function MedicationModal({
  isOpen,
  onClose,
  mode = "create",
  initialData,
  onSuccess,
}: MedicationModalProps) {
  const { activePetId, currentUser, triggerRefresh, permissions } = useApp();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [name, setName] = useState("");
  const [activeIngredient, setActiveIngredient] = useState("");
  const [presentation, setPresentation] = useState("Comprimido");
  const [dosage, setDosage] = useState("");
  const [unit, setUnit] = useState("comprimidos");
  const [quantityPerAdmin, setQuantityPerAdmin] = useState("1");
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [customTimeInput, setCustomTimeInput] = useState("");
  const [stockQuantity, setStockQuantity] = useState("20");
  const [leadTimeDays, setLeadTimeDays] = useState("5");
  const [instructions, setInstructions] = useState("");
  const [veterinarian, setVeterinarian] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (initialData && mode === "edit") {
      setName(initialData.name || "");
      setActiveIngredient(initialData.activeIngredient || "");
      setPresentation(initialData.presentation || "Comprimido");
      setDosage(initialData.dosage || "");
      setUnit(initialData.unit || "comprimidos");
      setInstructions(initialData.instructions || "");
      setVeterinarian(initialData.veterinarian || "");
      setNotes(initialData.notes || "");

      // Schedule & times
      const schedule = initialData.schedules?.[0];
      if (schedule) {
        setQuantityPerAdmin(String(schedule.quantityPerAdministration || 1));
        try {
          const parsed = JSON.parse(schedule.times || '["08:00"]');
          setTimes(Array.isArray(parsed) && parsed.length > 0 ? parsed : ["08:00"]);
        } catch {
          setTimes(["08:00"]);
        }
      } else {
        setQuantityPerAdmin("1");
        setTimes(["08:00"]);
      }

      // Stock
      if (initialData.inventoryItem) {
        setStockQuantity(String(initialData.inventoryItem.currentQuantity ?? 0));
        setLeadTimeDays(String(initialData.inventoryItem.purchaseLeadTimeDays ?? 5));
      } else {
        setStockQuantity("0");
        setLeadTimeDays("5");
      }
    } else {
      setName("");
      setActiveIngredient("");
      setPresentation("Comprimido");
      setDosage("");
      setUnit("comprimidos");
      setQuantityPerAdmin("1");
      setTimes(["08:00"]);
      setStockQuantity("20");
      setLeadTimeDays("5");
      setInstructions("");
      setVeterinarian("");
      setNotes("");
    }
    setErrorMsg(null);
    setShowDeleteConfirm(false);
  }, [initialData, mode, isOpen]);

  if (!isOpen || !mounted) return null;

  const handleApplyPreset = (presetTimes: string[]) => {
    setTimes(presetTimes);
  };

  const handleAddTime = () => {
    if (!customTimeInput) return;
    if (!times.includes(customTimeInput)) {
      setTimes([...times, customTimeInput].sort());
    }
    setCustomTimeInput("");
  };

  const handleRemoveTime = (timeToRemove: string) => {
    if (times.length <= 1) {
      setErrorMsg("O medicamento deve ter pelo menos um horário programado.");
      return;
    }
    setTimes(times.filter((t) => t !== timeToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("O nome do medicamento é obrigatório.");
      return;
    }
    if (!activePetId) {
      setErrorMsg("Nenhum animal ativo selecionado.");
      return;
    }
    if (times.length === 0) {
      setErrorMsg("Informe ao menos um horário de administração.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      if (mode === "create") {
        const res = await fetch("/api/medications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            petId: activePetId,
            userId: currentUser.id,
            name: name.trim(),
            activeIngredient: activeIngredient.trim() || null,
            presentation,
            dosage: dosage.trim() || null,
            unit,
            quantityPerAdministration: parseFloat(quantityPerAdmin) || 1,
            times,
            initialStockQuantity: parseFloat(stockQuantity) || 0,
            purchaseLeadTimeDays: parseInt(leadTimeDays) || 5,
            instructions: instructions.trim() || null,
            veterinarian: veterinarian.trim() || null,
            notes: notes.trim() || null,
          }),
        });

        const data = await res.json();
        if (res.ok && data.medication) {
          triggerRefresh();
          onSuccess?.(data.medication);
          onClose();
        } else {
          setErrorMsg(data.error || "Erro ao cadastrar medicamento.");
        }
      } else {
        // Edit mode
        const res = await fetch("/api/medications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            medicationId: initialData?.id,
            userId: currentUser.id,
            name: name.trim(),
            activeIngredient: activeIngredient.trim() || null,
            presentation,
            dosage: dosage.trim() || null,
            unit,
            quantityPerAdministration: parseFloat(quantityPerAdmin) || 1,
            times,
            currentQuantity: parseFloat(stockQuantity) || 0,
            purchaseLeadTimeDays: parseInt(leadTimeDays) || 5,
            instructions: instructions.trim() || null,
            veterinarian: veterinarian.trim() || null,
            notes: notes.trim() || null,
          }),
        });

        const data = await res.json();
        if (res.ok && data.medication) {
          triggerRefresh();
          onSuccess?.(data.medication);
          onClose();
        } else {
          setErrorMsg(data.error || "Erro ao atualizar medicamento.");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData?.id) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/medications?medicationId=${initialData.id}&userId=${currentUser.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (res.ok) {
        triggerRefresh();
        onClose();
      } else {
        setErrorMsg(data.error || "Erro ao excluir medicamento.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro de conexão ao excluir.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header Modal */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-white backdrop-blur-xs">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                {mode === "create" ? "Cadastrar Novo Medicamento" : `Editar ${initialData?.name || "Medicamento"}`}
              </h2>
              <p className="text-xs text-emerald-100">
                Posologia, horários diários e controle inteligente de estoque
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-xs font-semibold text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Seção 1: Identificação do Medicamento */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Pill className="w-3.5 h-3.5 text-emerald-600" />
              <span>Identificação & Apresentação</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome do Medicamento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Apoquel, Prednisolona, Amoxicilina"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Princípio Ativo (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Oclacitinib, Prednisolona"
                  value={activeIngredient}
                  onChange={(e) => setActiveIngredient(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Forma Farmacêutica
                </label>
                <select
                  value={presentation}
                  onChange={(e) => setPresentation(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                >
                  {PRESENTATION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Dosagem / Concentração
                </label>
                <input
                  type="text"
                  placeholder="Ex: 5.4 mg, 20 mg/ml, 1 comprimido"
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                />
              </div>
            </div>
          </div>

          {/* Seção 2: Posologia & Horários */}
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Posologia & Horários Diários</span>
            </h3>

            {/* Presets de Frequência */}
            <div className="mb-3">
              <span className="block text-xs font-bold text-slate-600 mb-1.5">
                Atalhos de Frequência:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FREQUENCY_PRESETS.map((fp) => (
                  <button
                    key={fp.label}
                    type="button"
                    onClick={() => handleApplyPreset(fp.times)}
                    className={`px-2.5 py-2 text-xs font-bold rounded-xl border transition text-left cursor-pointer ${
                      JSON.stringify(times) === JSON.stringify(fp.times)
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {fp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Horários Selecionados */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Horários configurados:</span>
                {times.map((t) => (
                  <div
                    key={t}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold shadow-2xs"
                  >
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTime(t)}
                      className="text-slate-400 hover:text-rose-600 transition ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Adicionar horário personalizado */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="time"
                  value={customTimeInput}
                  onChange={(e) => setCustomTimeInput(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
                />
                <button
                  type="button"
                  onClick={handleAddTime}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Horário</span>
                </button>
              </div>
            </div>

            {/* Dose e Unidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantidade por Administração
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={quantityPerAdmin}
                  onChange={(e) => setQuantityPerAdmin(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Unidade de Medida
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Seção 3: Estoque & Previsão */}
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Estoque & Alerta de Recompra</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {mode === "create" ? "Estoque Inicial Disponível" : "Quantidade Atual em Estoque"} ({unit})
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Consumo estimado:{" "}
                  <strong>
                    {((parseFloat(quantityPerAdmin) || 1) * times.length).toFixed(1)} {unit}/dia
                  </strong>
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Antecedência para Alerta de Compra (Dias)
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="30"
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  O sistema avisará com antecedência para você repor a medicação.
                </span>
              </div>
            </div>
          </div>

          {/* Seção 4: Instruções & Veterinário */}
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Instruções & Prescrição</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Instruções de Uso
                </label>
                <input
                  type="text"
                  placeholder="Ex: Administrar com a ração da manhã, não partir o comprimido"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Veterinário Responsável (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Dra. Camila Santos (CRMV 9876)"
                  value={veterinarian}
                  onChange={(e) => setVeterinarian(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações Clínicas (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notas adicionais sobre o tratamento..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-emerald-600 focus:border-transparent transition resize-none"
                />
              </div>
            </div>
          </div>

          {/* Zona de Perigo: Exclusão no modo edição */}
          {mode === "edit" && permissions.canManageMedications && (
            <div className="pt-3 border-t border-slate-100">
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir este medicamento do cadastro</span>
                </button>
              ) : (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Tem certeza que deseja excluir &quot;{name}&quot;?</span>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-relaxed">
                    O cronograma posológico, administrações agendadas e o item de estoque vinculado serão removidos.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleDelete}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                    >
                      {loading ? "Excluindo..." : "Sim, excluir definitivamente"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{mode === "create" ? "Cadastrar Medicamento" : "Salvar Alterações"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
