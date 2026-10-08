import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByPet = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const meds = await ctx.db
      .query("medications")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();

    return await Promise.all(
      meds.map(async (med) => {
        const schedules = await ctx.db
          .query("medicationSchedules")
          .withIndex("by_medication", (q) => q.eq("medicationId", med._id))
          .collect();

        const inventoryItem = await ctx.db
          .query("inventoryItems")
          .withIndex("by_medication", (q) => q.eq("medicationId", med._id))
          .first();

        return {
          ...med,
          schedules,
          inventoryItem,
        };
      })
    );
  },
});

export const getAdministrationsToday = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const todayStr = new Date().toISOString().split("T")[0];

    const adms = await ctx.db
      .query("medicationAdministrations")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();

    // Filtra pelo dia de hoje
    const todayAdms = adms.filter((a) => a.scheduledAt.startsWith(todayStr));

    return await Promise.all(
      todayAdms.map(async (adm) => {
        const medication = await ctx.db.get(adm.medicationId);
        const administeredBy = adm.administeredByUserId
          ? await ctx.db.get(adm.administeredByUserId)
          : null;

        return {
          ...adm,
          medication,
          administeredBy,
        };
      })
    );
  },
});

export const create = mutation({
  args: {
    petId: v.id("pets"),
    userId: v.id("users"),
    name: v.string(),
    activeIngredient: v.optional(v.string()),
    presentation: v.optional(v.string()),
    dosage: v.optional(v.string()),
    unit: v.optional(v.string()),
    instructions: v.optional(v.string()),
    veterinarian: v.optional(v.string()),
    times: v.array(v.string()), // ["08:00", "20:00"]
    quantityPerAdministration: v.number(),
    initialStockQuantity: v.number(),
    purchaseLeadTimeDays: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const todayDateStr = now.toISOString().split("T")[0];

    // 1. Criar Medicamento
    const medId = await ctx.db.insert("medications", {
      petId: args.petId,
      name: args.name,
      activeIngredient: args.activeIngredient,
      presentation: args.presentation,
      dosage: args.dosage,
      unit: args.unit || "comprimidos",
      instructions: args.instructions,
      veterinarian: args.veterinarian,
      startDate: now.toISOString(),
      status: "active",
      prescribedById: args.userId,
      approvedById: args.userId,
      approvedAt: Date.now(),
      notes: args.notes,
    });

    // 2. Criar Cronograma Posológico
    await ctx.db.insert("medicationSchedules", {
      medicationId: medId,
      quantityPerAdministration: args.quantityPerAdministration,
      administrationsPerDay: args.times.length,
      frequency: args.times.length === 1 ? "daily" : args.times.length === 2 ? "every_12h" : "custom",
      times: args.times,
      startDate: now.toISOString(),
      active: true,
    });

    // 3. Criar Item de Estoque e Transação Inicial
    const dailyConsumption = args.quantityPerAdministration * args.times.length;
    const invId = await ctx.db.insert("inventoryItems", {
      petId: args.petId,
      medicationId: medId,
      name: `${args.name} (${args.initialStockQuantity} ${args.unit || "doses"})`,
      category: "medicamento",
      unit: args.unit || "comprimidos",
      currentQuantity: args.initialStockQuantity,
      dailyConsumption,
      purchaseLeadTimeDays: args.purchaseLeadTimeDays,
      referenceDate: now.toISOString(),
      status: args.initialStockQuantity > 5 ? "OK" : "ATENÇÃO",
    });

    if (args.initialStockQuantity > 0) {
      await ctx.db.insert("inventoryTransactions", {
        inventoryItemId: invId,
        type: "purchase",
        quantity: args.initialStockQuantity,
        date: now.toISOString(),
        userId: args.userId,
        notes: "Estoque inicial cadastrado",
      });
    }

    // 4. Gerar administrações para o dia de hoje
    for (const timeStr of args.times) {
      const scheduledIso = `${todayDateStr}T${timeStr}:00.000Z`;
      await ctx.db.insert("medicationAdministrations", {
        medicationId: medId,
        petId: args.petId,
        scheduledAt: scheduledIso,
        quantity: args.quantityPerAdministration,
        status: "scheduled",
      });
    }

    // 5. Activity Log
    await ctx.db.insert("activityLogs", {
      petId: args.petId,
      userId: args.userId,
      action: `cadastrou o medicamento ${args.name}`,
      entityType: "medication",
      entityId: medId,
    });

    return medId;
  },
});

