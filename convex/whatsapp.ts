import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getSession = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("whatsappSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const getContextByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_whatsapp", (q) => q.eq("whatsappPhoneNumber", args.phone))
      .first();

    if (!user) return null;

    const memberships = await ctx.db
      .query("petMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const pets = await Promise.all(
      memberships.map(async (m) => await ctx.db.get(m.petId))
    );

    const session = await ctx.db
      .query("whatsappSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    return {
      user,
      pets: pets.filter((p) => p !== null),
      session,
    };
  },
});

export const pairByToken = mutation({
  args: {
    phone: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const pairing = await ctx.db
      .query("whatsappPairingTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!pairing || pairing.expiresAt < now) {
      return { success: false, error: "Código inválido ou expirado" };
    }

    const user = await ctx.db.get(pairing.userId);
    if (!user) return { success: false, error: "Usuário não encontrado" };

    // Atualizar telefone do usuário
    await ctx.db.patch(user._id, {
      whatsappPhoneNumber: args.phone,
      whatsappVerifiedAt: now,
    });

    // Buscar primeiro pet do usuário
    const membership = await ctx.db
      .query("petMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const firstPetId = membership?.petId;

    // Criar ou atualizar sessão
    const existingSession = await ctx.db
      .query("whatsappSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existingSession) {
      await ctx.db.patch(existingSession._id, {
        currentPetId: firstPetId,
        state: "IDLE",
        pendingActionPayload: undefined,
      });
    } else {
      await ctx.db.insert("whatsappSessions", {
        userId: user._id,
        currentPetId: firstPetId,
        state: "IDLE",
      });
    }

    // Excluir token usado
    await ctx.db.delete(pairing._id);

    return {
      success: true,
      user,
      petId: firstPetId,
    };
  },
});

export const directConnect = mutation({
  args: {
    userId: v.id("users"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await ctx.db.get(args.userId);
    if (!user) return { success: false, error: "Usuário não encontrado" };

    // Atualizar telefone do usuário
    await ctx.db.patch(user._id, {
      whatsappPhoneNumber: args.phone,
      whatsappVerifiedAt: now,
    });

    // Buscar primeiro pet do usuário
    const membership = await ctx.db
      .query("petMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const firstPetId = membership?.petId;

    // Criar ou atualizar sessão
    const existingSession = await ctx.db
      .query("whatsappSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existingSession) {
      await ctx.db.patch(existingSession._id, {
        currentPetId: firstPetId,
        state: "IDLE",
        pendingActionPayload: undefined,
      });
    } else {
      await ctx.db.insert("whatsappSessions", {
        userId: user._id,
        currentPetId: firstPetId,
        state: "IDLE",
      });
    }

    return {
      success: true,
      user: await ctx.db.get(user._id),
      petId: firstPetId,
    };
  },
});

export const updateSession = mutation({
  args: {
    userId: v.id("users"),
    currentPetId: v.optional(v.id("pets")),
    state: v.string(),
    pendingActionPayload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        currentPetId: args.currentPetId,
        state: args.state,
        pendingActionPayload: args.pendingActionPayload,
      });
    } else {
      await ctx.db.insert("whatsappSessions", {
        userId: args.userId,
        currentPetId: args.currentPetId,
        state: args.state,
        pendingActionPayload: args.pendingActionPayload,
      });
    }
  },
});

export const logWebhookEvent = mutation({
  args: {
    from: v.string(),
    messageText: v.string(),
    replyText: v.string(),
    status: v.string(),
    metaError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("whatsappWebhookLogs", {
      from: args.from,
      messageText: args.messageText,
      replyText: args.replyText,
      status: args.status,
      metaError: args.metaError,
      timestamp: Date.now(),
    });
  },
});

export const listWebhookLogs = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("whatsappWebhookLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(10);
  },
});


