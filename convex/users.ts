import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const updateWhatsApp = mutation({
  args: {
    userId: v.id("users"),
    phone: v.optional(v.string()),
    isVerified: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      whatsappPhoneNumber: args.phone,
      whatsappVerifiedAt: args.isVerified ? Date.now() : undefined,
    });
  },
});

export const getPairingToken = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const tokenDoc = await ctx.db
      .query("whatsappPairingTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();

    if (tokenDoc && tokenDoc.expiresAt > now) {
      return tokenDoc;
    }
    return null;
  },
});

export const createPairingToken = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Delete existing
    const existing = await ctx.db
      .query("whatsappPairingTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const t of existing) await ctx.db.delete(t._id);

    return await ctx.db.insert("whatsappPairingTokens", {
      userId: args.userId,
      token: args.token,
      expiresAt: args.expiresAt,
    });
  },
});

export const disconnectWhatsApp = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      whatsappPhoneNumber: undefined,
      whatsappVerifiedAt: undefined,
    });

    const sessions = await ctx.db
      .query("whatsappSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const s of sessions) await ctx.db.delete(s._id);

    const tokens = await ctx.db
      .query("whatsappPairingTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const t of tokens) await ctx.db.delete(t._id);
  },
});
