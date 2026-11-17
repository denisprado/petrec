import { mutation } from "./_generated/server";

const MOCK_PET_NAMES = new Set(["Rex", "Luna", "Thor"]);

export const purgeMockData = mutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    const realUser = allUsers.find(
      (u) => u.email.toLowerCase().trim() === "denisforigo@gmail.com"
    );

    const mockUsers = allUsers.filter((u) =>
      u.email.toLowerCase().trim().endsWith("@petrec.app")
    );

    let removedUsersCount = 0;
    let removedMembersCount = 0;
    let removedPetsCount = 0;

    // 1. Garantir WhatsApp normalizado para o usuário real antes de remover os mocks
    if (realUser) {
      const digits = (realUser.whatsappPhoneNumber || "").replace(/[^\d]/g, "");
      let normalizedPhone = realUser.whatsappPhoneNumber;
      if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
        normalizedPhone = `+55${digits}`;
      } else if (digits.length >= 12 && !realUser.whatsappPhoneNumber?.startsWith("+")) {
        normalizedPhone = `+${digits}`;
      }
      if (normalizedPhone && normalizedPhone !== realUser.whatsappPhoneNumber) {
        await ctx.db.patch(realUser._id, {
          whatsappPhoneNumber: normalizedPhone,
          whatsappVerifiedAt: realUser.whatsappVerifiedAt || Date.now(),
        });
      } else if (realUser.whatsappPhoneNumber && !realUser.whatsappVerifiedAt) {
        await ctx.db.patch(realUser._id, {
          whatsappVerifiedAt: Date.now(),
        });
      }

      const realSession = await ctx.db
        .query("whatsappSessions")
        .withIndex("by_user", (q) => q.eq("userId", realUser._id))
        .first();
      if (!realSession) {
        const realMemberships = await ctx.db
          .query("petMembers")
          .withIndex("by_user", (q) => q.eq("userId", realUser._id))
          .collect();
        const firstRealPetId = realMemberships[0]?.petId;
        await ctx.db.insert("whatsappSessions", {
          userId: realUser._id,
          currentPetId: firstRealPetId,
          state: "IDLE",
        });
      }
    }

    // 2. Remover sessões, tokens, vínculos e registros dos usuários mockados (@petrec.app)
    for (const mu of mockUsers) {
      const memberships = await ctx.db
        .query("petMembers")
        .withIndex("by_user", (q) => q.eq("userId", mu._id))
        .collect();
      for (const m of memberships) {
        await ctx.db.delete(m._id);
        removedMembersCount++;
      }

      const sessions = await ctx.db
        .query("whatsappSessions")
        .withIndex("by_user", (q) => q.eq("userId", mu._id))
        .collect();
      for (const s of sessions) await ctx.db.delete(s._id);

      const tokens = await ctx.db
        .query("whatsappPairingTokens")
        .withIndex("by_user", (q) => q.eq("userId", mu._id))
        .collect();
      for (const t of tokens) await ctx.db.delete(t._id);

      await ctx.db.delete(mu._id);
      removedUsersCount++;
    }

    // 3. Remover convites antigos ligados a e-mails @petrec.app
    const allInvitations = await ctx.db.query("petInvitations").collect();
    for (const inv of allInvitations) {
      if (inv.invitedEmail.toLowerCase().trim().endsWith("@petrec.app")) {
        await ctx.db.delete(inv._id);
      }
    }

    // 4. Remover pets mockados de seed (Rex, Luna, Thor) e seus dependentes
    const allPets = await ctx.db.query("pets").collect();
    for (const pet of allPets) {
      if (!MOCK_PET_NAMES.has(pet.name)) continue;

      const members = await ctx.db
        .query("petMembers")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const m of members) await ctx.db.delete(m._id);

      const invitations = await ctx.db
        .query("petInvitations")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const inv of invitations) await ctx.db.delete(inv._id);

      const meds = await ctx.db
        .query("medications")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const med of meds) {
        const schedules = await ctx.db
          .query("medicationSchedules")
          .withIndex("by_medication", (q) => q.eq("medicationId", med._id))
          .collect();
        for (const s of schedules) await ctx.db.delete(s._id);
        await ctx.db.delete(med._id);
      }

      const adms = await ctx.db
        .query("medicationAdministrations")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const a of adms) await ctx.db.delete(a._id);

      const items = await ctx.db
        .query("inventoryItems")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const item of items) {
        const txs = await ctx.db
          .query("inventoryTransactions")
          .withIndex("by_item", (q) => q.eq("inventoryItemId", item._id))
          .collect();
        for (const t of txs) await ctx.db.delete(t._id);
        await ctx.db.delete(item._id);
      }

      const purchases = await ctx.db
        .query("purchases")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const p of purchases) {
        const pItems = await ctx.db
          .query("purchaseItems")
          .withIndex("by_purchase", (q) => q.eq("purchaseId", p._id))
          .collect();
        for (const pi of pItems) await ctx.db.delete(pi._id);
        await ctx.db.delete(p._id);
      }

      const shopping = await ctx.db
        .query("shoppingListItems")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const s of shopping) await ctx.db.delete(s._id);

      const weights = await ctx.db
        .query("weightRecords")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const w of weights) await ctx.db.delete(w._id);

      const vacs = await ctx.db
        .query("vaccinations")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const v of vacs) await ctx.db.delete(v._id);

      const apps = await ctx.db
        .query("appointments")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const a of apps) await ctx.db.delete(a._id);

      const healthEvents = await ctx.db
        .query("healthEvents")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const he of healthEvents) await ctx.db.delete(he._id);

      const notes = await ctx.db
        .query("clinicalNotes")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const n of notes) await ctx.db.delete(n._id);

      const logs = await ctx.db
        .query("activityLogs")
        .withIndex("by_pet", (q) => q.eq("petId", pet._id))
        .collect();
      for (const l of logs) await ctx.db.delete(l._id);

      await ctx.db.delete(pet._id);
      removedPetsCount++;
    }

    return {
      success: true,
      removedUsersCount,
      removedMembersCount,
      removedPetsCount,
      preservedRealUser: realUser ? realUser.email : null,
    };
  },
});
