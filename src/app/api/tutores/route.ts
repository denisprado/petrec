import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

function extractCleanError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (!raw) return fallback;
  const uncaughtMatch = raw.match(/Uncaught Error:\s*([^\n\r]+)/i);
  if (uncaughtMatch?.[1]) {
    return uncaughtMatch[1].replace(/\s+at\s+handler.*$/i, "").trim();
  }
  return raw.split("\n")[0].trim() || fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");
  const code = searchParams.get("code");

  try {
    if (code) {
      const lookup = await convex.query(api.users.getInviteOrPetByCode, {
        code: String(code),
      });
      return NextResponse.json(lookup);
    }

    const allUsers = await convex.query(api.users.list, {});

    if (!petId) {
      return NextResponse.json({ members: [], invitations: [], allUsers, pet: null });
    }

    const pet = await convex.query(api.pets.getById, { petId: petId as any });
    const members = (pet as any)?.members || [];
    const invitations = (pet as any)?.invitations || [];

    return NextResponse.json({
      members,
      invitations,
      allUsers,
      pet: pet
        ? {
            id: (pet as any)._id,
            name: pet.name,
            species: pet.species,
            shareCode: (pet as any).shareCode,
          }
        : null,
    });
  } catch (error: any) {
    console.error("GET /api/tutores error:", error);
    return NextResponse.json(
      { error: extractCleanError(error, "Erro ao buscar tutores.") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body?.action === "join_by_code") {
      const { userId, code, preferredRole } = body;
      if (!userId || !code || !String(code).trim()) {
        return NextResponse.json(
          { error: "Informe o usuário e o código ou ID do pet." },
          { status: 400 }
        );
      }

      const joined = await convex.mutation(api.users.joinPetByCode, {
        userId: userId as any,
        code: String(code).trim(),
        preferredRole: preferredRole ? String(preferredRole) : undefined,
      });

      return NextResponse.json({
        success: true,
        ...joined,
        message: `Vinculado ao pet ${joined.pet?.name || ""} com sucesso!`,
      });
    }

    const {
      petId,
      invitedEmail,
      invitedPhone,
      invitedName,
      invitedById,
      role = "caregiver",
      accessDays,
      canPrescribe,
      crmv,
      clinicName,
      specialties,
    } = body;

    if (!petId) {
      return NextResponse.json(
        { error: "Selecione um pet para gerar o convite." },
        { status: 400 }
      );
    }

    const validInvitedById =
      invitedById && typeof invitedById === "string" && invitedById.length > 10
        ? (invitedById as any)
        : undefined;

    const result = await convex.mutation(api.users.inviteOrAddMember, {
      petId: petId as any,
      invitedEmail: invitedEmail ? String(invitedEmail) : undefined,
      invitedPhone: invitedPhone ? String(invitedPhone) : undefined,
      invitedName: invitedName ? String(invitedName) : undefined,
      invitedById: validInvitedById,
      role: String(role),
      accessDays:
        typeof accessDays === "number" && Number.isFinite(accessDays)
          ? accessDays
          : undefined,
      canPrescribe: typeof canPrescribe === "boolean" ? canPrescribe : undefined,
      crmv: crmv ? String(crmv) : undefined,
      clinicName: clinicName ? String(clinicName) : undefined,
      specialties: specialties ? String(specialties) : undefined,
    });

    return NextResponse.json({
      success: true,
      invitation: result.invitation,
      member: result.member,
      user: result.user,
      message: invitedEmail
        ? `Tutor ${invitedEmail} vinculado com sucesso!`
        : `Convite ${result.invitation?.token || ""} criado com sucesso!`,
    });
  } catch (error: any) {
    console.error("POST /api/tutores error:", error);
    return NextResponse.json(
      { error: extractCleanError(error, "Erro ao vincular tutor.") },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    const memberId = searchParams.get("memberId");
    const invitationId = searchParams.get("invitationId");

    if (!memberId && !invitationId) {
      return NextResponse.json(
        { error: "Informe memberId ou invitationId para remover." },
        { status: 400 }
      );
    }

    await convex.mutation(api.users.removeMemberOrInvite, {
      petId: petId ? (petId as any) : undefined,
      memberId: memberId ? (memberId as any) : undefined,
      invitationId: invitationId ? (invitationId as any) : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/tutores error:", error);
    return NextResponse.json(
      { error: extractCleanError(error, "Erro ao remover acesso.") },
      { status: 400 }
    );
  }
}
