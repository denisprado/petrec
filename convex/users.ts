import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  getDefaultNotificationPreferences,
  notificationPreferencesPartialValidator,
  notificationPreferencesValidator,
  NotificationPreferences,
  resolveNotificationPreferences,
} from "./notificationPrefs";

const SHARE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRandomCode(prefix: string): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += SHARE_CODE_CHARS.charAt(
      Math.floor(Math.random() * SHARE_CODE_CHARS.length)
    );
  }
  return `${prefix}-${suffix}`;
}

function derivePetShareCode(pet: { _id: any; shareCode?: string }): string {
  return pet.shareCode || `PET-${String(pet._id).slice(-6).toUpperCase()}`;
}

async function resolveInviteOrPetCode(
  ctx: QueryCtx | MutationCtx,
  rawCode: string
) {
  const trimmed = rawCode.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/convite\/([^/?#\s]+)/i);
  const cleanCode = decodeURIComponent(urlMatch ? urlMatch[1] : trimmed).trim();
  if (!cleanCode) return null;

  const candidates = Array.from(
    new Set([cleanCode, cleanCode.toUpperCase(), cleanCode.toLowerCase()])
  );

  for (const candidate of candidates) {
    const inv = await ctx.db
      .query("petInvitations")
      .withIndex("by_token", (q) => q.eq("token", candidate))
      .first();
    if (inv) {
      const pet = await ctx.db.get(inv.petId);
      if (!pet) return null;
      const inviter = inv.invitedById ? await ctx.db.get(inv.invitedById) : null;
      return {
        kind: "invitation" as const,
        invitation: inv,
        pet,
        inviter,
      };
    }
  }

  const upperCode = cleanCode.toUpperCase();
  const petByShareCode = await ctx.db
    .query("pets")
    .withIndex("by_share_code", (q) => q.eq("shareCode", upperCode))
    .first();

  if (petByShareCode) {
    return {
      kind: "pet" as const,
      pet: petByShareCode,
    };
  }

  const allPets = await ctx.db.query("pets").collect();
  const matchedPet = allPets.find(
    (p) =>
      derivePetShareCode(p).toUpperCase() === upperCode ||
      String(p._id) === cleanCode
  );

  if (matchedPet) {
    return {
      kind: "pet" as const,
      pet: matchedPet,
    };
  }

  return null;
}

async function applyCodeLinkForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  rawCode: string,
  preferredRole?: string
) {
  const resolved = await resolveInviteOrPetCode(ctx, rawCode);
  if (!resolved) {
    throw new Error("Código de convite ou ID do pet inválido ou não encontrado.");
  }

  const nowIso = new Date().toISOString();
  const pet = resolved.pet;
  let role = preferredRole && preferredRole !== "owner" ? preferredRole : "caregiver";
  let accessDays: number | undefined;
  let canPrescribe: boolean | undefined;
  let notificationPreferences = getDefaultNotificationPreferences(role);

  if (resolved.kind === "invitation") {
    const inv = resolved.invitation;
    role = inv.role || "caregiver";
    accessDays = inv.accessDays;
    canPrescribe = inv.canPrescribe;
    notificationPreferences = resolveNotificationPreferences(
      role,
      inv.notificationPreferences
    );

    await ctx.db.patch(inv._id, {
      acceptedAt: nowIso,
      acceptedByUserId: userId,
    });
  }

  const accessExpiresAt =
    accessDays && accessDays > 0
      ? new Date(Date.now() + accessDays * 86400000).toISOString()
      : undefined;

  const existingMember = await ctx.db
    .query("petMembers")
    .withIndex("by_pet_and_user", (q) =>
      q.eq("petId", pet._id).eq("userId", userId)
    )
    .first();

  let memberId;
  if (existingMember) {
    memberId = existingMember._id;
    if (!existingMember.isPrimary && existingMember.role === "viewer" && role !== "viewer") {
      await ctx.db.patch(existingMember._id, {
        role,
        ...(accessExpiresAt ? { accessExpiresAt } : {}),
        ...(canPrescribe !== undefined ? { canPrescribe } : {}),
        notificationPreferences: resolveNotificationPreferences(
          role,
          existingMember.notificationPreferences || notificationPreferences
        ),
      });
    }
  } else {
    memberId = await ctx.db.insert("petMembers", {
      petId: pet._id,
      userId,
      role,
      isPrimary: false,
      canPrescribe,
      accessExpiresAt,
      notifyWhatsApp: true,
      notificationPreferences,
    });
  }

  const session = await ctx.db
    .query("whatsappSessions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (session && !session.currentPetId) {
    await ctx.db.patch(session._id, {
      currentPetId: pet._id,
      state: "IDLE",
    });
  }

  await ctx.db.insert("activityLogs", {
    petId: pet._id,
    userId,
    action: `vinculou-se ao pet ${pet.name} usando código (${rawCode.trim()})`,
    entityType: "petMember",
    entityId: memberId,
  });

  return {
    pet: {
      ...pet,
      id: pet._id,
      shareCode: derivePetShareCode(pet),
    },
    role,
    memberId,
  };
}

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

export const getInviteOrPetByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveInviteOrPetCode(ctx, args.code);
    if (!resolved) {
      return { found: false };
    }

    const petSummary = {
      id: resolved.pet._id,
      name: resolved.pet.name,
      species: resolved.pet.species,
      breed: resolved.pet.breed,
      photo: resolved.pet.photo,
      shareCode: derivePetShareCode(resolved.pet),
    };

    if (resolved.kind === "invitation") {
      const inv = resolved.invitation;
      return {
        found: true,
        kind: "invitation",
        code: inv.token,
        role: inv.role,
        accessDays: inv.accessDays,
        canPrescribe: inv.canPrescribe,
        invitedEmail: inv.invitedEmail,
        invitedName: inv.invitedName,
        acceptedAt: inv.acceptedAt,
        inviterName: resolved.inviter?.name || "Um tutor no PetRec",
        pet: petSummary,
      };
    }

    return {
      found: true,
      kind: "pet",
      code: petSummary.shareCode,
      role: "caregiver",
      pet: petSummary,
    };
  },
});

