import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/permissions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");
  const userId = searchParams.get("userId");

  try {
    let targetPetId: string | undefined = petId || undefined;
    if (!targetPetId) {
      const firstPet = await prisma.pet.findFirst();
      targetPetId = firstPet?.id;
    }

    if (!targetPetId) {
      return NextResponse.json({ notes: [], canViewPrivateVetNotes: false });
    }

    // Determinar permissões do usuário que está consultando
    let canViewPrivateVetNotes = false;

    if (userId) {
      const membership = await prisma.petMember.findUnique({
        where: {
          petId_userId: { petId: targetPetId, userId },
        },
      });

      if (membership) {
        const perms = getRolePermissions(membership.role);
        canViewPrivateVetNotes = perms.canViewPrivateVetNotes;
      }
    }

    // Filtro de visibilidade
    const visibilityFilter = canViewPrivateVetNotes
      ? {} // Vets podem ver todas as notas
      : { visibility: "ALL_TUTORS" }; // Tutores e cuidadores só veem notas públicas

    const notes = await prisma.clinicalNote.findMany({
      where: {
        petId: targetPetId,
        ...visibilityFilter,
      },
      include: {
        author: {
          include: {
            professionalProfile: true,
          },
        },
        healthEvent: true,
        appointment: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      notes,
      userCanViewPrivateVetNotes: canViewPrivateVetNotes,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      petId,
      authorId,
      content,
      visibility, // "ALL_TUTORS" | "PROFESSIONALS_ONLY"
      healthEventId,
      appointmentId,
      attachments,
    } = body;

    if (!petId || !authorId || !content) {
      return NextResponse.json(
        { error: "petId, authorId e content são obrigatórios" },
        { status: 400 }
      );
    }

    // Validar se o autor tem permissão
    const membership = await prisma.petMember.findUnique({
      where: { petId_userId: { petId, userId: authorId } },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Usuário não possui vínculo com este animal" },
        { status: 403 }
      );
    }

    const perms = getRolePermissions(membership.role);
    if (!perms.canAddClinicalNotes) {
      return NextResponse.json(
        { error: "Seu papel não possui permissão para registrar notas clínicas" },
        { status: 403 }
      );
    }

    // Se tentar criar nota interna privada e não for veterinário autorizado
    const targetVisibility =
      visibility === "PROFESSIONALS_ONLY" && perms.canViewPrivateVetNotes
        ? "PROFESSIONALS_ONLY"
        : "ALL_TUTORS";

    const note = await prisma.clinicalNote.create({
      data: {
        petId,
        authorId,
        content,
        visibility: targetVisibility,
        healthEventId: healthEventId || null,
        appointmentId: appointmentId || null,
        attachments: attachments || null,
      },
      include: {
        author: {
          include: { professionalProfile: true },
        },
      },
    });

    // Registrar no ActivityLog
    const authorUser = await prisma.user.findUnique({ where: { id: authorId } });
    await prisma.activityLog.create({
      data: {
        petId,
        userId: authorId,
        action: `adicionou nota ao prontuário (${targetVisibility === "PROFESSIONALS_ONLY" ? "🔒 Confidencial Vet" : "Pública"})`,
        entityType: "health",
        entityId: note.id,
      },
    });

    return NextResponse.json({ success: true, note });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
