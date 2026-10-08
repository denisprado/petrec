import { mutation } from "./_generated/server";

export const seed = mutation({
  handler: async (ctx) => {
    // 1. Criar Usuários
    const denisId = await ctx.db.insert("users", {
      name: "Denis Forigo",
      email: "denis@petrec.app",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      whatsappPhoneNumber: "+5519988887777",
      whatsappVerifiedAt: Date.now(),
      timezone: "America/Sao_Paulo",
    });

    const anaId = await ctx.db.insert("users", {
      name: "Ana Silva",
      email: "ana@petrec.app",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
      timezone: "America/Sao_Paulo",
    });

    const joaoId = await ctx.db.insert("users", {
      name: "João Cuidador",
      email: "joao@petrec.app",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      timezone: "America/Sao_Paulo",
    });

    const camilaId = await ctx.db.insert("users", {
      name: "Dra. Camila Ramos",
      email: "camila.vet@petrec.app",
      avatar: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80",
      timezone: "America/Sao_Paulo",
    });

    const carlosId = await ctx.db.insert("users", {
      name: "Carlos Sitter",
      email: "carlos.sitter@petrec.app",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
      timezone: "America/Sao_Paulo",
    });

    // 2. Criar Pets
    const rexId = await ctx.db.insert("pets", {
      name: "Rex",
      species: "Cão",
      breed: "Golden Retriever",
      sex: "Macho",
      birthDate: "2021-04-12",
      weight: 32.5,
      photo: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=500&auto=format&fit=crop&q=80",
      color: "Dourado",
      microchip: "981098109810981",
      notes: "Golden muito dócil, alérgico a pulgas (DAPP) e com displasia leve de quadril.",
    });

    const lunaId = await ctx.db.insert("pets", {
      name: "Luna",
      species: "Gato",
      breed: "Siamês",
      sex: "Fêmea",
      birthDate: "2022-08-20",
      weight: 4.2,
      photo: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500&auto=format&fit=crop&q=80",
      color: "Seal Point",
      notes: "Gata tranquila, castrada, alimentação controlada para evitar ganho de peso.",
    });

    const thorId = await ctx.db.insert("pets", {
      name: "Thor",
      species: "Cão",
      breed: "Bulldog Francês",
      sex: "Macho",
      birthDate: "2023-01-15",
      weight: 12.0,
      photo: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=500&auto=format&fit=crop&q=80",
      color: "Fulvo",
      notes: "Bulldog brincalhão, sensibilidade gástrica.",
    });

    // 3. Vincular Membros aos Pets (RBAC)
    // Rex
    await ctx.db.insert("petMembers", { petId: rexId, userId: denisId, role: "owner", isPrimary: true });
    await ctx.db.insert("petMembers", { petId: rexId, userId: anaId, role: "co_owner", isPrimary: false });
    await ctx.db.insert("petMembers", { petId: rexId, userId: joaoId, role: "caregiver", isPrimary: false });
    await ctx.db.insert("petMembers", {
      petId: rexId,
      userId: camilaId,
      role: "vet_limited",
      isPrimary: false,
      professionalType: "vet",
      crmv: "CRMV-SP 45.890",
      specialties: "Dermatologia Veterinária",
    });
    await ctx.db.insert("petMembers", {
      petId: rexId,
      userId: carlosId,
      role: "caregiver_pro",
      isPrimary: false,
      professionalType: "sitter",
      specialties: "Passeador e Hospedagem",
    });

    // Luna
    await ctx.db.insert("petMembers", { petId: lunaId, userId: denisId, role: "owner", isPrimary: true });
    await ctx.db.insert("petMembers", { petId: lunaId, userId: anaId, role: "co_owner", isPrimary: false });

    // Thor
    await ctx.db.insert("petMembers", { petId: thorId, userId: denisId, role: "owner", isPrimary: true });

    // 4. Estoque Inicial (Ração Rex)
    await ctx.db.insert("inventoryItems", {
      petId: rexId,
      name: "Ração Premier Formula Adulto Raças Grandes",
      category: "racao",
      unit: "g",
      currentQuantity: 12000,
      dailyConsumption: 400,
      purchaseLeadTimeDays: 7,
      referenceDate: new Date().toISOString(),
      status: "OK",
    });

    // 5. WhatsApp Session Denis
    await ctx.db.insert("whatsappSessions", {
      userId: denisId,
      currentPetId: rexId,
      state: "IDLE",
    });

    return {
      success: true,
      denisId,
      rexId,
    };
  },
});
