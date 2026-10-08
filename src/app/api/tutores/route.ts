import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  if (!petId) {
    return NextResponse.json({ error: "petId é obrigatório" }, { status: 400 });
  }

  try {
    const [members, invitations, allUsers] = await Promise.all([
      prisma.petMember.findMany({
        where: { petId },
        include: {
          user: {
            include: { professionalProfile: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.petInvitation.findMany({
        where: { petId },
        include: { invitedBy: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
        include: { professionalProfile: true },
      }),
    ]);

    return NextResponse.json({ members, invitations, allUsers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      petId,
      invitedEmail,
      invitedById,
      role = "caregiver",
      professionalType,
      accessDays,
      canPrescribe,
      canViewFullHistory = true,
    } = body;

    if (!petId || !invitedEmail || !invitedById) {
      return NextResponse.json(
        { error: "Dados incompletos para enviar convite" },
        { status: 400 }
      );
    }

    // Verifica se já é membro
    const existingUser = await prisma.user.findUnique({
      where: { email: invitedEmail },
      include: { professionalProfile: true },
    });

    if (existingUser) {
      const alreadyMember = await prisma.petMember.findUnique({
        where: {
          petId_userId: {
            petId,
            userId: existingUser.id,
          },
        },
      });

      if (alreadyMember) {
        return NextResponse.json(
          { error: "Este usuário ou profissional já é membro deste pet" },
          { status: 400 }
        );
      }
    }

    // Determinar permissões profissionais padrão
    const finalProfessionalType =
      professionalType ||
      (role === "vet_limited"
        ? "vet"
        : role === "clinic_admin"
        ? "clinic"
        : role === "caregiver_pro"
        ? "sitter"
        : null);

    const calculatedCanPrescribe =
      canPrescribe !== undefined
        ? Boolean(canPrescribe)
        : role === "vet_limited";

    // Criar convite com token seguro
    const token = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = addDays(new Date(), 7);
    const accessDaysNum = accessDays ? Number(accessDays) : null;

    const invitation = await prisma.petInvitation.create({
      data: {
        petId,
        invitedEmail,
        invitedById,
        role,
        professionalType: finalProfessionalType,
        accessDays: accessDaysNum,
        token,
        expiresAt,
      },
    });

    // Se o usuário já existe na base (ex: demonstração), associar diretamente como membro ativo
    if (existingUser) {
      const accessExpiresAt = accessDaysNum
        ? addDays(new Date(), accessDaysNum)
        : null;

      await prisma.petMember.create({
        data: {
          petId,
          userId: existingUser.id,
          role,
          professionalType:
            finalProfessionalType ||
            existingUser.professionalProfile?.professionalType ||
            null,
          accessExpiresAt,
          canPrescribe: calculatedCanPrescribe,
          canViewFullHistory,
        },
      });

      await prisma.petInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
    }

    // Registrar no audit log
    await prisma.activityLog.create({
      data: {
        petId,
        userId: invitedById,
        action: `adicionou/convidou "${invitedEmail}" como ${role}`,
        entityType: "member",
        entityId: invitation.id,
      },
    });

    return NextResponse.json({
      success: true,
      invitation,
      directLinked: Boolean(existingUser),
    });
  } catch (error: any) {
    console.error("Tutores POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    const memberId = searchParams.get("memberId");
    const invitationId = searchParams.get("invitationId");
    const userId = searchParams.get("userId"); // Quem está executando a ação

    if (memberId) {
      const member = await prisma.petMember.findUnique({
        where: { id: memberId },
        include: { user: true },
      });

      if (!member) {
        return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
      }

      if (member.role === "owner" && member.isPrimary) {
        return NextResponse.json(
          { error: "Não é permitido remover o proprietário principal" },
          { status: 400 }
        );
      }

      await prisma.petMember.delete({ where: { id: memberId } });

      if (userId && petId) {
        await prisma.activityLog.create({
          data: {
            petId,
            userId,
            action: `removeu o acesso de "${member.user.name}" (${member.role})`,
            entityType: "member",
            entityId: memberId,
          },
        });
      }

      return NextResponse.json({ success: true, message: "Acesso revogado com sucesso" });
    }

    if (invitationId) {
      await prisma.petInvitation.delete({ where: { id: invitationId } });
      return NextResponse.json({ success: true, message: "Convite cancelado com sucesso" });
    }

    return NextResponse.json({ error: "Parâmetros insuficientes" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