export const update = mutation({
  args: {
    medicationId: v.id("medications"),
    userId: v.id("users"),
    name: v.string(),
    activeIngredient: v.optional(v.string()),
    presentation: v.optional(v.string()),
    dosage: v.optional(v.string()),
    unit: v.optional(v.string()),
    instructions: v.optional(v.string()),
    veterinarian: v.optional(v.string()),
    times: v.array(v.string()),
    quantityPerAdministration: v.number(),
    currentQuantity: v.number(),
    purchaseLeadTimeDays: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Atualizar medicamento
    await ctx.db.patch(args.medicationId, {
      name: args.name,
      activeIngredient: args.activeIngredient,
      presentation: args.presentation,
      dosage: args.dosage,
      unit: args.unit,
      instructions: args.instructions,
      veterinarian: args.veterinarian,
      notes: args.notes,
    });

    // 2. Atualizar cronograma
    const schedule = await ctx.db
      .query("medicationSchedules")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .first();

    if (schedule) {
      await ctx.db.patch(schedule._id, {
        quantityPerAdministration: args.quantityPerAdministration,
        administrationsPerDay: args.times.length,
        times: args.times,
      });
    }

    // 3. Atualizar estoque
    const inv = await ctx.db
      .query("inventoryItems")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .first();

    if (inv) {
      const dailyConsumption = args.quantityPerAdministration * args.times.length;
      await ctx.db.patch(inv._id, {
        name: `${args.name} (${args.currentQuantity} ${args.unit || inv.unit})`,
        unit: args.unit || inv.unit,
        currentQuantity: args.currentQuantity,
        dailyConsumption,
        purchaseLeadTimeDays: args.purchaseLeadTimeDays,
      });
    }
  },
});

export const remove = mutation({
  args: {
    medicationId: v.id("medications"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const med = await ctx.db.get(args.medicationId);
    if (!med) return;

    // Remover cronogramas
    const schedules = await ctx.db
      .query("medicationSchedules")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .collect();
    for (const s of schedules) await ctx.db.delete(s._id);

    // Remover estoque vinculado
    const inv = await ctx.db
      .query("inventoryItems")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .first();
    if (inv) {
      const txs = await ctx.db
        .query("inventoryTransactions")
        .withIndex("by_item", (q) => q.eq("inventoryItemId", inv._id))
        .collect();
      for (const t of txs) await ctx.db.delete(t._id);
      await ctx.db.delete(inv._id);
    }

    // Remover medicamento
    await ctx.db.delete(args.medicationId);

    // Activity log
    await ctx.db.insert("activityLogs", {
      petId: med.petId,
      userId: args.userId,
      action: `excluiu o medicamento ${med.name}`,
      entityType: "medication",
    });
  },
});

export const administer = mutation({
  args: {
    administrationId: v.id("medicationAdministrations"),
    userId: v.id("users"),
    status: v.string(), // "administered", "skipped", "missed"
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const adm = await ctx.db.get(args.administrationId);
    if (!adm) throw new Error("Administração não encontrada");

    const now = new Date();

    // 1. Atualizar registro
    await ctx.db.patch(args.administrationId, {
      status: args.status,
      administeredAt: args.status === "administered" ? now.toISOString() : undefined,
      administeredByUserId: args.status === "administered" ? args.userId : undefined,
      notes: args.notes,
    });

    // 2. Se administrado, debitar do estoque
    if (args.status === "administered") {
      const inv = await ctx.db
        .query("inventoryItems")
        .withIndex("by_medication", (q) => q.eq("medicationId", adm.medicationId))
        .first();

      if (inv) {
        const newQty = Math.max(0, inv.currentQuantity - adm.quantity);
        await ctx.db.patch(inv._id, { currentQuantity: newQty });

        await ctx.db.insert("inventoryTransactions", {
          inventoryItemId: inv._id,
          type: "consumption",
          quantity: -adm.quantity,
          date: now.toISOString(),
          userId: args.userId,
          notes: "Dose administrada",
        });
      }
    }
  },
});
