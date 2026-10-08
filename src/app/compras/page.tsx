"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import {
  ShoppingCart,
  Plus,
  CheckCircle2,
  Calendar,
  Store,
  DollarSign,
  Receipt,
  UserCheck,
  Lock,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ComprasPage() {
  const { activePetId, currentUser, refreshTrigger, triggerRefresh, permissions } = useApp();
  const [shoppingItems, setShoppingItems] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal nova compra
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedInvItemId, setSelectedInvItemId] = useState("");
  const [purchaseQty, setPurchaseQty] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseSupplier, setPurchaseSupplier] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");

  // Modal novo item lista de compras
  const [showAddShoppingModal, setShowAddShoppingModal] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");

  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!activePetId) return;
      setLoading(true);
      try {
        const [shopRes, purRes, invRes] = await Promise.all([
          fetch(`/api/shopping-list?petId=${activePetId}`),
          fetch(`/api/purchases?petId=${activePetId}&userId=${currentUser.id}`),
          fetch(`/api/inventory?petId=${activePetId}`),
        ]);

        const shopJson = await shopRes.json();
        const purJson = await purRes.json();
        const invJson = await invRes.json();

        setShoppingItems(shopJson.items || []);
        setPurchases(purJson.purchases || []);
        setInventoryItems(invJson.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [activePetId, currentUser.id, refreshTrigger]);

  // Alternar status de comprado na lista compartilhada
  const togglePurchased = async (item: any) => {
    try {
      const res = await fetch("/api/shopping-list", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          isPurchased: !item.isPurchased,
          userId: currentUser.id,
        }),
      });

      if (res.ok) {
        setFeedback(
          !item.isPurchased
            ? `✓ Marcado como comprado por ${currentUser.name.split(" ")[0]}!`
            : "Item recolocado como pendente."
        );
        setTimeout(() => setFeedback(null), 3500);
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Registrar compra formal (que atualiza estoque, cria transação e zera lista)
  const handleRegisterPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvItemId || !purchaseQty) return;

    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: activePetId,
          userId: currentUser.id,
          supplier: purchaseSupplier,
          notes: purchaseNotes,
          items: [
            {
              inventoryItemId: selectedInvItemId,
              quantity: parseFloat(purchaseQty),
              unitPrice: purchasePrice ? parseFloat(purchasePrice) : 0,
            },
          ],
        }),
      });

      if (res.ok) {
        setFeedback("Compra registrada, estoque atualizado e previsão recalculada!");
        setTimeout(() => setFeedback(null), 4000);
        setShowPurchaseModal(false);
        setSelectedInvItemId("");
        setPurchaseQty("");
        setPurchasePrice("");
        setPurchaseSupplier("");
        setPurchaseNotes("");
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Adicionar item avulso na lista de compras
  const handleAddShoppingItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName) return;

    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: activePetId,
          customName: newItemName,
          quantity: newItemQty ? parseFloat(newItemQty) : null,
          unit: newItemUnit || null,
          userId: currentUser.id,
        }),
      });

      if (res.ok) {
        setFeedback(`✓ "${newItemName}" adicionado à lista compartilhada!`);
        setTimeout(() => setFeedback(null), 3500);
        setShowAddShoppingModal(false);
        setNewItemName("");
        setNewItemQty("");
        setNewItemUnit("");
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const pendingItems = shoppingItems.filter((i) => !i.isPurchased);
  const boughtItems = shoppingItems.filter((i) => i.isPurchased);

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-6">
      {/* Toast Feedback */}
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
            <ShoppingCart className="w-6 h-6 text-emerald-600" />
            <span>Lista de Compras & Histórico</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Lista compartilhada entre todos os tutores com auditoria de quem comprou.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddShoppingModal(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar à Lista</span>
          </button>
          {permissions.canRegisterPurchases && (
            <button
              onClick={() => setShowPurchaseModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <Receipt className="w-4 h-4" />
              <span>Registrar Compra Formal</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid: Lista Compartilhada vs Histórico de Compras */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: Lista de Compras Compartilhada */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Itens para Comprar (Compartilhado)</span>
              <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                {pendingItems.length} pendente(s)
              </span>
            </h2>
          </div>

          {/* Pendentes */}
          <div className="space-y-2.5">
            {pendingItems.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                Tudo comprado! Nenhum item pendente na lista.
              </p>
            ) : (
              pendingItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition flex items-center justify-between gap-3"
                >
                  <label className="flex items-center gap-3 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={item.isPurchased}
                      onChange={() => togglePurchased(item)}
                      className="w-5 h-5 rounded-md text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                    />
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {item.customName || item.inventoryItem?.name}
                      </div>
                      {item.quantity && (
                        <div className="text-xs text-slate-500">
                          Quantidade: {item.quantity} {item.unit || ""}
                        </div>
                      )}
                    </div>
                  </label>

                  <button
                    onClick={() => togglePurchased(item)}
                    className="px-2.5 py-1 bg-white hover:bg-emerald-50 border border-slate-200 text-emerald-700 text-xs font-semibold rounded-lg transition"
                  >
                    Marcar Comprado
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Itens Já Comprados com Auditoria de quem comprou */}
          {boughtItems.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Comprados Recentemente
              </h3>
              <div className="space-y-2">
                {boughtItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 bg-slate-50/60 rounded-xl border border-slate-100 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span className="line-through text-slate-500">
                        {item.customName || item.inventoryItem?.name}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 text-right">
                      Comprado por <strong>{item.purchasedBy?.name || "Tutor"}</strong> em{" "}
                      {item.purchasedAt
                        ? format(new Date(item.purchasedAt), "dd/MM/yyyy", { locale: ptBR })
                        : "Hoje"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Coluna 2: Histórico de Compras Realizadas */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Histórico de Compras Realizadas
            </h2>
            {permissions.canViewFinancials && (
              <span className="text-xs text-slate-500">{purchases.length} compra(s)</span>
            )}
          </div>

          {!permissions.canViewFinancials ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Privacidade Financeira Protegida</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Notas fiscais, custos e histórico de compras são confidenciais dos tutores e proprietários.
                Como profissional de saúde ou cuidador, suas permissões são direcionadas ao prontuário, receitas e rotinas de cuidado.
              </p>
            </div>
          ) : purchases.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              Nenhuma compra registrada ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {purchases.map((pur) => (
                <div
                  key={pur.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Store className="w-4 h-4 text-slate-500" />
                      <span>{pur.supplier || "Loja Pet"}</span>
                    </div>
                    <span className="font-black text-emerald-700 text-sm">
                      R$ {pur.total.toFixed(2).replace(".", ",")}
                    </span>
                  </div>

                  <div className="text-slate-500 flex items-center justify-between">
                    <span>
                      Data: {format(new Date(pur.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    <span>
                      Registrado por: <strong>{pur.user?.name || "Tutor"}</strong>
                    </span>
                  </div>

                  {pur.items && pur.items.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/60 text-slate-600">
                      {pur.items.map((it: any) => (
                        <div key={it.id} className="flex justify-between">
                          <span>
                            • {it.inventoryItem?.name} ({it.quantity} {it.inventoryItem?.unit})
                          </span>
                          <span>R$ {it.total.toFixed(2).replace(".", ",")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal Registrar Compra Formal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-black text-slate-900 mb-1">
              Registrar Compra Formal
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Irá abastecer o estoque automaticamente, registrar transação e recalcular a data ideal de compra.
            </p>

            <form onSubmit={handleRegisterPurchase} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Item de Estoque Comprado
                </label>
                <select
                  required
                  value={selectedInvItemId}
                  onChange={(e) => setSelectedInvItemId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">Selecione o produto...</option>
                  {inventoryItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} (Atual: {it.currentQuantity} {it.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Quantidade Adicionada
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Ex: 12000 (g) ou 30"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Preço Total (R$)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ex: 189.90"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Fornecedor / Pet Shop / Loja
                </label>
                <input
                  type="text"
                  placeholder="Ex: Cobasi, Petz, DrogaVet"
                  value={purchaseSupplier}
                  onChange={(e) => setPurchaseSupplier(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-xs"
                >
                  Confirmar Compra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar Item Avulso à Lista de Compras */}
      {showAddShoppingModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-black text-slate-900 mb-1">
              Adicionar à Lista de Compras
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Item compartilhado que aparecerá para todos os tutores deste pet.
            </p>

            <form onSubmit={handleAddShoppingItem} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome do Item
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Petisco dental, Tapete higiênico, etc."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Quantidade
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ex: 2"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Unidade
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: pacotes, un, kg"
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddShoppingModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-xs"
                >
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
