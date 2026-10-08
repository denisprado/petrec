import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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

    return {
      weights,
      vaccines,
      appointments,
      clinicalNotes,
      healthEvents,
    };
  },
});

export const recordWeight = mutation({
  args: {
    petId: v.id("pets"),
    userId: v.id("users"),
    weight: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("weightRecords", {
      petId: args.petId,
      weight: args.weight,
      date: new Date().toISOString(),
      notes: args.notes,
    });

    await ctx.db.patch(args.petId, {
      weight: args.weight,
    });

    await ctx.db.insert("activityLogs", {
      petId: args.petId,
      userId: args.userId,
      action: `registrou peso de ${args.weight} kg`,
      entityType: "pet",
      entityId: args.petId,
    });
  },
});
