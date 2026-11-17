import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
];

async function hashPassword(email: string, password: string): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();
  const payload = `${normalizedEmail}:petrec_salt_v1:${password}`;
  const data = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeWhatsappPhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return undefined;
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `+55${digits}`;
  }
  return `+${digits}`;
}

function sanitizeUser(user: any) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return {
    ...rest,
    id: user._id,
    avatar: user.avatar || DEFAULT_AVATARS[0],
    roleDescription: user.roleDescription || "Tutor(a) no PetRec",
    hasPassword: Boolean(passwordHash),
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map(sanitizeUser);
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.toLowerCase().trim();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();
    return sanitizeUser(user);
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return sanitizeUser(user);
  },
});

export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    whatsappPhoneNumber: v.optional(v.string()),
    avatar: v.optional(v.string()),
    roleDescription: v.optional(v.string()),
    linkToExistingPetsRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const name = args.name.trim();
    if (!name) throw new Error("Nome é obrigatório.");
    if (!email || !email.includes("@")) throw new Error("E-mail inválido.");
    if (!args.password || args.password.length < 4) {
      throw new Error("A senha deve ter pelo menos 4 caracteres.");
    }

    const passwordHash = await hashPassword(email, args.password);
    const normalizedPhone = normalizeWhatsappPhone(args.whatsappPhoneNumber);
    const now = Date.now();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    let userId;
    if (existingUser) {
      if (existingUser.passwordHash) {
        throw new Error("Já existe um usuário cadastrado com este e-mail. Faça login.");
      }
      await ctx.db.patch(existingUser._id, {
        name,
        passwordHash,
        ...(normalizedPhone
          ? { whatsappPhoneNumber: normalizedPhone, whatsappVerifiedAt: now }
          : {}),
        ...(args.avatar ? { avatar: args.avatar } : {}),
        ...(args.roleDescription ? { roleDescription: args.roleDescription } : {}),
      });
      userId = existingUser._id;
    } else {
      const avatar =
        args.avatar?.trim() ||
        DEFAULT_AVATARS[name.length % DEFAULT_AVATARS.length];
      userId = await ctx.db.insert("users", {
        name,
        email,
        passwordHash,
        whatsappPhoneNumber: normalizedPhone,
        whatsappVerifiedAt: normalizedPhone ? now : undefined,
        avatar,
        roleDescription: args.roleDescription?.trim() || "Tutor(a) no PetRec",
        timezone: "America/Sao_Paulo",
        createdAt: now,
      });
    }

    const nowIso = new Date().toISOString();

    // Aceitar convites pendentes automaticamente
    const pendingInvites = await ctx.db
      .query("petInvitations")
      .withIndex("by_email", (q) => q.eq("invitedEmail", email))
      .collect();

    for (const inv of pendingInvites) {
      if (!inv.acceptedAt) {
        await ctx.db.patch(inv._id, { acceptedAt: nowIso });
      }
      const existingMember = await ctx.db
        .query("petMembers")
        .withIndex("by_pet_and_user", (q) =>
          q.eq("petId", inv.petId).eq("userId", userId)
        )
        .first();
      if (!existingMember) {
        const expiresAt =
          inv.accessDays && inv.accessDays > 0
            ? new Date(Date.now() + inv.accessDays * 86400000).toISOString()
            : undefined;
        await ctx.db.insert("petMembers", {
          petId: inv.petId,
          userId,
          role: inv.role,
          isPrimary: inv.role === "owner",
          canPrescribe: inv.canPrescribe,
          accessExpiresAt: expiresAt,
        });
      }
    }

    // Opcionalmente vincular aos pets existentes com papel selecionado
    if (args.linkToExistingPetsRole && args.linkToExistingPetsRole.trim() !== "") {
      const roleToAssign = args.linkToExistingPetsRole.trim();
      const allPets = await ctx.db.query("pets").collect();
      for (const pet of allPets) {
        const existingMember = await ctx.db
          .query("petMembers")
          .withIndex("by_pet_and_user", (q) =>
            q.eq("petId", pet._id).eq("userId", userId)
          )
          .first();
        if (!existingMember) {
          await ctx.db.insert("petMembers", {
            petId: pet._id,
            userId,
            role: roleToAssign,
            isPrimary: roleToAssign === "owner",
          });
        }
      }
    }

    if (normalizedPhone) {
      const existingSession = await ctx.db
        .query("whatsappSessions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (!existingSession) {
        const firstMembership = await ctx.db
          .query("petMembers")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
        await ctx.db.insert("whatsappSessions", {
          userId,
          currentPetId: firstMembership?.petId,
          state: "IDLE",
        });
      }
    }

    const createdUser = await ctx.db.get(userId);
    return sanitizeUser(createdUser);
  },
});

