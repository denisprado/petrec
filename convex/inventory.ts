import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByPet = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventoryItems")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
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
