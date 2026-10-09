import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByPet = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();

    return await Promise.all(
      items.map(async (item) => {
        const txs = await ctx.db
          .query("inventoryTransactions")
          .withIndex("by_item", (q) => q.eq("inventoryItemId", item._id))
          .order("desc")
          .take(5);

        const txsWithUsers = await Promise.all(
          txs.map(async (tx) => {
            const user = tx.userId ? await ctx.db.get(tx.userId) : null;
            return {
              ...tx,
              user,
            };
          })
        );

        return {
          ...item,
          transactions: txsWithUsers,
        };
      })
    );
  },
});

export const createItem = mutation({
  args: {
    petId: v.id("pets"),
    name: v.string(),
    category: v.string(), // "racao", "medicamento", "petisco", "higiene", "outro"
    unit: v.string(), // "g", "kg", "unidades", "comprimidos", "ml"
    currentQuantity: v.number(),
    dailyConsumption: v.number(),
    purchaseLeadTimeDays: v.number(),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const itemId = await ctx.db.insert("inventoryItems", {
      petId: args.petId,
      name: args.name,
      category: args.category,
      unit: args.unit,
      currentQuantity: args.currentQuantity,
      dailyConsumption: args.dailyConsumption,
      purchaseLeadTimeDays: args.purchaseLeadTimeDays,
      referenceDate: now,
      status: args.currentQuantity > 0 ? "OK" : "SEM ESTOQUE",
      notes: args.notes,
    });

    if (args.currentQuantity > 0) {
      await ctx.db.insert("inventoryTransactions", {
        inventoryItemId: itemId,
        type: "adjustment",
        quantity: args.currentQuantity,
        date: now,
        userId: args.userId,
        notes: "Estoque inicial cadastrado",
      });
    }

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: args.petId,
        userId: args.userId,
        action: `adicionou o item ${args.name} ao estoque`,
        entityType: "inventory",
        entityId: itemId,
      });
    }

    return itemId;
  },
});

export const updateParams = mutation({
  args: {
    id: v.id("inventoryItems"),
    dailyConsumption: v.optional(v.number()),
    purchaseLeadTimeDays: v.optional(v.number()),
    currentQuantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    status: v.optional(v.string()),
    estimatedEndDate: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Item de estoque não encontrado");

    const patch: any = {};
    if (args.dailyConsumption !== undefined) patch.dailyConsumption = args.dailyConsumption;
    if (args.purchaseLeadTimeDays !== undefined) patch.purchaseLeadTimeDays = args.purchaseLeadTimeDays;
    if (args.currentQuantity !== undefined) patch.currentQuantity = args.currentQuantity;
    if (args.unit !== undefined) patch.unit = args.unit;
    if (args.status !== undefined) patch.status = args.status;
    if (args.estimatedEndDate !== undefined) patch.estimatedEndDate = args.estimatedEndDate;

    await ctx.db.patch(args.id, patch);

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: existing.petId,
        userId: args.userId,
        action: `alterou parâmetros de estoque de ${existing.name}`,
        entityType: "inventory",
        entityId: args.id,
      });
    }

    return await ctx.db.get(args.id);
  },
});

export const recordTransaction = mutation({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    type: v.string(), // "consumption", "purchase", "adjustment", "loss", "expiration"
    quantity: v.number(),
    unitPrice: v.optional(v.number()),
    totalPrice: v.optional(v.number()),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    status: v.optional(v.string()),
    estimatedEndDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.inventoryItemId);
    if (!item) throw new Error("Item de estoque não encontrado");

    let delta = Number(args.quantity);
    let newQuantity = item.currentQuantity;

    if (args.type === "purchase") {
      newQuantity += Math.abs(delta);
    } else if (args.type === "consumption" || args.type === "loss" || args.type === "expiration") {
      newQuantity = Math.max(0, newQuantity - Math.abs(delta));
      delta = -Math.abs(delta);
    } else if (args.type === "adjustment") {
      newQuantity = Math.max(0, delta);
      delta = newQuantity - item.currentQuantity;
    }

    const txId = await ctx.db.insert("inventoryTransactions", {
      inventoryItemId: args.inventoryItemId,
      type: args.type,
      quantity: delta,
      unitPrice: args.unitPrice,
      totalPrice: args.totalPrice,
      date: new Date().toISOString(),
      userId: args.userId,
      notes: args.notes,
    });

    const patch: any = { currentQuantity: newQuantity };
    if (args.status) patch.status = args.status;
    if (args.estimatedEndDate) patch.estimatedEndDate = args.estimatedEndDate;

    await ctx.db.patch(args.inventoryItemId, patch);

    if (args.userId) {
      let actionText = `atualizou estoque de ${item.name} para ${newQuantity} ${item.unit}`;
      if (args.type === "consumption") {
        actionText = `registrou consumo de ${Math.abs(delta)} ${item.unit} de ${item.name}`;
      } else if (args.type === "purchase") {
        actionText = `registrou entrada de ${Math.abs(delta)} ${item.unit} de ${item.name}`;
      }

      await ctx.db.insert("activityLogs", {
        petId: item.petId,
        userId: args.userId,
        action: actionText,
        entityType: "inventory",
        entityId: item._id,
        metadata: JSON.stringify({
          oldQuantity: item.currentQuantity,
          newQuantity,
          type: args.type,
        }),
      });
    }

    return {
      transactionId: txId,
      item: await ctx.db.get(args.inventoryItemId),
    };
  },
});

