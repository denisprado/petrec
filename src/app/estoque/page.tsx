"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { StockForecastBadge } from "@/components/StockForecastBadge";
import {
  Boxes,
  Plus,
  Minus,
  RotateCcw,
  AlertTriangle,
  History,
  TrendingDown,
  ShoppingBag,
  Sliders,
  CheckCircle2,
  Calendar,
  Edit2,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function EstoquePage() {
  const { activePetId, setActivePetId, pets, currentUser, refreshTrigger, triggerRefresh, permissions } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Form de Transação
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [transactionType, setTransactionType] = useState<"consumption" | "purchase" | "adjustment">("consumption");
  const [transQuantity, setTransQuantity] = useState<string>("");
  const [transNotes, setTransNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modal de edição de parâmetros (consumo diário e lead time)
  const [editParamItem, setEditParamItem] = useState<any | null>(null);
  const [newDailyConsumption, setNewDailyConsumption] = useState<string>("");
  const [newLeadTime, setNewLeadTime] = useState<string>("");

  // Modal de cadastro de novo item de estoque (ex: ração)
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("racao");
  const [newItemUnit, setNewItemUnit] = useState("g");
  const [newItemCurrentQty, setNewItemCurrentQty] = useState("");
  const [newItemDailyConsumption, setNewItemDailyConsumption] = useState("");
  const [newItemLeadTime, setNewItemLeadTime] = useState("7");
  const [newItemNotes, setNewItemNotes] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function fetchInventory() {
      const petIdToFetch = activePetId || pets[0]?.id;
      if (!petIdToFetch) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/inventory?petId=${petIdToFetch}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setItems(data.items || []);
            if (!activePetId && petIdToFetch) {
              setActivePetId(petIdToFetch);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar estoque:", err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchInventory();

    return () => {
      isCancelled = true;
    };
  }, [activePetId, pets, refreshTrigger]);

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !transQuantity) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: selectedItem.id,
          type: transactionType,
          quantity: parseFloat(transQuantity),
          notes: transNotes,
          userId: currentUser.id,
          petId: activePetId,
        }),
      });

      if (res.ok) {
        setFeedback("Transação registrada e previsão recalculada com sucesso!");
        setTimeout(() => setFeedback(null), 3500);
        setSelectedItem(null);
        setTransQuantity("");
        setTransNotes("");
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleParamsUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editParamItem) return;

    try {
      const res = await fetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editParamItem.id,
          dailyConsumption: parseFloat(newDailyConsumption),
          purchaseLeadTimeDays: parseInt(newLeadTime),
          userId: currentUser.id,
        }),
      });

      if (res.ok) {
        setFeedback("Parâmetros de consumo e compra atualizados com sucesso!");
        setTimeout(() => setFeedback(null), 3500);
        setEditParamItem(null);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !activePetId) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isNewItem: true,
          petId: activePetId,
          name: newItemName,
          category: newItemCategory,
          unit: newItemUnit,
          currentQuantity: parseFloat(newItemCurrentQty || "0"),
          dailyConsumption: parseFloat(newItemDailyConsumption || "0"),
          purchaseLeadTimeDays: parseInt(newItemLeadTime || "7"),
          notes: newItemNotes,
          userId: currentUser.id,
        }),
      });

      if (res.ok) {
        setFeedback(`✓ "${newItemName}" adicionado ao estoque com sucesso!`);
        setTimeout(() => setFeedback(null), 3500);
        setShowNewItemModal(false);
        setNewItemName("");
        setNewItemCurrentQty("");
        setNewItemDailyConsumption("");
        setNewItemNotes("");
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
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

      {/* Header da Página */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6 text-emerald-600" />
            <span>Controle Inteligente de Estoque</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            O estoque e o consumo real determinam a data ideal de compra com antecedência configurada.
          </p>
        </div>

        <button
          onClick={() => setShowNewItemModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Item / Ração</span>
        </button>
      </div>

      {/* Regra de Ouro Explicativa Banner */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">
              Princípio Central: Previsão Contínua Baseada em Consumo Real
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              O sistema calcula: <code>Quantidade Disponível ÷ Consumo Diário = Dias Restantes</code>.
              A data ideal de compra é sempre <code>Término Estimado − Antecedência Mínima (Lead Time)</code>.
              Se a data ideal já passou, o status torna-se imediatamente <strong>COMPRAR AGORA</strong> com indicação de dias de atraso.
            </p>
          </div>
        </div>
      </div>

      {/* Lista de Itens de Estoque com Cards Ricos */}
      {loading ? (
        <div className="text-center py-10">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-2" />
          <p className="text-slate-500 text-sm">Carregando itens de estoque...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-600 font-semibold">Nenhum item cadastrado no estoque deste pet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const fc = item.forecast;
            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 flex flex-col justify-between hover:shadow-xs transition"
              >
                <div>
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {item.category}
                    </span>
                    <StockForecastBadge
                      status={fc.status}
                      overdueDays={fc.overdueDays}
                    />
                  </div>

                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {item.name}
                  </h3>

                  {/* Informações Numéricas de Estoque */}
                  <div className="mt-3 p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Estoque atual:</span>
                      <strong className="text-slate-900 text-sm font-black">
                        {item.currentQuantity} {item.unit}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Consumo diário:</span>
                      <span className="text-slate-700 font-semibold">
                        {item.dailyConsumption} {item.unit}/dia
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Duração estimada:</span>
                      <span className="text-slate-700 font-semibold">
                        ~{Math.round(fc.daysRemaining)} dias
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Antecedência (lead time):</span>
                      <span className="text-slate-700 font-semibold">
                        {item.purchaseLeadTimeDays} dias antes
                      </span>
                    </div>
                  </div>

                  {/* Previsão de Compra e Datas */}
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Término estimado:</span>
                      <strong className="text-slate-800">
                        {fc.estimatedEndDate
                          ? format(new Date(fc.estimatedEndDate), "dd/MM/yyyy")
                          : "Indeterminado"}
                      </strong>
                    </div>

                    <div className="flex justify-between text-slate-600">
                      <span>Comprar até:</span>
                      <strong
                        className={
                          fc.status === "COMPRAR AGORA" || fc.status === "SEM ESTOQUE"
                            ? "text-red-700 font-bold"
                            : "text-slate-800"
                        }
                      >
                        {fc.comprarAteLabel}
                      </strong>
                    </div>

                    {fc.isOverdue && (
                      <p className="text-[11px] text-red-600 font-bold mt-1">
                        ⚠ Prazo ideal ultrapassado há {fc.overdueDays} dia(s)!
                      </p>
                    )}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setSelectedItem(item);
                      setTransactionType("consumption");
                      setTransQuantity(String(item.dailyConsumption || 1));
                    }}
                    className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                    title="Registrar consumo real"
                  >
                    <Minus className="w-3.5 h-3.5" />
                    <span>Consumo</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedItem(item);
                      setTransactionType("purchase");
                      setTransQuantity("");
                    }}
                    className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                    title="Registrar entrada/compra"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Entrada</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditParamItem(item);
                      setNewDailyConsumption(String(item.dailyConsumption));
                      setNewLeadTime(String(item.purchaseLeadTimeDays));
                    }}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg transition"
                    title="Ajustar consumo diário e antecedência"
                  >
                    <Sliders className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Registro de Transação (Consumo, Compra, Ajuste) */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-black text-slate-900 mb-1">
              Registrar Movimentação de Estoque
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Item: <strong>{selectedItem.name}</strong> • Tutor:{" "}
              <strong>{currentUser.name}</strong>
            </p>

            <form onSubmit={handleTransactionSubmit} className="space-y-4">
              {/* Tipo de Transação */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Tipo da Transação
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTransactionType("consumption")}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      transactionType === "consumption"
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    Consumo
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionType("purchase")}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      transactionType === "purchase"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionType("adjustment")}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      transactionType === "adjustment"
                        ? "bg-amber-600 text-white border-amber-600"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    Ajuste Físico
                  </button>
                </div>
              </div>

              {/* Quantidade */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Quantidade ({selectedItem.unit})
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={transQuantity}
                  onChange={(e) => setTransQuantity(e.target.value)}
                  placeholder={`Ex: ${selectedItem.dailyConsumption || 10}`}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Observações / Motivo
                </label>
                <input
                  type="text"
                  value={transNotes}
                  onChange={(e) => setTransNotes(e.target.value)}
                  placeholder="Ex: Refeição da tarde, pacote novo, etc."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-xs"
                >
                  {isSubmitting ? "Gravando..." : "Salvar Transação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Ajuste de Parâmetros de Consumo e Lead Time */}
      {editParamItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 mb-1">
              Configurar Consumo & Antecedência
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Item: <strong>{editParamItem.name}</strong>
            </p>

            <form onSubmit={handleParamsUpdate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Consumo Diário Estimado ({editParamItem.unit}/dia)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={newDailyConsumption}
                  onChange={(e) => setNewDailyConsumption(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Altere quando a dose ou dieta do animal for reajustada.
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Antecedência para Comprar (Dias de Lead Time)
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={newLeadTime}
                  onChange={(e) => setNewLeadTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Quantos dias antes do término você quer receber o alerta para comprar.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditParamItem(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-xs"
                >
                  Recalcular Previsão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Cadastro de Novo Item / Ração */}
      {showNewItemModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-black text-slate-900 mb-1">
              Cadastrar Item no Estoque
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Adicione rações, medicamentos, suplementos ou petiscos com controle de duração e compra.
            </p>

            <form onSubmit={handleCreateItem} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome do Produto / Ração
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ração Golden Formula Frango 15kg"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Categoria
                  </label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="racao">Ração</option>
                    <option value="petisco">Petisco</option>
                    <option value="medicamento">Medicamento</option>
                    <option value="higiene">Higiene</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Unidade de Medida
                  </label>
                  <select
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="g">Gramas (g)</option>
                    <option value="kg">Quilos (kg)</option>
                    <option value="unidades">Unidades</option>
                    <option value="comprimidos">Comprimidos</option>
                    <option value="ml">Mililitros (ml)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Estoque Atual ({newItemUnit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Ex: 15000"
                    value={newItemCurrentQty}
                    onChange={(e) => setNewItemCurrentQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Consumo Diário ({newItemUnit}/dia)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Ex: 350"
                    value={newItemDailyConsumption}
                    onChange={(e) => setNewItemDailyConsumption(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Antecedência para Compra (Lead Time em dias)
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="Ex: 7"
                  value={newItemLeadTime}
                  onChange={(e) => setNewItemLeadTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Observações (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: sabor frango & arroz, embalagem fechada"
                  value={newItemNotes}
                  onChange={(e) => setNewItemNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewItemModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-xs"
                >
                  {isSubmitting ? "Cadastrando..." : "Cadastrar no Estoque"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
