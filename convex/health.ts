import { query, mutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

async function syncLatestPetWeight(ctx: MutationCtx, petId: Id<"pets">) {
  const remaining = await ctx.db
    .query("weightRecords")
    .withIndex("by_pet", (q) => q.eq("petId", petId))
    .collect();

  const sorted = [...remaining].sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    if (!isNaN(tA) && !isNaN(tB) && tB !== tA) return tB - tA;
    return b._creationTime - a._creationTime;
  });

  await ctx.db.patch(petId, {
    weight: sorted[0]?.weight,
  });
}

export const getPetHealth = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const [weights, vaccines, appointments, clinicalNotes, healthEvents] = await Promise.all([
      ctx.db.query("weightRecords").withIndex("by_pet", (q) => q.eq("petId", args.petId)).collect(),
      ctx.db.query("vaccinations").withIndex("by_pet", (q) => q.eq("petId", args.petId)).collect(),
      ctx.db.query("appointments").withIndex("by_pet", (q) => q.eq("petId", args.petId)).collect(),
      ctx.db.query("clinicalNotes").withIndex("by_pet", (q) => q.eq("petId", args.petId)).collect(),
      ctx.db.query("healthEvents").withIndex("by_pet", (q) => q.eq("petId", args.petId)).collect(),
    ]);

    // Hydrate users in weightRecords
    const weightsWithUser = await Promise.all(
      weights.map(async (w) => {
        return {
          ...w,
          id: w._id,
        };
      })
    );

    // Hydrate clinical notes author
    const notesWithAuthor = await Promise.all(
      clinicalNotes.map(async (n) => {
        const author = await ctx.db.get(n.authorId);
        return {
          ...n,
          id: n._id,
          createdAt: new Date(n._creationTime).toISOString(),
          author,
        };
      })
    );

    return {
      weights: weightsWithUser,
      vaccines: vaccines.map((v) => ({ ...v, id: v._id })),
      appointments: appointments.map((a) => ({ ...a, id: a._id })),
      clinicalNotes: notesWithAuthor,
      healthEvents: healthEvents.map((h) => ({ ...h, id: h._id })),
    };
  },
});

export const listClinicalNotes = query({
  args: {
    petId: v.id("pets"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("clinicalNotes")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .order("desc")
      .collect();

    let canViewPrivateVetNotes = false;
    if (args.userId) {
      const membership = await ctx.db
        .query("petMembers")
        .withIndex("by_pet_and_user", (q) => q.eq("petId", args.petId).eq("userId", args.userId!))
        .first();

      if (membership && (membership.role === "vet_limited" || membership.role === "clinic_admin")) {
        canViewPrivateVetNotes = true;
      }
    }

    const filtered = canViewPrivateVetNotes
      ? notes
      : notes.filter((n) => n.visibility === "ALL_TUTORS");

    return await Promise.all(
      filtered.map(async (n) => {
        const author = await ctx.db.get(n.authorId);
        return {
          ...n,
          id: n._id,
          createdAt: new Date(n._creationTime).toISOString(),
          author,
        };
      })
    );
  },
});

export const recordWeight = mutation({
  args: {
    petId: v.id("pets"),
    userId: v.optional(v.id("users")),
    weight: v.number(),
    notes: v.optional(v.string()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const recordId = await ctx.db.insert("weightRecords", {
      petId: args.petId,
      weight: args.weight,
      date: args.date || new Date().toISOString(),
      notes: args.notes,
    });

    await ctx.db.patch(args.petId, {
      weight: args.weight,
    });

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: args.petId,
        userId: args.userId,
        action: `registrou peso de ${args.weight} kg`,
        entityType: "health",
        entityId: recordId,
      });
    }

    return recordId;
  },
});

export const recordAppointment = mutation({
  args: {
    petId: v.id("pets"),
    userId: v.optional(v.id("users")),
    title: v.string(),
    type: v.string(),
    date: v.string(),
    time: v.string(),
    location: v.optional(v.string()),
    veterinarian: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apptId = await ctx.db.insert("appointments", {
      petId: args.petId,
      title: args.title,
      type: args.type,
      date: args.date,
      time: args.time,
      location: args.location,
      veterinarian: args.veterinarian,
      notes: args.notes,
    });

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: args.petId,
        userId: args.userId,
        action: `agendou compromisso: "${args.title}"`,
        entityType: "appointment",
        entityId: apptId,
      });
    }

    return apptId;
  },
});

export const recordVaccine = mutation({
  args: {
    petId: v.id("pets"),
    userId: v.optional(v.id("users")),
    name: v.string(),
    applicationDate: v.string(),
    nextDueDate: v.optional(v.string()),
    veterinarian: v.optional(v.string()),
    crmv: v.optional(v.string()),
    batch: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const vaccId = await ctx.db.insert("vaccinations", {
      petId: args.petId,
      name: args.name,
      applicationDate: args.applicationDate,
      nextDueDate: args.nextDueDate,
      veterinarian: args.veterinarian,
      crmv: args.crmv,
      batch: args.batch,
      notes: args.notes,
    });

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: args.petId,
        userId: args.userId,
        action: `registrou aplicação da vacina "${args.name}"`,
        entityType: "vaccine",
        entityId: vaccId,
      });
    }

    return vaccId;
  },
});