export const recordPurchaseFull = mutation({
  args: {
    petId: v.id("pets"),
    userId: v.id("users"),
    supplier: v.optional(v.string()),
    total: v.number(),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        inventoryItemId: v.id("inventoryItems"),
        quantity: v.number(),
        unitPrice: v.number(),
        status: v.optional(v.string()),
        estimatedEndDate: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // 1. Criar compra
    const purchaseId = await ctx.db.insert("purchases", {
      petId: args.petId,
      userId: args.userId,
      supplier: args.supplier || "Loja Pet",
      total: args.total,
      notes: args.notes,
      date: now,
    });

    // 2. Registrar cada item
    for (const it of args.items) {
      const invItem = await ctx.db.get(it.inventoryItemId);
      if (!invItem) continue;

      const itemTotal = it.quantity * it.unitPrice;

      await ctx.db.insert("purchaseItems", {
        purchaseId,
        inventoryItemId: it.inventoryItemId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: itemTotal,
      });

      await ctx.db.insert("inventoryTransactions", {
        inventoryItemId: it.inventoryItemId,
        type: "purchase",
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        totalPrice: itemTotal,
        date: now,
        userId: args.userId,
        notes: `Compra realizada via fornecedor: ${args.supplier || "Loja"}`,
      });

      const newQty = invItem.currentQuantity + it.quantity;
      const patch: any = { currentQuantity: newQty };
      if (it.status) patch.status = it.status;
      if (it.estimatedEndDate) patch.estimatedEndDate = it.estimatedEndDate;

      await ctx.db.patch(it.inventoryItemId, patch);

      // Marca como comprado na lista de compras caso estivesse pendente
      const shoppingListItems = await ctx.db
        .query("shoppingListItems")
        .withIndex("by_pet", (q) => q.eq("petId", args.petId))
        .collect();

      for (const s of shoppingListItems) {
        if (s.inventoryItemId === it.inventoryItemId && !s.isPurchased) {
          await ctx.db.patch(s._id, {
            isPurchased: true,
            purchasedAt: now,
            purchasedByUserId: args.userId,
          });
        }
      }
    }

    // 3. Log de auditoria
    await ctx.db.insert("activityLogs", {
      petId: args.petId,
      userId: args.userId,
      action: `registrou compra de R$ ${args.total.toFixed(2).replace(".", ",")} (${args.supplier || "Loja"})`,
      entityType: "purchase",
      entityId: purchaseId,
    });

    return purchaseId;
  },
});

export const listPurchases = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const purchases = await ctx.db
      .query("purchases")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .order("desc")
      .collect();

    return await Promise.all(
      purchases.map(async (pur) => {
        const user = pur.userId ? await ctx.db.get(pur.userId) : null;
        const items = await ctx.db
          .query("purchaseItems")
          .withIndex("by_purchase", (q) => q.eq("purchaseId", pur._id))
          .collect();

        const itemsWithDetails = await Promise.all(
          items.map(async (it) => {
            const inventoryItem = await ctx.db.get(it.inventoryItemId);
            return {
              ...it,
              inventoryItem,
            };
          })
        );

        return {
          ...pur,
          id: pur._id,
          user,
          items: itemsWithDetails,
        };
      })
    );
  },
});