export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    if (!email || !args.password) {
      throw new Error("Informe e-mail e senha para entrar.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      throw new Error("Conta não encontrada para este e-mail.");
    }

    const inputHash = await hashPassword(email, args.password);

    if (user.passwordHash) {
      if (user.passwordHash !== inputHash) {
        throw new Error("Senha incorreta.");
      }
    } else {
      // Conta demo ou convidada no primeiro acesso com senha: define a senha agora
      await ctx.db.patch(user._id, {
        passwordHash: inputHash,
      });
    }

    // Marca convites pendentes como aceitos ao logar
    const pendingInvites = await ctx.db
      .query("petInvitations")
      .withIndex("by_email", (q) => q.eq("invitedEmail", email))
      .collect();
    const nowIso = new Date().toISOString();
    for (const inv of pendingInvites) {
      if (!inv.acceptedAt) {
        await ctx.db.patch(inv._id, { acceptedAt: nowIso });
      }
    }

    const refreshed = await ctx.db.get(user._id);
    return sanitizeUser(refreshed);
  },
});

export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    email: v.optional(v.string()),
    avatar: v.optional(v.string()),
    whatsappPhoneNumber: v.optional(v.string()),
    roleDescription: v.optional(v.string()),
    newPassword: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Usuário não encontrado.");

    const nextEmail = args.email ? args.email.toLowerCase().trim() : user.email;
    if (nextEmail !== user.email) {
      if (user.passwordHash && (!args.newPassword || args.newPassword.trim().length === 0)) {
        throw new Error("Para alterar o e-mail de login, informe também uma nova senha.");
      }
      const collision = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", nextEmail))
        .first();
      if (collision && collision._id !== user._id) {
        throw new Error("Este e-mail já está em uso por outra conta.");
      }
    }

    const normalizedPhone =
      args.whatsappPhoneNumber !== undefined
        ? normalizeWhatsappPhone(args.whatsappPhoneNumber)
        : user.whatsappPhoneNumber;

    const patchData: Record<string, any> = {
      name: args.name.trim() || user.name,
      email: nextEmail,
      whatsappPhoneNumber: normalizedPhone,
    };

    if (args.whatsappPhoneNumber !== undefined) {
      patchData.whatsappVerifiedAt = normalizedPhone ? Date.now() : undefined;
    }

    if (args.avatar !== undefined) {
      patchData.avatar = args.avatar.trim() || user.avatar;
    }
    if (args.roleDescription !== undefined) {
      patchData.roleDescription = args.roleDescription.trim() || user.roleDescription;
    }
    if (args.newPassword && args.newPassword.trim().length > 0) {
      if (args.newPassword.length < 4) {
        throw new Error("A nova senha deve ter pelo menos 4 caracteres.");
      }
      patchData.passwordHash = await hashPassword(nextEmail, args.newPassword);
    }

    await ctx.db.patch(args.userId, patchData);

    if (normalizedPhone) {
      const existingSession = await ctx.db
        .query("whatsappSessions")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .first();
      if (!existingSession) {
        const firstMembership = await ctx.db
          .query("petMembers")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .first();
        await ctx.db.insert("whatsappSessions", {
          userId: args.userId,
          currentPetId: firstMembership?.petId,
          state: "IDLE",
        });
      }
    }

    const updated = await ctx.db.get(args.userId);
    return sanitizeUser(updated);
  },
});

