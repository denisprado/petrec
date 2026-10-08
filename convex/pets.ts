import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
        return {
          ...pet,
          role: m.role,
          isPrimary: m.isPrimary,
        };
      })
    );

    return petsWithRoles.filter((p) => p !== null);
  },
});

export const getById = query({
  args: { petId: v.id("pets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.petId);
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
  },
  handler: async (ctx, args) => {
    const { userId: explicitUserId, userEmail, ...petData } = args;

    // Resolver usuário vinculado: por ID explícito, por email, ou primeiro usuário
    let userId = explicitUserId;
    if (!userId && userEmail) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", userEmail))
        .first();
      if (user) {
        userId = user._id;
      }
    }
    if (!userId) {
      const firstUser = await ctx.db.query("users").first();
      if (firstUser) {
        userId = firstUser._id;
      } else {
        userId = await ctx.db.insert("users", {
          name: "Denis Forigo",
          email: "denis@petrec.app",
          avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
          timezone: "America/Sao_Paulo",
        });
      }
    }

    // 1. Criar o Pet
    const petId = await ctx.db.insert("pets", petData);

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
  },
  handler: async (ctx, args) => {
    const { petId, ...updates } = args;
    await ctx.db.patch(petId, updates);
    return await ctx.db.get(petId);
  },
});

export const remove = mutation({
  args: {
    petId: v.id("pets"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // 1. Deletar membros
    const members = await ctx.db
      .query("petMembers")
      .withIndex("by_pet", (q) => q.eq("petId", args.petId))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);

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