export const listShoppingList = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .order("desc")
      .collect();

    return await Promise.all(
      items.map(async (item) => {
        const inventoryItem = item.inventoryItemId ? await ctx.db.get(item.inventoryItemId) : null;
        const purchasedBy = item.purchasedByUserId ? await ctx.db.get(item.purchasedByUserId) : null;
        return {
          ...item,
          id: item._id,
          inventoryItem,
          purchasedBy,
        };
      })
    );
  },
});

export const addShoppingItem = mutation({
  args: {
    petId: v.id("pets"),
    inventoryItemId: v.optional(v.id("inventoryItems")),
    customName: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const itemId = await ctx.db.insert("shoppingListItems", {
      petId: args.petId,
      inventoryItemId: args.inventoryItemId,
      customName: args.customName,
      quantity: args.quantity,
      unit: args.unit,
      isPurchased: false,
    });

    if (args.userId) {
      let itemName = args.customName || "Item";
      if (args.inventoryItemId) {
        const inv = await ctx.db.get(args.inventoryItemId);
        if (inv) itemName = inv.name;
      }
      await ctx.db.insert("activityLogs", {
        petId: args.petId,
        userId: args.userId,
        action: `adicionou "${itemName}" à lista de compras`,
        entityType: "shopping_list",
        entityId: itemId,
      });
    }

    return itemId;
  },
});

export const toggleShoppingItem = mutation({
  args: {
    id: v.id("shoppingListItems"),
    isPurchased: v.boolean(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Item da lista de compras não encontrado");

    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      isPurchased: args.isPurchased,
      purchasedAt: args.isPurchased ? now : undefined,
      purchasedByUserId: args.isPurchased ? args.userId : undefined,
    });

    if (args.userId) {
      let itemName = item.customName || "Item";
      if (item.inventoryItemId) {
        const inv = await ctx.db.get(item.inventoryItemId);
        if (inv) itemName = inv.name;
      }

      await ctx.db.insert("activityLogs", {
        petId: item.petId,
        userId: args.userId,
        action: args.isPurchased
          ? `marcou "${itemName}" como comprado`
          : `desmarcou "${itemName}" da lista de compras`,
        entityType: "shopping_list",
        entityId: item._id,
      });
    }

    return await ctx.db.get(args.id);
  },
});

export const listActivityLogs = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("activityLogs")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .order("desc")
      .take(15);
    return await Promise.all(
      logs.map(async (l) => {
        const user = l.userId ? await ctx.db.get(l.userId) : null;
        return {
          ...l,
          user,
        };
      })
    );
  },
});

export const recordConsumption = mutation({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    quantity: v.number(),
    userId: v.id("users"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.inventoryItemId);
    if (!item) throw new Error("Item de estoque não encontrado");

    const newQty = Math.max(0, item.currentQuantity - args.quantity);
    await ctx.db.patch(args.inventoryItemId, { currentQuantity: newQty });

    await ctx.db.insert("inventoryTransactions", {
      inventoryItemId: args.inventoryItemId,
      type: "consumption",
      quantity: -args.quantity,
      date: new Date().toISOString(),
      userId: args.userId,
      notes: args.notes || "Consumo registrado",
    });

    await ctx.db.insert("activityLogs", {
      petId: item.petId,
      userId: args.userId,
      action: `registrou consumo de ${args.quantity} ${item.unit} de ${item.name}`,
      entityType: "inventory",
      entityId: args.inventoryItemId,
    });
  },
});

export const recordPurchase = mutation({
  args: {
    petId: v.id("pets"),
    userId: v.id("users"),
    inventoryItemId: v.id("inventoryItems"),
    quantity: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.inventoryItemId);
    if (!item) throw new Error("Item de estoque não encontrado");

    const newQty = item.currentQuantity + args.quantity;
    await ctx.db.patch(args.inventoryItemId, { currentQuantity: newQty });

    await ctx.db.insert("inventoryTransactions", {
      inventoryItemId: args.inventoryItemId,
      type: "purchase",
      quantity: args.quantity,
      date: new Date().toISOString(),
      userId: args.userId,
      notes: args.notes || "Compra registrada",
    });

    await ctx.db.insert("activityLogs", {
      petId: args.petId,
      userId: args.userId,
      action: `registrou compra de ${args.quantity} ${item.unit} de ${item.name}`,
      entityType: "inventory",
      entityId: args.inventoryItemId,
    });
  },
});
