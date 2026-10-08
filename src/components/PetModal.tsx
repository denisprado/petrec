"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  X,
  PawPrint,
  Camera,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";


interface PetModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: "create" | "edit";
  initialData?: any;
  onSuccess?: (pet: any) => void;
}

const PHOTO_PRESETS = [
  {
    label: "Cão Dourado",
    url: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=500&auto=format&fit=crop&q=80",
  },
  {
    label: "Gato Siamês",
    url: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500&auto=format&fit=crop&q=80",
  },
  {
    label: "Bulldog",
    url: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=500&auto=format&fit=crop&q=80",
  },
  {
    label: "Gato Tigrado",
    url: "https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=500&auto=format&fit=crop&q=80",
  },
  {
    label: "Pássaro / Ave",
    url: "https://images.unsplash.com/photo-1522858547137-f1dcec554f55?w=500&auto=format&fit=crop&q=80",
  },
];

export function PetModal({
  isOpen,
  onClose,
  mode = "create",
  initialData,
  onSuccess,
}: PetModalProps) {
  const { currentUser, setActivePetId, triggerRefresh, permissions } = useApp();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [name, setName] = useState("");
  const [species, setSpecies] = useState("Cão");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState("Macho");
  const [birthDate, setBirthDate] = useState("");
  const [weight, setWeight] = useState("");
  const [photo, setPhoto] = useState("");
  const [color, setColor] = useState("");
  const [microchip, setMicrochip] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (initialData && mode === "edit") {
      setName(initialData.name || "");
      setSpecies(initialData.species || "Cão");
      setBreed(initialData.breed || "");
      setSex(initialData.sex || "Macho");
      setBirthDate(
        initialData.birthDate
          ? new Date(initialData.birthDate).toISOString().split("T")[0]
          : ""
      );
      setWeight(initialData.weight ? String(initialData.weight) : "");
      setPhoto(initialData.photo || "");
      setColor(initialData.color || "");
      setMicrochip(initialData.microchip || "");
      setNotes(initialData.notes || "");
    } else {
      setName("");
      setSpecies("Cão");
      setBreed("");
      setSex("Macho");
      setBirthDate("");
      setWeight("");
      setPhoto(PHOTO_PRESETS[0].url);
      setColor("");
      setMicrochip("");
      setNotes("");
    }
    setErrorMsg(null);
    setShowDeleteConfirm(false);
  }, [initialData, mode, isOpen]);

  if (!isOpen || !mounted) return null;

  const createPetMutation = useMutation(api.pets.create);
  const updatePetMutation = useMutation(api.pets.update);
  const removePetMutation = useMutation(api.pets.remove);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("O nome do animal é obrigatório.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      if (mode === "create") {
        const pet = await createPetMutation({
          name: name.trim(),
          species,
          breed: breed.trim() || undefined,
          sex: sex || undefined,
          birthDate: birthDate || undefined,
          weight: weight ? parseFloat(weight) : undefined,
          photo: photo || undefined,
          color: color.trim() || undefined,
          microchip: microchip.trim() || undefined,
          notes: notes.trim() || undefined,
          userEmail: currentUser?.email,
        });

        if (pet) {
          const newPetId = (pet as any)._id || (pet as any).id;
          setActivePetId(newPetId);
          triggerRefresh();
          onSuccess?.(pet);
          onClose();
        }
      } else {
        const targetPetId = (initialData?._id || initialData?.id) as Id<"pets">;
        const pet = await updatePetMutation({
          petId: targetPetId,
          name: name.trim(),
          species,
          breed: breed.trim() || undefined,
          sex: sex || undefined,
          birthDate: birthDate || undefined,
          weight: weight ? parseFloat(weight) : undefined,
          photo: photo || undefined,
          color: color.trim() || undefined,
          microchip: microchip.trim() || undefined,
          notes: notes.trim() || undefined,
        });

        triggerRefresh();
        onSuccess?.(pet);
        onClose();
      }
    } catch (err: any) {
      console.error("Erro ao salvar pet via Convex:", err);
      setErrorMsg(err.message || "Erro inesperado ao salvar pet.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const targetPetId = (initialData?._id || initialData?.id) as Id<"pets">;
    if (!targetPetId) return;
    setLoading(true);
    try {
      await removePetMutation({ petId: targetPetId });
      triggerRefresh();
      onClose();
    } catch (err: any) {
      console.error("Erro ao excluir pet via Convex:", err);
      setErrorMsg(err.message || "Erro ao excluir.");
    } finally {
      setLoading(false);
    }
  };


  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl my-8 animate-in fade-in zoom-in-95 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <PawPrint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 leading-tight">
                {mode === "create" ? "Cadastrar Novo Pet" : `Editar Dados de ${name || "Pet"}`}
              </h3>
              <p className="text-xs text-slate-500">
                {mode === "create"
                  ? "Adicione um novo animal ao seu painel compartilhado"
                  : "Atualize os dados cadastrais e perfil médico"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome e Espécie */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Nome do Pet *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Bidu, Mel, Pipoca"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Espécie *
              </label>
              <select
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="Cão">Cão (Canino)</option>
                <option value="Gato">Gato (Felino)</option>
                <option value="Ave">Ave / Pássaro</option>
                <option value="Roedor">Roedor (Coelho, Hamster)</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>

          {/* Raça, Sexo e Peso */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Raça
              </label>
              <input
                type="text"
                placeholder="Ex: Poodle, SRD"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Sexo
              </label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="Macho">Macho</option>
                <option value="Fêmea">Fêmea</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Peso Atual (kg)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="Ex: 8.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Data de Nascimento e Pelagem */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Data de Nascimento (aproximada)
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Cor / Pelagem
              </label>
              <input
                type="text"
                placeholder="Ex: Caramelo, Preto e Branco"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Foto (Presets ou URL personalizada) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Foto do Pet
            </label>
            <div className="flex items-center gap-3">
              <img
                src={
                  photo ||
                  "https://images.unsplash.com/photo-1552053831-71594a27632d?w=150"
                }
                alt="Preview"
                className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500 shadow-xs shrink-0"
              />
              <div className="flex-1 space-y-1.5">
                <input
                  type="url"
                  placeholder="Cole a URL da foto (ou escolha abaixo)"
                  value={photo}
                  onChange={(e) => setPhoto(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <div className="flex flex-wrap gap-1">
                  {PHOTO_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPhoto(p.url)}
                      className="text-[10px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-600 px-2 py-0.5 rounded-md font-medium transition"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Microchip */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Número do Microchip (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: 981098102938475"
              value={microchip}
              onChange={(e) => setMicrochip(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
            />
          </div>

          {/* Observações / Alergias */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Notas, Restrições & Alergias
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Alérgico a picada de pulga. Castrado. Não aceita ração com corante."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            {mode === "edit" && permissions.canDeletePet ? (
              <div>
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 p-1.5 hover:bg-rose-50 rounded-lg transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir Pet</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-rose-700 font-bold">Confirma?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={loading}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                    >
                      Sim, excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg"
                    >
                      Não
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition disabled:opacity-50"
              >
                {loading
                  ? "Salvando..."
                  : mode === "create"
                  ? "Cadastrar Pet"
                  : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
