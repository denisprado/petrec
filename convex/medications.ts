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

        const prescribedBy = med.prescribedById ? await ctx.db.get(med.prescribedById) : null;
        const approvedBy = med.approvedById ? await ctx.db.get(med.approvedById) : null;

        return {
          ...med,
          id: med._id,
          schedules: schedules.map((s) => ({ ...s, id: s._id })),
          inventoryItem: inventoryItem ? { ...inventoryItem, id: inventoryItem._id } : null,
          prescribedBy,
          approvedBy,
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

    const todayAdms = adms.filter((a) => a.scheduledAt.startsWith(todayStr));

    return await Promise.all(
      todayAdms.map(async (adm) => {
        const medication = await ctx.db.get(adm.medicationId);
        const administeredBy = adm.administeredByUserId
          ? await ctx.db.get(adm.administeredByUserId)
          : null;

        return {
          ...adm,
          id: adm._id,
          medication,
          administeredBy,
        };
      })
    );
  },
});

export const listPrescriptions = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("medications")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();

    const pending = all.filter((m) => m.status === "pending_tutor_approval");
    const history = all.filter((m) => m.status === "active" || m.status === "rejected");

    const hydrateList = async (list: typeof all) => {
      return await Promise.all(
        list.map(async (m) => {
          const prescribedBy = m.prescribedById ? await ctx.db.get(m.prescribedById) : null;
          const approvedBy = m.approvedById ? await ctx.db.get(m.approvedById) : null;
          const schedules = await ctx.db
            .query("medicationSchedules")
            .withIndex("by_medication", (q) => q.eq("medicationId", m._id))
            .collect();
          const inventoryItem = await ctx.db
            .query("inventoryItems")
            .withIndex("by_medication", (q) => q.eq("medicationId", m._id))
            .first();

          return {
            ...m,
            id: m._id,
            prescribedBy,
            approvedBy,
            schedules,
            inventoryItem,
          };
        })
      );
    };

    return {
      pending: await hydrateList(pending),
      history: await hydrateList(history),
    };
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
    status: v.optional(v.string()), // "active" | "pending_tutor_approval"
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const todayDateStr = now.toISOString().split("T")[0];
    const initialStatus = args.status || "active";

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
      status: initialStatus,
      prescribedById: args.userId,
      approvedById: initialStatus === "active" ? args.userId : undefined,
      approvedAt: initialStatus === "active" ? Date.now() : undefined,
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

    // 3. Se ativo, criar Item de Estoque e administrações
    if (initialStatus === "active") {
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

      // Gerar administrações para hoje
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
    }

    // 4. Activity Log
    await ctx.db.insert("activityLogs", {
      petId: args.petId,
      userId: args.userId,
      action: initialStatus === "active"
        ? `cadastrou o medicamento ${args.name}`
        : `prescreveu ${args.name} (aguarda aprovação)`,
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

    const schedules = await ctx.db
      .query("medicationSchedules")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .collect();
    for (const s of schedules) await ctx.db.delete(s._id);

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

    await ctx.db.delete(args.medicationId);

    await ctx.db.insert("activityLogs", {
      petId: med.petId,
      userId: args.userId,
      action: `excluiu o medicamento ${med.name}`,
      entityType: "medication",
    });
  },
});

export const approvePrescription = mutation({
  args: {
    medicationId: v.id("medications"),
    userId: v.id("users"),
    initialStockQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    const med = await ctx.db.get(args.medicationId);
    if (!med) throw new Error("Medicamento não encontrado");

    const now = new Date();
    await ctx.db.patch(args.medicationId, {
      status: "active",
      approvedById: args.userId,
      approvedAt: Date.now(),
      startDate: now.toISOString(),
    });

    const schedule = await ctx.db
      .query("medicationSchedules")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .first();

    const times = schedule?.times || ["08:00"];
    const qtyPerAdmin = schedule?.quantityPerAdministration || 1;
    const dailyConsumption = qtyPerAdmin * times.length;

    let inv = await ctx.db
      .query("inventoryItems")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .first();

    if (!inv) {
      const invId = await ctx.db.insert("inventoryItems", {
        petId: med.petId,
        medicationId: med._id,
        name: `${med.name} (${args.initialStockQuantity} ${med.unit || "doses"})`,
        category: "medicamento",
        unit: med.unit || "comprimidos",
        currentQuantity: args.initialStockQuantity,
        dailyConsumption,
        purchaseLeadTimeDays: 5,
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
          notes: "Estoque inicial inserido na aprovação da receita",
        });
      }
    }

    // Gerar administrações para hoje
    const todayDateStr = now.toISOString().split("T")[0];
    for (const timeStr of times) {
      const scheduledIso = `${todayDateStr}T${timeStr}:00.000Z`;
      await ctx.db.insert("medicationAdministrations", {
        medicationId: med._id,
        petId: med.petId,
        scheduledAt: scheduledIso,
        quantity: qtyPerAdmin,
        status: "scheduled",
      });
    }

    await ctx.db.insert("activityLogs", {
      petId: med.petId,
      userId: args.userId,
      action: `aprovou a prescrição médica de ${med.name} e iniciou o tratamento`,
      entityType: "medication",
      entityId: med._id,
    });
  },
});

export const rejectPrescription = mutation({
  args: {
    medicationId: v.id("medications"),
    userId: v.id("users"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const med = await ctx.db.get(args.medicationId);
    if (!med) throw new Error("Medicamento não encontrado");

    await ctx.db.patch(args.medicationId, {
      status: "rejected",
      notes: args.notes ? `${med.notes || ""}\n[Rejeitado]: ${args.notes}`.trim() : med.notes,
    });

    await ctx.db.insert("activityLogs", {
      petId: med.petId,
      userId: args.userId,
      action: `recusou a prescrição de ${med.name}`,
      entityType: "medication",
      entityId: med._id,
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

    await ctx.db.patch(args.administrationId, {
      status: args.status,
      administeredAt: args.status === "administered" ? now.toISOString() : undefined,
      administeredByUserId: args.status === "administered" ? args.userId : undefined,
      notes: args.notes,
    });

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