export const joinPetByCode = mutation({
  args: {
    userId: v.id("users"),
    code: v.string(),
    preferredRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Usuário não encontrado.");
    return await applyCodeLinkForUser(
      ctx,
      args.userId,
      args.code,
      args.preferredRole
    );
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
    inviteCode: v.optional(v.string()),
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
          notifyWhatsApp: true,
          notificationPreferences: resolveNotificationPreferences(
            inv.role,
            inv.notificationPreferences
          ),
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
            notifyWhatsApp: true,
            notificationPreferences: getDefaultNotificationPreferences(roleToAssign),
          });
        }
      }
    }

    let linkedPet: any = null;
    if (args.inviteCode && args.inviteCode.trim().length > 0) {
      const linked = await applyCodeLinkForUser(ctx, userId, args.inviteCode.trim());
      linkedPet = linked.pet;
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
    const sanitized = sanitizeUser(createdUser);
    return linkedPet ? { ...sanitized, linkedPet } : sanitized;
  },
});

export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    inviteCode: v.optional(v.string()),
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
        await ctx.db.patch(inv._id, {
          acceptedAt: nowIso,
          acceptedByUserId: user._id,
        });
      }
    }

    let linkedPet: any = null;
    if (args.inviteCode && args.inviteCode.trim().length > 0) {
      const linked = await applyCodeLinkForUser(ctx, user._id, args.inviteCode.trim());
      linkedPet = linked.pet;
    }

    const refreshed = await ctx.db.get(user._id);
    const sanitized = sanitizeUser(refreshed);
    return linkedPet ? { ...sanitized, linkedPet } : sanitized;
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
    invitedEmail: v.optional(v.string()),
    invitedPhone: v.optional(v.string()),
    invitedName: v.optional(v.string()),
    invitedById: v.optional(v.id("users")),
    role: v.string(),
    accessDays: v.optional(v.number()),
    canPrescribe: v.optional(v.boolean()),
    crmv: v.optional(v.string()),
    clinicName: v.optional(v.string()),
    specialties: v.optional(v.string()),
    notificationPreferences: v.optional(notificationPreferencesValidator),
  },
  handler: async (ctx, args) => {
    const email = args.invitedEmail ? args.invitedEmail.toLowerCase().trim() : "";
    if (email && !email.includes("@")) {
      throw new Error("E-mail do convidado inválido.");
    }
    const normalizedPhone = normalizeWhatsappPhone(args.invitedPhone);

    const pet = await ctx.db.get(args.petId);
    if (!pet) throw new Error("Pet não encontrado.");

    // 1. Buscar usuário existente pelo e-mail ou telefone (e pré-criar apenas se e-mail informado)
    let user = email
      ? await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", email))
          .first()
      : null;

    if (!user && normalizedPhone) {
      user = await ctx.db
        .query("users")
        .withIndex("by_whatsapp", (q) => q.eq("whatsappPhoneNumber", normalizedPhone))
        .first();
    }

    if (!user && email) {
      const defaultName =
        args.invitedName?.trim() ||
        email
          .split("@")[0]
          .replace(/[._-]+/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());

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
        ...(normalizedPhone
          ? { whatsappPhoneNumber: normalizedPhone, whatsappVerifiedAt: Date.now() }
          : {}),
        createdAt: Date.now(),
      });
      user = await ctx.db.get(userId);
      if (!user) throw new Error("Falha ao criar usuário convidado.");
    }

    // 2. Criar ou atualizar vínculo em petMembers quando houver usuário identificado
    const accessExpiresAt =
      args.accessDays && args.accessDays > 0
        ? new Date(Date.now() + args.accessDays * 86400000).toISOString()
        : undefined;
    const effectiveNotificationPrefs = resolveNotificationPreferences(
      args.role,
      args.notificationPreferences
    );

    let memberId = null;
    if (user) {
      const existingMember = await ctx.db
        .query("petMembers")
        .withIndex("by_pet_and_user", (q) =>
          q.eq("petId", args.petId).eq("userId", user!._id)
        )
        .first();

      if (existingMember) {
        const nextMemberPrefs = args.notificationPreferences
          ? effectiveNotificationPrefs
          : resolveNotificationPreferences(
              args.role,
              existingMember.notificationPreferences
            );
        await ctx.db.patch(existingMember._id, {
          role: args.role,
          accessExpiresAt,
          canPrescribe: args.canPrescribe,
          crmv: args.crmv,
          clinicName: args.clinicName,
          specialties: args.specialties,
          notificationPreferences: nextMemberPrefs,
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
          notifyWhatsApp: true,
          notificationPreferences: effectiveNotificationPrefs,
        });
      }
    }

    // 3. Gerar token curto amigável (CONV-XXXXXX) e registrar convite em petInvitations
    let token = generateRandomCode("CONV");
    for (let attempt = 0; attempt < 5; attempt++) {
      const collision = await ctx.db
        .query("petInvitations")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
      if (!collision) break;
      token = generateRandomCode("CONV");
    }

    const nowIso = new Date().toISOString();
    const invitationId = await ctx.db.insert("petInvitations", {
      petId: args.petId,
      invitedEmail: email || "",
      invitedPhone: normalizedPhone,
      invitedName: args.invitedName?.trim() || user?.name,
      invitedById: args.invitedById,
      role: args.role,
      token,
      accessDays: args.accessDays,
      canPrescribe: args.canPrescribe,
      notificationPreferences: effectiveNotificationPrefs,
      createdAt: nowIso,
      acceptedAt: user?.passwordHash ? nowIso : undefined,
      acceptedByUserId: user?.passwordHash ? user._id : undefined,
    });

    // 4. Auditoria
    await ctx.db.insert("activityLogs", {
      petId: args.petId,
      userId: args.invitedById,
      action: user
        ? `convidou/vinculou ${user.name} (${email || normalizedPhone || token}) como ${args.role}`
        : `gerou código de convite ${token}${args.invitedName ? ` para ${args.invitedName.trim()}` : ""} (${args.role})`,
      entityType: memberId ? "petMember" : "petInvitation",
      entityId: memberId || invitationId,
    });

    const invitation = await ctx.db.get(invitationId);
    const member = memberId ? await ctx.db.get(memberId) : null;

    return {
      invitation: invitation ? { ...invitation, id: invitation._id } : null,
      member:
        member && user
          ? { ...member, id: member._id, user: sanitizeUser(user) }
          : null,
      user: user ? sanitizeUser(user) : null,
    };
  },
});

