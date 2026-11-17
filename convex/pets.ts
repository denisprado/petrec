import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const SHARE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function derivePetShareCode(pet: { _id: any; shareCode?: string }): string {
  return pet.shareCode || `PET-${String(pet._id).slice(-6).toUpperCase()}`;
}

function buildRandomCode(prefix: string): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += SHARE_CODE_CHARS.charAt(
      Math.floor(Math.random() * SHARE_CODE_CHARS.length)
    );
  }
  return `${prefix}-${suffix}`;
}

export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("petMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const petsWithRoles = await Promise.all(
      memberships.map(async (m) => {
        const pet = await ctx.db.get(m.petId);
        if (!pet) return null;
        return {
          ...pet,
          shareCode: derivePetShareCode(pet),
          role: m.role,
          isPrimary: m.isPrimary,
        };
      })
    );

    return petsWithRoles.filter((p): p is NonNullable<typeof p> => p !== null);
  },
});

export const getById = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    const pet = await ctx.db.get(args.petId);
    if (!pet) return null;
    const members = await ctx.db
      .query("petMembers")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    const membersWithUser = await Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        if (!user) {
          return {
            ...m,
            id: m._id,
            user: null,
          };
        }
        const { passwordHash: _passwordHash, ...safeUser } = user as any;
        const professionalProfile =
          m.crmv || m.clinicName || m.specialties
            ? {
                registerNumber: m.crmv,
                clinicName: m.clinicName,
                specialties: m.specialties,
                isVerified: true,
              }
            : null;
        return {
          ...m,
          id: m._id,
          user: {
            ...safeUser,
            id: user._id,
            professionalProfile,
          },
        };
      })
    );
    const invitations = await ctx.db
      .query("petInvitations")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    return {
      ...pet,
      shareCode: derivePetShareCode(pet),
      members: membersWithUser.filter((m) => m.user !== null),
      invitations: invitations.map((inv) => ({
        ...inv,
        id: inv._id,
      })),
    };
  },
});


export const listAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("pets").collect();
  },
});

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")),
    userEmail: v.optional(v.string()),
    name: v.string(),
    species: v.string(),
    breed: v.optional(v.string()),
    sex: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    weight: v.optional(v.number()),
    photo: v.optional(v.string()),
    color: v.optional(v.string()),
    microchip: v.optional(v.string()),
    notes: v.optional(v.string()),
    routineMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: explicitUserId, userEmail, ...petData } = args;

    // Resolver usuário vinculado: por ID explícito ou por email
    let userId = explicitUserId;
    if (!userId && userEmail) {
      const normalizedEmail = userEmail.toLowerCase().trim();
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .first();
      if (user) {
        userId = user._id;
      }
    }
    if (!userId) {
      throw new Error("Usuário autenticado é obrigatório para cadastrar um pet.");
    }

    // 1. Gerar código de compartilhamento único (PET-XXXXXX) e criar o Pet
    let shareCode = buildRandomCode("PET");
    for (let attempt = 0; attempt < 5; attempt++) {
      const collision = await ctx.db
        .query("pets")
        .withIndex("by_share_code", (q) => q.eq("shareCode", shareCode))
        .first();
      if (!collision) break;
      shareCode = buildRandomCode("PET");
    }

    const petId = await ctx.db.insert("pets", {
      ...petData,
      shareCode,
    });

    // 2. Vincular o usuário como proprietário primário (owner)
    await ctx.db.insert("petMembers", {
      petId,
      userId,
      role: "owner",
      isPrimary: true,
    });

    // 3. Se informou peso, gravar no histórico
    if (args.weight) {
      await ctx.db.insert("weightRecords", {
        petId,
        weight: args.weight,
        date: new Date().toISOString(),
        notes: "Peso inicial de cadastro",
      });
    }

    // 4. Log de auditoria
    await ctx.db.insert("activityLogs", {
      petId,
      userId,
      action: `cadastrou o pet ${args.name} no PetRec`,
      entityType: "pet",
      entityId: petId,
    });

    return await ctx.db.get(petId);
  },
});

export const update = mutation({
  args: {
    petId: v.id("pets"),
    name: v.string(),
    species: v.string(),
    breed: v.optional(v.string()),
    sex: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    weight: v.optional(v.number()),
    photo: v.optional(v.string()),
    color: v.optional(v.string()),
    microchip: v.optional(v.string()),
    notes: v.optional(v.string()),
    routineMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { petId, ...updates } = args;
    await ctx.db.patch(petId, updates);
    return await ctx.db.get(petId);
  },
});

export const setRoutineMode = mutation({
  args: {
    petId: v.id("pets"),
    routineMode: v.string(), // "manual" | "automatic_by_exception"
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const pet = await ctx.db.get(args.petId);
    if (!pet) throw new Error("Pet não encontrado");

    await ctx.db.patch(args.petId, {
      routineMode: args.routineMode,
    });

    if (args.userId) {
      await ctx.db.insert("activityLogs", {
        petId: args.petId,
        userId: args.userId,
        action: `alterou o modo de controle para: ${
          args.routineMode === "automatic_by_exception"
            ? "Modo por Exceção (Consumo Regular Automático)"
            : "Modo Manual (Registro Ativo)"
        }`,
        entityType: "pet",
        entityId: args.petId,
      });
    }

    return await ctx.db.get(args.petId);
  },
});

export const remove = mutation({
  args: {
    petId: v.id("pets"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // 1. Deletar membros e convites
    const members = await ctx.db
      .query("petMembers")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);

    const invitations = await ctx.db
      .query("petInvitations")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const inv of invitations) await ctx.db.delete(inv._id);

    // 2. Deletar medicamentos e agendamentos
    const meds = await ctx.db
      .query("medications")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const med of meds) {
      const schedules = await ctx.db
        .query("medicationSchedules")
        .withIndex("by_medication", (q) => q.eq("medicationId", med._id))
        .collect();
      for (const s of schedules) await ctx.db.delete(s._id);
      await ctx.db.delete(med._id);
    }

    // 3. Deletar administrações
    const adms = await ctx.db
      .query("medicationAdministrations")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const a of adms) await ctx.db.delete(a._id);

    // 4. Deletar itens de estoque
    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const item of items) {
      const txs = await ctx.db
        .query("inventoryTransactions")
        .withIndex("by_item", (q) => q.eq("inventoryItemId", item._id))
        .collect();
      for (const t of txs) await ctx.db.delete(t._id);
      await ctx.db.delete(item._id);
    }

    // 5. Deletar saúde (peso, vacinas, consultas, notas)
    const weights = await ctx.db
      .query("weightRecords")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const w of weights) await ctx.db.delete(w._id);

    const vacs = await ctx.db
      .query("vaccinations")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const v of vacs) await ctx.db.delete(v._id);

    const apps = await ctx.db
      .query("appointments")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const app of apps) await ctx.db.delete(app._id);

    const notes = await ctx.db
      .query("clinicalNotes")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const n of notes) await ctx.db.delete(n._id);

    // 6. Deletar o Pet
    await ctx.db.delete(args.petId);
  },
});
