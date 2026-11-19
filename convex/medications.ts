import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { computeInventoryStatus } from "./inventory";

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

function getBrtDateAndTime(now: Date = new Date()): {
  dateStr: string;
  timeStr: string;
} {
  const brtDate = new Date(now.getTime() - BRT_OFFSET_MS);
  const iso = brtDate.toISOString();
  return {
    dateStr: iso.slice(0, 10),
    timeStr: iso.slice(11, 16),
  };
}

function extractIsoDateAndTime(isoStr: string): {
  dateStr: string;
  timeStr: string;
} {
  const match = String(isoStr || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) {
    return { dateStr: match[1], timeStr: match[2] };
  }
  return { dateStr: "", timeStr: "08:00" };
}

function normalizeTimesArray(times: string[] | undefined): string[] {
  const normalized = (Array.isArray(times) ? times : [])
    .map((t) => {
      const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return "";
      const hNum = Number(m[1]);
      const mNum = Number(m[2]);
      if (isNaN(hNum) || isNaN(mNum) || hNum > 23 || mNum > 59) return "";
      return `${String(hNum).padStart(2, "0")}:${String(mNum).padStart(2, "0")}`;
    })
    .filter(Boolean);
  const unique = Array.from(new Set(normalized)).sort();
  return unique.length > 0 ? unique : ["08:00"];
}

function normalizeTextKey(s: string | undefined): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function buildInventoryItemName(name: string, dosage?: string): string {
  const cleanName = name.trim();
  const cleanDosage = dosage?.trim();
  if (!cleanDosage) return cleanName;
  if (normalizeTextKey(cleanName).includes(normalizeTextKey(cleanDosage))) {
    return cleanName;
  }
  return `${cleanName} ${cleanDosage}`;
}

export const listByPet = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const meds = await ctx.db
      .query("medications")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();

    const hydrated = await Promise.all(
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
          schedules: schedules.map((s) => ({
            ...s,
            id: s._id,
            times: normalizeTimesArray(s.times),
          })),
          inventoryItem: inventoryItem ? { ...inventoryItem, id: inventoryItem._id } : null,
          prescribedBy,
          approvedBy,
        };
      })
    );

    return hydrated.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },
});