export const inviteOrAddMember = mutation({
  args: {
    petId: v.id("pets"),
    invitedEmail: v.string(),
    invitedName: v.optional(v.string()),
    invitedById: v.optional(v.id("users")),
    role: v.string(),
    accessDays: v.optional(v.number()),
    canPrescribe: v.optional(v.boolean()),
    crmv: v.optional(v.string()),
    clinicName: v.optional(v.string()),
    specialties: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.invitedEmail.toLowerCase().trim();
    if (!email || !email.includes("@")) {
      throw new Error("E-mail do convidado inválido.");
    }

    const pet = await ctx.db.get(args.petId);
    if (!pet) throw new Error("Pet não encontrado.");

    // 1. Buscar ou criar o usuário pelo e-mail
    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    const defaultName =
      args.invitedName?.trim() ||
      email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

    if (!user) {
      const userId = await ctx.db.insert("users", {
        name: defaultName,
        email,
        avatar: DEFAULT_AVATARS[defaultName.length % DEFAULT_AVATARS.length],
        roleDescription:
          args.role === "vet_limited"
            ? "Médico Veterinário"
            : args.role === "caregiver_pro"
            ? "Pet Sitter / Cuidador Pro"
            : args.role === "clinic_admin"
            ? "Clínica / Recepção"
            : "Tutor(a) convidado(a)",
        timezone: "America/Sao_Paulo",
        createdAt: Date.now(),
      });
      user = await ctx.db.get(userId);
    }

    if (!user) throw new Error("Falha ao criar usuário convidado.");

    // 2. Criar ou atualizar vínculo em petMembers
    const accessExpiresAt =
      args.accessDays && args.accessDays > 0
        ? new Date(Date.now() + args.accessDays * 86400000).toISOString()
        : undefined;

    const existingMember = await ctx.db
      .query("petMembers")
      .withIndex("by_pet_and_user", (q) =>
        q.eq("petId", args.petId).eq("userId", user!._id)
      )
      .first();

    let memberId;
    if (existingMember) {
      await ctx.db.patch(existingMember._id, {
        role: args.role,
        accessExpiresAt,
        canPrescribe: args.canPrescribe,
        crmv: args.crmv,
        clinicName: args.clinicName,
        specialties: args.specialties,
      });
      memberId = existingMember._id;
    } else {
      memberId = await ctx.db.insert("petMembers", {
        petId: args.petId,
        userId: user._id,
        role: args.role,
        isPrimary: args.role === "owner",
        accessExpiresAt,
        canPrescribe: args.canPrescribe,
        crmv: args.crmv,
        clinicName: args.clinicName,
        specialties: args.specialties,
      });
    }

    // 3. Registrar convite em petInvitations
    const token = `petrec_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const nowIso = new Date().toISOString();
    const invitationId = await ctx.db.insert("petInvitations", {
      petId: args.petId,
      invitedEmail: email,
      invitedName: args.invitedName?.trim() || user.name,
      invitedById: args.invitedById,
      role: args.role,
      token,
      accessDays: args.accessDays,
      canPrescribe: args.canPrescribe,
      createdAt: nowIso,
      acceptedAt: user.passwordHash ? nowIso : undefined,
    });

    // 4. Auditoria
    await ctx.db.insert("activityLogs", {
      petId: args.petId,
      userId: args.invitedById,
      action: `convidou/vinculou ${user.name} (${email}) como ${args.role}`,
      entityType: "petMember",
      entityId: memberId,
    });

    const invitation = await ctx.db.get(invitationId);
    const member = await ctx.db.get(memberId);

    return {
      invitation: invitation ? { ...invitation, id: invitation._id } : null,
      member: member ? { ...member, id: member._id, user: sanitizeUser(user) } : null,
      user: sanitizeUser(user),
    };
  },
});

export const removeMemberOrInvite = mutation({
  args: {
    petId: v.optional(v.id("pets")),
    memberId: v.optional(v.id("petMembers")),
    invitationId: v.optional(v.id("petInvitations")),
  },
  handler: async (ctx, args) => {
    if (args.memberId) {
      const member = await ctx.db.get(args.memberId);
      if (member && !member.isPrimary) {
        await ctx.db.delete(args.memberId);
      } else if (member?.isPrimary) {
        throw new Error("Não é possível remover o proprietário principal do pet.");
      }
    }
    if (args.invitationId) {
      const invite = await ctx.db.get(args.invitationId);
      if (invite) {
        await ctx.db.delete(args.invitationId);
      }
    }
    return { success: true };
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