export const recordClinicalNote = mutation({
  args: {
    petId: v.id("pets"),
    authorId: v.id("users"),
    content: v.string(),
    visibility: v.string(), // "ALL_TUTORS" | "PROFESSIONALS_ONLY"
    appointmentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const noteId = await ctx.db.insert("clinicalNotes", {
      petId: args.petId,
      authorId: args.authorId,
      content: args.content,
      visibility: args.visibility,
      appointmentId: args.appointmentId,
    });

    await ctx.db.insert("activityLogs", {
      petId: args.petId,
      userId: args.authorId,
      action: `adicionou nota ao prontuário (${args.visibility === "PROFESSIONALS_ONLY" ? "🔒 Confidencial Vet" : "Pública"})`,
      entityType: "health",
      entityId: noteId,
    });

    return noteId;
  },
});

export const updateClinicalNote = mutation({
  args: {
    noteId: v.id("clinicalNotes"),
    userId: v.optional(v.id("users")),
    content: v.string(),
    visibility: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.noteId);
    if (!existing) throw new Error("Nota clínica não encontrada.");

    await ctx.db.patch(args.noteId, {
      content: args.content.trim(),
      ...(args.visibility ? { visibility: args.visibility } : {}),
    });

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: existing.petId,
        userId: args.userId,
        action: "editou uma nota clínica do prontuário",
        entityType: "health",
        entityId: args.noteId,
      });
    }

    return { success: true };
  },
});

export const deleteClinicalNote = mutation({
  args: {
    noteId: v.id("clinicalNotes"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.noteId);
    if (!existing) throw new Error("Nota clínica não encontrada.");

    await ctx.db.delete(args.noteId);

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: existing.petId,
        userId: args.userId,
        action: "excluiu uma nota clínica do prontuário",
        entityType: "health",
        entityId: args.noteId,
      });
    }

    return { success: true };
  },
});

export const updateWeight = mutation({
  args: {
    weightId: v.id("weightRecords"),
    userId: v.optional(v.id("users")),
    weight: v.number(),
    date: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.weightId);
    if (!existing) throw new Error("Registro de peso não encontrado.");

    await ctx.db.patch(args.weightId, {
      weight: args.weight,
      date: args.date || existing.date,
      notes: args.notes,
    });

    await syncLatestPetWeight(ctx, existing.petId);

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: existing.petId,
        userId: args.userId,
        action: `editou pesagem para ${args.weight} kg`,
        entityType: "health",
        entityId: args.weightId,
      });
    }

    return { success: true };
  },
});

export const deleteWeight = mutation({
  args: {
    weightId: v.id("weightRecords"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.weightId);
    if (!existing) throw new Error("Registro de peso não encontrado.");

    await ctx.db.delete(args.weightId);
    await syncLatestPetWeight(ctx, existing.petId);

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: existing.petId,
        userId: args.userId,
        action: `excluiu pesagem de ${existing.weight} kg`,
        entityType: "health",
        entityId: args.weightId,
      });
    }

    return { success: true };
  },
});

export const updateVaccine = mutation({
  args: {
    vaccineId: v.id("vaccinations"),
    userId: v.optional(v.id("users")),
    name: v.string(),
    applicationDate: v.string(),
    nextDueDate: v.optional(v.string()),
    veterinarian: v.optional(v.string()),
    crmv: v.optional(v.string()),
    batch: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.vaccineId);
    if (!existing) throw new Error("Vacina não encontrada.");

    await ctx.db.patch(args.vaccineId, {
      name: args.name.trim(),
      applicationDate: args.applicationDate,
      nextDueDate: args.nextDueDate,
      veterinarian: args.veterinarian,
      crmv: args.crmv,
      batch: args.batch,
      notes: args.notes,
    });

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: existing.petId,
        userId: args.userId,
        action: `editou a vacina "${args.name.trim()}"`,
        entityType: "vaccine",
        entityId: args.vaccineId,
      });
    }

    return { success: true };
  },
});

export const deleteVaccine = mutation({
  args: {
    vaccineId: v.id("vaccinations"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.vaccineId);
    if (!existing) throw new Error("Vacina não encontrada.");

    await ctx.db.delete(args.vaccineId);

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: existing.petId,
        userId: args.userId,
        action: `excluiu a vacina "${existing.name}"`,
        entityType: "vaccine",
        entityId: args.vaccineId,
      });
    }

    return { success: true };
  },
});

export const updateAppointment = mutation({
  args: {
    appointmentId: v.id("appointments"),
    userId: v.optional(v.id("users")),
    title: v.string(),
    type: v.string(),
    date: v.string(),
    time: v.string(),
    location: v.optional(v.string()),
    veterinarian: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.appointmentId);
    if (!existing) throw new Error("Compromisso não encontrado.");

    await ctx.db.patch(args.appointmentId, {
      title: args.title.trim(),
      type: args.type,
      date: args.date,
      time: args.time,
      location: args.location,
      veterinarian: args.veterinarian,
      notes: args.notes,
    });

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: existing.petId,
        userId: args.userId,
        action: `editou o compromisso "${args.title.trim()}"`,
        entityType: "appointment",
        entityId: args.appointmentId,
      });
    }

    return { success: true };
  },
});

export const deleteAppointment = mutation({
  args: {
    appointmentId: v.id("appointments"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.appointmentId);
    if (!existing) throw new Error("Compromisso não encontrado.");

    await ctx.db.delete(args.appointmentId);

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: existing.petId,
        userId: args.userId,
        action: `excluiu o compromisso "${existing.title}"`,
        entityType: "appointment",
        entityId: args.appointmentId,
      });
    }

    return { success: true };
  },
});