export const getAdministrationsToday = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const { dateStr: todayStr } = getBrtDateAndTime();

    const adms = await ctx.db
      .query("medicationAdministrations")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();

    const todayAdms = adms.filter((a) => a.scheduledAt.startsWith(todayStr));

    const hydrated = await Promise.all(
      todayAdms.map(async (adm) => {
        const medication = await ctx.db.get(adm.medicationId);
        if (!medication || medication.status !== "active") {
          return null;
        }
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

    return hydrated
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        const tA = extractIsoDateAndTime(a.scheduledAt).timeStr;
        const tB = extractIsoDateAndTime(b.scheduledAt).timeStr;
        if (tA !== tB) return tA.localeCompare(tB);
        return (a.medication?.name || "").localeCompare(b.medication?.name || "", "pt-BR");
      });
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

async function deleteMedicationCascade(ctx: any, medId: any) {
  const adms = await ctx.db
    .query("medicationAdministrations")
    .withIndex("by_medication", (q: any) => q.eq("medicationId", medId))
    .collect();
  for (const a of adms) await ctx.db.delete(a._id);

  const schedules = await ctx.db
    .query("medicationSchedules")
    .withIndex("by_medication", (q: any) => q.eq("medicationId", medId))
    .collect();
  for (const s of schedules) await ctx.db.delete(s._id);

  const invItems = await ctx.db
    .query("inventoryItems")
    .withIndex("by_medication", (q: any) => q.eq("medicationId", medId))
    .collect();
  for (const inv of invItems) {
    const txs = await ctx.db
      .query("inventoryTransactions")
      .withIndex("by_item", (q: any) => q.eq("inventoryItemId", inv._id))
      .collect();
    for (const t of txs) await ctx.db.delete(t._id);

    const shopItems = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_pet", (q: any) => q.eq("petId", inv.petId))
      .collect();
    for (const s of shopItems) {
      if (s.inventoryItemId === inv._id) await ctx.db.delete(s._id);
    }

    await ctx.db.delete(inv._id);
  }
}

async function refundAutoRoutineInventory(
  ctx: any,
  medicationId: any,
  quantity: number,
  todayDateStr: string
) {
  const inv = await ctx.db
    .query("inventoryItems")
    .withIndex("by_medication", (q: any) => q.eq("medicationId", medicationId))
    .first();
  if (!inv) return;

  const newQty = inv.currentQuantity + quantity;
  const computed = computeInventoryStatus(
    newQty,
    inv.dailyConsumption,
    inv.purchaseLeadTimeDays
  );

  await ctx.db.patch(inv._id, {
    currentQuantity: newQty,
    status: computed.status,
    estimatedEndDate: computed.estimatedEndDate,
    ...(computed.status === "OK"
      ? { lastLowStockAlertDate: undefined, lastLowStockAlertStatus: undefined }
      : {}),
  });

  const txs = await ctx.db
    .query("inventoryTransactions")
    .withIndex("by_item", (q: any) => q.eq("inventoryItemId", inv._id))
    .collect();
  const matchingTx = txs.find(
    (tx: any) =>
      tx.type === "routine_auto" &&
      tx.date?.startsWith(todayDateStr) &&
      tx.quantity === -quantity
  );
  if (matchingTx) {
    await ctx.db.delete(matchingTx._id);
  }
}

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
    const { dateStr: todayDateStr } = getBrtDateAndTime(now);
    const initialStatus = args.status || "active";
    const cleanTimes = normalizeTimesArray(args.times);
    const unit = args.unit || "comprimidos";

    // 1. Criar Medicamento
    const medId = await ctx.db.insert("medications", {
      petId: args.petId,
      name: args.name.trim(),
      activeIngredient: args.activeIngredient || undefined,
      presentation: args.presentation || undefined,
      dosage: args.dosage || undefined,
      unit,
      instructions: args.instructions || undefined,
      veterinarian: args.veterinarian || undefined,
      startDate: now.toISOString(),
      status: initialStatus,
      prescribedById: args.userId,
      approvedById: initialStatus === "active" ? args.userId : undefined,
      approvedAt: initialStatus === "active" ? Date.now() : undefined,
      notes: args.notes || undefined,
    });

    // 2. Criar Cronograma Posológico
    await ctx.db.insert("medicationSchedules", {
      medicationId: medId,
      quantityPerAdministration: args.quantityPerAdministration,
      administrationsPerDay: cleanTimes.length,
      frequency: cleanTimes.length === 1 ? "daily" : cleanTimes.length === 2 ? "every_12h" : "custom",
      times: cleanTimes,
      startDate: now.toISOString(),
      active: true,
    });

    // 3. Se ativo, criar Item de Estoque e administrações
    if (initialStatus === "active") {
      const dailyConsumption = args.quantityPerAdministration * cleanTimes.length;
      const computed = computeInventoryStatus(
        args.initialStockQuantity,
        dailyConsumption,
        args.purchaseLeadTimeDays
      );

      const invId = await ctx.db.insert("inventoryItems", {
        petId: args.petId,
        medicationId: medId,
        name: buildInventoryItemName(args.name, args.dosage),
        category: "medicamento",
        unit,
        currentQuantity: args.initialStockQuantity,
        dailyConsumption,
        purchaseLeadTimeDays: args.purchaseLeadTimeDays,
        referenceDate: now.toISOString(),
        status: computed.status,
        estimatedEndDate: computed.estimatedEndDate,
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
      for (const timeStr of cleanTimes) {
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
        ? `cadastrou o medicamento ${args.name.trim()}`
        : `prescreveu ${args.name.trim()} (aguarda aprovação)`,
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
    const med = await ctx.db.get(args.medicationId);
    if (!med) throw new Error("Medicamento não encontrado");

    const now = new Date();
    const { dateStr: todayDateStr } = getBrtDateAndTime(now);
    const cleanTimes = normalizeTimesArray(args.times);
    const resolvedUnit = args.unit || med.unit || "comprimidos";

    await ctx.db.patch(args.medicationId, {
      name: args.name.trim(),
      activeIngredient: args.activeIngredient?.trim() || undefined,
      presentation: args.presentation || undefined,
      dosage: args.dosage?.trim() || undefined,
      unit: resolvedUnit,
      instructions: args.instructions?.trim() || undefined,
      veterinarian: args.veterinarian?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    });

    const schedule = await ctx.db
      .query("medicationSchedules")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .first();

    const frequency =
      cleanTimes.length === 1 ? "daily" : cleanTimes.length === 2 ? "every_12h" : "custom";

    if (schedule) {
      await ctx.db.patch(schedule._id, {
        quantityPerAdministration: args.quantityPerAdministration,
        administrationsPerDay: cleanTimes.length,
        frequency,
        times: cleanTimes,
        active: true,
      });
    } else {
      await ctx.db.insert("medicationSchedules", {
        medicationId: args.medicationId,
        quantityPerAdministration: args.quantityPerAdministration,
        administrationsPerDay: cleanTimes.length,
        frequency,
        times: cleanTimes,
        startDate: now.toISOString(),
        active: true,
      });
    }

    const dailyConsumption = args.quantityPerAdministration * cleanTimes.length;
    const computed = computeInventoryStatus(
      args.currentQuantity,
      dailyConsumption,
      args.purchaseLeadTimeDays
    );
    const invName = buildInventoryItemName(args.name, args.dosage);

    let inv = await ctx.db
      .query("inventoryItems")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .first();

    if (inv) {
      await ctx.db.patch(inv._id, {
        name: invName,
        unit: resolvedUnit,
        currentQuantity: args.currentQuantity,
        dailyConsumption,
        purchaseLeadTimeDays: args.purchaseLeadTimeDays,
        status: computed.status,
        estimatedEndDate: computed.estimatedEndDate,
        ...(computed.status === "OK"
          ? { lastLowStockAlertDate: undefined, lastLowStockAlertStatus: undefined }
          : {}),
      });
    } else if (med.status === "active") {
      await ctx.db.insert("inventoryItems", {
        petId: med.petId,
        medicationId: med._id,
        name: invName,
        category: "medicamento",
        unit: resolvedUnit,
        currentQuantity: args.currentQuantity,
        dailyConsumption,
        purchaseLeadTimeDays: args.purchaseLeadTimeDays,
        referenceDate: now.toISOString(),
        status: computed.status,
        estimatedEndDate: computed.estimatedEndDate,
      });
    }

    // Sincronizar administrações de hoje com os novos horários/doses
    if (med.status === "active") {
      const allMedAdms = await ctx.db
        .query("medicationAdministrations")
        .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
        .collect();
      const todayAdms = allMedAdms.filter((a) => a.scheduledAt.startsWith(todayDateStr));

      const remainingTimes = new Set<string>();
      for (const adm of todayAdms) {
        const { timeStr: admTime } = extractIsoDateAndTime(adm.scheduledAt);
        if (!cleanTimes.includes(admTime)) {
          if (adm.status === "scheduled" || adm.notes?.includes("Rotina regular")) {
            await ctx.db.delete(adm._id);
          } else {
            remainingTimes.add(admTime);
          }
        } else {
          if (adm.status === "scheduled" && adm.quantity !== args.quantityPerAdministration) {
            await ctx.db.patch(adm._id, { quantity: args.quantityPerAdministration });
          }
          remainingTimes.add(admTime);
        }
      }

      for (const timeStr of cleanTimes) {
        if (!remainingTimes.has(timeStr)) {
          await ctx.db.insert("medicationAdministrations", {
            medicationId: args.medicationId,
            petId: med.petId,
            scheduledAt: `${todayDateStr}T${timeStr}:00.000Z`,
            quantity: args.quantityPerAdministration,
            status: "scheduled",
          });
        }
      }
    }

    await ctx.db.insert("activityLogs", {
      petId: med.petId,
      userId: args.userId,
      action: `editou o medicamento ${args.name.trim()}`,
      entityType: "medication",
      entityId: args.medicationId,
    });

    const updatedMed = await ctx.db.get(args.medicationId);
    const updatedSchedules = await ctx.db
      .query("medicationSchedules")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .collect();
    const updatedInv = await ctx.db
      .query("inventoryItems")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .first();

    return updatedMed
      ? {
          ...updatedMed,
          id: updatedMed._id,
          schedules: updatedSchedules.map((s) => ({
            ...s,
            id: s._id,
            times: normalizeTimesArray(s.times),
          })),
          inventoryItem: updatedInv ? { ...updatedInv, id: updatedInv._id } : null,
        }
      : null;
  },
});

export const remove = mutation({
  args: {
    medicationId: v.id("medications"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const med = await ctx.db.get(args.medicationId);
    if (!med) return { deleted: false };

    await deleteMedicationCascade(ctx, args.medicationId);
    await ctx.db.delete(args.medicationId);

    await ctx.db.insert("activityLogs", {
      petId: med.petId,
      userId: args.userId,
      action: `excluiu o medicamento ${med.name}`,
      entityType: "medication",
    });

    return {
      deleted: true,
      petId: med.petId,
      medicationName: med.name,
    };
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
    const { dateStr: todayDateStr } = getBrtDateAndTime(now);
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

    const times = normalizeTimesArray(schedule?.times || ["08:00"]);
    const qtyPerAdmin = schedule?.quantityPerAdministration || 1;
    const dailyConsumption = qtyPerAdmin * times.length;
    const computed = computeInventoryStatus(args.initialStockQuantity, dailyConsumption, 5);

    let inv = await ctx.db
      .query("inventoryItems")
      .withIndex("by_medication", (q) => q.eq("medicationId", args.medicationId))
      .first();

    if (!inv) {
      const invId = await ctx.db.insert("inventoryItems", {
        petId: med.petId,
        medicationId: med._id,
        name: buildInventoryItemName(med.name, med.dosage),
        category: "medicamento",
        unit: med.unit || "comprimidos",
        currentQuantity: args.initialStockQuantity,
        dailyConsumption,
        purchaseLeadTimeDays: 5,
        referenceDate: now.toISOString(),
        status: computed.status,
        estimatedEndDate: computed.estimatedEndDate,
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

    return {
      success: true,
      petId: med.petId,
      medicationName: med.name,
    };
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

    return {
      success: true,
      petId: med.petId,
      medicationName: med.name,
    };
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

    const previousStatus = adm.status;
    const now = new Date();

    await ctx.db.patch(args.administrationId, {
      status: args.status,
      administeredAt: args.status === "administered" ? now.toISOString() : undefined,
      administeredByUserId: args.status === "administered" ? args.userId : undefined,
      notes: args.notes || (args.status === "skipped" ? "Dose pulada / Não administrada (Exceção)" : undefined),
    });

    const inv = await ctx.db
      .query("inventoryItems")
      .withIndex("by_medication", (q) => q.eq("medicationId", adm.medicationId))
      .first();

    // 1. Se tornou administrado (e antes não era), deduz do estoque
    if (args.status === "administered" && previousStatus !== "administered") {
      if (inv) {
        const newQty = Math.max(0, inv.currentQuantity - adm.quantity);
        const computed = computeInventoryStatus(
          newQty,
          inv.dailyConsumption,
          inv.purchaseLeadTimeDays
        );
        await ctx.db.patch(inv._id, {
          currentQuantity: newQty,
          status: computed.status,
          estimatedEndDate: computed.estimatedEndDate,
        });

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

    // 2. Se antes era administrado e agora foi marcado como pulado / não administrado (EXCEÇÃO), devolve ao estoque!
    if (previousStatus === "administered" && (args.status === "skipped" || args.status === "missed")) {
      if (inv) {
        const newQty = inv.currentQuantity + adm.quantity;
        const computed = computeInventoryStatus(
          newQty,
          inv.dailyConsumption,
          inv.purchaseLeadTimeDays
        );
        await ctx.db.patch(inv._id, {
          currentQuantity: newQty,
          status: computed.status,
          estimatedEndDate: computed.estimatedEndDate,
          ...(computed.status === "OK"
            ? { lastLowStockAlertDate: undefined, lastLowStockAlertStatus: undefined }
            : {}),
        });

        await ctx.db.insert("inventoryTransactions", {
          inventoryItemId: inv._id,
          type: "routine_exception",
          quantity: adm.quantity,
          date: now.toISOString(),
          userId: args.userId,
          notes: `Exceção de medicamento: dose pulada/não administrada (+${adm.quantity} ${inv.unit} devolvidos ao estoque)`,
        });
      }
    }

    const med = await ctx.db.get(adm.medicationId);
    return {
      success: true,
      petId: adm.petId,
      medicationName: med?.name || "Medicamento",
      status: args.status,
      quantity: adm.quantity,
    };
  },
});

export const syncRoutineMedications = mutation({
  args: {
    petId: v.id("pets"),
    nowIso: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pet = await ctx.db.get(args.petId);
    if (!pet) return { success: false, reason: "pet_not_found" };

    const now = args.nowIso ? new Date(args.nowIso) : new Date();
    const { dateStr: todayDateStr, timeStr: currentBrtTime } = getBrtDateAndTime(now);

    // 1. Buscar medicamentos e auto-reparar fantasmas duplicados sem estoque
    const meds = await ctx.db
      .query("medications")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();

    const activeMeds = meds.filter((m) => m.status === "active");
    const invByMedId = new Map<string, any>();
    for (const med of activeMeds) {
      const inv = await ctx.db
        .query("inventoryItems")
        .withIndex("by_medication", (q) => q.eq("medicationId", med._id))
        .first();
      invByMedId.set(String(med._id), inv || null);
    }

    const medsWithInv = activeMeds.filter((m) => invByMedId.get(String(m._id)) !== null);
    const survivingActiveMeds: typeof activeMeds = [];
    let cleanedPhantomMedsCount = 0;

    for (const med of activeMeds) {
      const inv = invByMedId.get(String(med._id));
      if (inv !== null) {
        survivingActiveMeds.push(med);
        continue;
      }

      const duplicateWithInv = medsWithInv.find((other) => {
        if (other._id === med._id) return false;
        if (normalizeTextKey(other.name) !== normalizeTextKey(med.name)) return false;
        const d1 = normalizeTextKey(med.dosage);
        const d2 = normalizeTextKey(other.dosage);
        return !d1 || !d2 || d1 === d2;
      });

      if (duplicateWithInv) {
        await deleteMedicationCascade(ctx, med._id);
        await ctx.db.delete(med._id);
        cleanedPhantomMedsCount++;
      } else {
        // Medicamento único sem inventoryItem vinculado: recriar item de estoque para consistência
        const sched = await ctx.db
          .query("medicationSchedules")
          .withIndex("by_medication", (q) => q.eq("medicationId", med._id))
          .first();
        const times = normalizeTimesArray(sched?.times || ["08:00"]);
        const qtyPerAdmin = sched?.quantityPerAdministration || 1;
        const dailyConsumption = qtyPerAdmin * times.length;
        const computed = computeInventoryStatus(0, dailyConsumption, 5);
        const recreatedInvId = await ctx.db.insert("inventoryItems", {
          petId: med.petId,
          medicationId: med._id,
          name: buildInventoryItemName(med.name, med.dosage),
          category: "medicamento",
          unit: med.unit || "comprimidos",
          currentQuantity: 0,
          dailyConsumption,
          purchaseLeadTimeDays: 5,
          referenceDate: now.toISOString(),
          status: computed.status,
          estimatedEndDate: computed.estimatedEndDate,
        });
        const recreatedInv = await ctx.db.get(recreatedInvId);
        invByMedId.set(String(med._id), recreatedInv);
        survivingActiveMeds.push(med);
      }
    }

    // 2. Mapear cronogramas ativos dos medicamentos sobreviventes
    const activeScheduleByMedId = new Map<
      string,
      { schedule: any; cleanTimes: string[] }
    >();
    for (const med of survivingActiveMeds) {
      const schedule = await ctx.db
        .query("medicationSchedules")
        .withIndex("by_medication", (q) => q.eq("medicationId", med._id))
        .first();
      if (schedule && schedule.active) {
        activeScheduleByMedId.set(String(med._id), {
          schedule,
          cleanTimes: normalizeTimesArray(schedule.times),
        });
      }
    }

    // 3. Auto-reparar administrações órfãs, fora do cronograma, duplicadas ou baixadas antes da hora (bug UTC)
    const survivingMedIds = new Set(survivingActiveMeds.map((m) => String(m._id)));
    const medStatusCache = new Map<string, string | null>();
    for (const m of meds) {
      if (survivingMedIds.has(String(m._id)) || m.status !== "active") {
        medStatusCache.set(String(m._id), m.status);
      }
    }

    const allPetAdms = await ctx.db
      .query("medicationAdministrations")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();

    const seenTodayKeys = new Map<string, (typeof allPetAdms)[number]>();
    const activeTodayAdms: Array<(typeof allPetAdms)[number]> = [];
    const activePastScheduledAdms: Array<(typeof allPetAdms)[number]> = [];
    let cleanedOrphanAdmsCount = 0;

    for (const adm of allPetAdms) {
      const medIdStr = String(adm.medicationId);
      let medStatus = medStatusCache.get(medIdStr);
      if (medStatus === undefined) {
        const medDoc = await ctx.db.get(adm.medicationId);
        medStatus = medDoc ? medDoc.status : null;
        medStatusCache.set(medIdStr, medStatus);
      }

      if (medStatus === null) {
        await ctx.db.delete(adm._id);
        cleanedOrphanAdmsCount++;
        continue;
      }

      if (medStatus !== "active") {
        continue;
      }

      const { dateStr: admDate, timeStr: admTime } = extractIsoDateAndTime(adm.scheduledAt);
      if (admDate !== todayDateStr) {
        if (adm.status === "scheduled" && admDate && admDate < todayDateStr) {
          activePastScheduledAdms.push(adm);
        }
        continue;
      }

      const schedEntry = activeScheduleByMedId.get(medIdStr);
      const isValidTime = Boolean(schedEntry && schedEntry.cleanTimes.includes(admTime));
      const isAutoRoutine = Boolean(
        adm.status === "administered" && adm.notes?.includes("Rotina regular")
      );

      if (!isValidTime) {
        if (adm.status === "scheduled" || isAutoRoutine) {
          if (isAutoRoutine) {
            await refundAutoRoutineInventory(ctx, adm.medicationId, adm.quantity, todayDateStr);
          }
          await ctx.db.delete(adm._id);
          cleanedOrphanAdmsCount++;
        }
        continue;
      }

      const dupKey = `${medIdStr}_${admTime}`;
      if (seenTodayKeys.has(dupKey)) {
        if (adm.status === "scheduled" || isAutoRoutine) {
          if (isAutoRoutine) {
            await refundAutoRoutineInventory(ctx, adm.medicationId, adm.quantity, todayDateStr);
          }
          await ctx.db.delete(adm._id);
          cleanedOrphanAdmsCount++;
        }
        continue;
      }

      // Reverter dose auto-administrada prematuramente (ex: 12:00Z que parecia vencida às 09:00 BRT)
      if (isAutoRoutine && admTime > currentBrtTime) {
        await ctx.db.patch(adm._id, {
          status: "scheduled",
          administeredAt: undefined,
          notes: undefined,
        });
        await refundAutoRoutineInventory(ctx, adm.medicationId, adm.quantity, todayDateStr);
        adm.status = "scheduled";
        adm.administeredAt = undefined;
        adm.notes = undefined;
      }

      seenTodayKeys.set(dupKey, adm);
      activeTodayAdms.push(adm);
    }

    // 4. Garantir administrações de hoje para todos os horários ativos configurados
    for (const med of survivingActiveMeds) {
      const schedEntry = activeScheduleByMedId.get(String(med._id));
      if (!schedEntry) continue;

      const { schedule, cleanTimes } = schedEntry;
      for (const timeStr of cleanTimes) {
        const dupKey = `${String(med._id)}_${timeStr}`;
        if (!seenTodayKeys.has(dupKey)) {
          const scheduledIso = `${todayDateStr}T${timeStr}:00.000Z`;
          const newAdmId = await ctx.db.insert("medicationAdministrations", {
            medicationId: med._id,
            petId: args.petId,
            scheduledAt: scheduledIso,
            quantity: schedule.quantityPerAdministration,
            status: "scheduled",
          });
          const createdAdm = await ctx.db.get(newAdmId);
          if (createdAdm) {
            seenTodayKeys.set(dupKey, createdAdm);
            activeTodayAdms.push(createdAdm);
          }
        }
      }
    }

    // 5. Se estiver no modo por exceção, doses cuja hora BRT já foi atingida viram administradas por rotina
    let autoAdministeredCount = 0;
    if (pet.routineMode === "automatic_by_exception") {
      const candidates = [...activePastScheduledAdms, ...activeTodayAdms];
      for (const adm of candidates) {
        if (adm.status !== "scheduled") continue;

        const { dateStr: admDate, timeStr: admTime } = extractIsoDateAndTime(adm.scheduledAt);
        const hasReachedTime =
          Boolean(admDate) &&
          (admDate < todayDateStr || (admDate === todayDateStr && admTime <= currentBrtTime));

        if (hasReachedTime) {
          await ctx.db.patch(adm._id, {
            status: "administered",
            administeredAt: adm.scheduledAt,
            notes: "Administrado automaticamente (Rotina regular)",
          });

          const inv = await ctx.db
            .query("inventoryItems")
            .withIndex("by_medication", (q) => q.eq("medicationId", adm.medicationId))
            .first();

          if (inv) {
            const newQty = Math.max(0, inv.currentQuantity - adm.quantity);
            const computed = computeInventoryStatus(
              newQty,
              inv.dailyConsumption,
              inv.purchaseLeadTimeDays
            );
            await ctx.db.patch(inv._id, {
              currentQuantity: newQty,
              status: computed.status,
              estimatedEndDate: computed.estimatedEndDate,
            });

            await ctx.db.insert("inventoryTransactions", {
              inventoryItemId: inv._id,
              type: "routine_auto",
              quantity: -adm.quantity,
              date: now.toISOString(),
              notes: "Dose regular automática (horário atingido)",
            });
          }

          autoAdministeredCount++;
        }
      }
    }

    return {
      success: true,
      autoAdministeredCount,
      cleanedPhantomMedsCount,
      cleanedOrphanAdmsCount,
    };
  },
});