export const toggleMemberWhatsAppNotifications = mutation({
  args: {
    memberId: v.id("petMembers"),
    notifyWhatsApp: v.optional(v.boolean()),
    notificationPreferences: v.optional(notificationPreferencesValidator),
    categoryUpdates: v.optional(notificationPreferencesPartialValidator),
    actorUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error("Vínculo de membro não encontrado.");
    }

    if (args.actorUserId && String(member.userId) !== String(args.actorUserId)) {
      const actorMember = await ctx.db
        .query("petMembers")
        .withIndex("by_pet_and_user", (q) =>
          q.eq("petId", member.petId).eq("userId", args.actorUserId!)
        )
        .first();

      const canManageOthers =
        Boolean(actorMember) &&
        (actorMember!.isPrimary === true ||
          actorMember!.role === "owner" ||
          actorMember!.role === "co_owner");

      if (!canManageOthers) {
        throw new Error(
          "Apenas o proprietário do pet ou o próprio usuário pode alterar estas notificações."
        );
      }
    }

    const basePrefs = resolveNotificationPreferences(
      member.role,
      member.notificationPreferences
    );
    const nextPrefs: NotificationPreferences = args.notificationPreferences
      ? { ...args.notificationPreferences }
      : { ...basePrefs };

    let activatedAnyCategory = false;
    if (args.categoryUpdates) {
      for (const [key, val] of Object.entries(args.categoryUpdates)) {
        if (typeof val === "boolean" && key in nextPrefs) {
          nextPrefs[key as keyof NotificationPreferences] = val;
          if (val) activatedAnyCategory = true;
        }
      }
    }

    let nextNotifyWhatsApp =
      member.notifyWhatsApp === undefined ? true : member.notifyWhatsApp;
    if (typeof args.notifyWhatsApp === "boolean") {
      nextNotifyWhatsApp = args.notifyWhatsApp;
    } else if (activatedAnyCategory && member.notifyWhatsApp === false) {
      nextNotifyWhatsApp = true;
    }

    await ctx.db.patch(args.memberId, {
      notifyWhatsApp: nextNotifyWhatsApp,
      notificationPreferences: nextPrefs,
    });

    return {
      success: true,
      notifyWhatsApp: nextNotifyWhatsApp,
      notificationPreferences: nextPrefs,
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
