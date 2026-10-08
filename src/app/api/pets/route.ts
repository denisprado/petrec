import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/permissions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");
  const userId = searchParams.get("userId");

  try {
    if (petId) {
      const pet = await prisma.pet.findUnique({
        where: { id: petId },
        include: {
          members: {
            include: {
              user: {
                include: { professionalProfile: true },
              },
            },
          },
          inventoryItems: true,
          medications: {
            include: { schedules: true, inventoryItem: true },
          },
          vaccinations: true,
          appointments: true,
          weightRecords: {
            orderBy: { date: "desc" },
            take: 5,
          },
        },
      });

      if (!pet) {
        return NextResponse.json({ error: "Pet não encontrado" }, { status: 404 });
      }

      return NextResponse.json({ pet });
    }

    // Listar todos os pets associados ao usuário ou todos os pets do sistema
    let pets;
    if (userId) {
      const memberships = await prisma.petMember.findMany({
        where: { userId },
        include: {
          pet: {
            include: {
              members: {
                include: { user: true },
              },
            },
          },
        },
      });
      pets = memberships.map((m) => ({
        ...m.pet,
        userRole: m.role,
      }));
    } else {
      pets = await prisma.pet.findMany({
        include: {
          members: {
            include: { user: true },
          },
        },
      });
    }

    return NextResponse.json({ pets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      species,
      breed,
      sex,
      birthDate,
      weight,
      photo,
      color,
      microchip,
      notes,
      userId,
    } = body;

    if (!name || !species) {
      return NextResponse.json(
        { error: "Nome e espécie do animal são obrigatórios." },
        { status: 400 }
      );
    }

    let creator = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!creator) {
      creator =
        (await prisma.user.findFirst({ where: { email: "denis@exemplo.com" } })) ||
        (await prisma.user.findFirst());
    }
    if (!creator) {
      creator = await prisma.user.create({
        data: {
          name: "Denis Forigo",
          email: "denis@exemplo.com",
          avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
          timezone: "America/Sao_Paulo",
        },
      });
    }

    const parsedWeight = weight ? parseFloat(weight) : null;
    const parsedBirthDate = birthDate ? new Date(birthDate) : null;

    // Foto padrão de fallback de acordo com a espécie caso não tenha sido enviada
    let finalPhoto = photo;
    if (!finalPhoto) {
      const sp = species.toLowerCase();
      if (sp.includes("gato") || sp.includes("felino")) {
        finalPhoto =
          "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500&auto=format&fit=crop&q=80";
      } else if (sp.includes("ave") || sp.includes("pássaro")) {
        finalPhoto =
          "https://images.unsplash.com/photo-1522858547137-f1dcec554f55?w=500&auto=format&fit=crop&q=80";
      } else {
        // Cão padrão
        finalPhoto =
          "https://images.unsplash.com/photo-1552053831-71594a27632d?w=500&auto=format&fit=crop&q=80";
      }
    }

    // 1. Criar Pet no banco SQLite
    const pet = await prisma.pet.create({
      data: {
        name,
        species,
        breed: breed || null,
        sex: sex || null,
        birthDate: parsedBirthDate,
        weight: parsedWeight,
        photo: finalPhoto,
        color: color || null,
        microchip: microchip || null,
        notes: notes || null,
      },
    });

    // 2. Vincular criador como Proprietário Principal (Owner)
    await prisma.petMember.create({
      data: {
        petId: pet.id,
        userId: creator.id,
        role: "owner",
        isPrimary: true,
      },
    });

    // 3. Criar registro inicial de peso se fornecido
    if (parsedWeight) {
      await prisma.weightRecord.create({
        data: {
          petId: pet.id,
          userId: creator.id,
          weight: parsedWeight,
          date: new Date(),
          notes: "Peso inicial de cadastro do pet",
        },
      });
    }

    // 4. Criar preferências padrão de notificação
    await prisma.notificationPreference.create({
      data: {
        userId: creator.id,
        petId: pet.id,
        allowFoodStock: true,
        allowMedicationStock: true,
        allowMedicationSchedule: true,
        allowAppointments: true,
        allowVaccines: true,
        leadTimeDays: 7,
      },
    });

    // 5. Auditoria no ActivityLog
    await prisma.activityLog.create({
      data: {
        petId: pet.id,
        userId: creator.id,
        action: `cadastrou o animal "${pet.name}" (${pet.species}) no PetRec`,
        entityType: "pet",
        entityId: pet.id,
      },
    });

    return NextResponse.json({
      success: true,
      pet,
      message: `Animal "${pet.name}" cadastrado com sucesso!`,
    });
  } catch (error: any) {
    console.error("Pet creation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      petId,
      userId,
      name,
      species,
      breed,
      sex,
      birthDate,
      weight,
      photo,
      color,
      microchip,
      notes,
    } = body;

    if (!petId || !userId) {
      return NextResponse.json(
        { error: "petId e userId são obrigatórios para edição." },
        { status: 400 }
      );
    }

    // Verificar se o usuário possui permissão para editar o pet
    const membership = await prisma.petMember.findUnique({
      where: {
        petId_userId: { petId, userId },
      },
      include: { user: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Você não possui vínculo com este animal." },
        { status: 403 }
      );
    }

    const perms = getRolePermissions(membership.role);
    if (!perms.canEditPet) {
      return NextResponse.json(
        { error: "Seu papel não possui permissão para editar dados do pet." },
        { status: 403 }
      );
    }

    const currentPet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!currentPet) {
      return NextResponse.json({ error: "Pet não encontrado." }, { status: 404 });
    }

    const parsedWeight = weight !== undefined && weight !== null && weight !== "" ? parseFloat(weight) : currentPet.weight;
    const parsedBirthDate = birthDate ? new Date(birthDate) : currentPet.birthDate;

    // Atualizar dados cadastrais
    const updatedPet = await prisma.pet.update({
      where: { id: petId },
      data: {
        name: name || currentPet.name,
        species: species || currentPet.species,
        breed: breed !== undefined ? breed : currentPet.breed,
        sex: sex !== undefined ? sex : currentPet.sex,
        birthDate: parsedBirthDate,
        weight: parsedWeight,
        photo: photo || currentPet.photo,
        color: color !== undefined ? color : currentPet.color,
        microchip: microchip !== undefined ? microchip : currentPet.microchip,
        notes: notes !== undefined ? notes : currentPet.notes,
      },
    });

    // Se o peso foi alterado, registrar nova pesagem no histórico
    if (parsedWeight && parsedWeight !== currentPet.weight) {
      await prisma.weightRecord.create({
        data: {
          petId,
          userId,
          weight: parsedWeight,
          date: new Date(),
          notes: "Atualização cadastral do peso",
        },
      });
    }

    // Registrar no ActivityLog
    await prisma.activityLog.create({
      data: {
        petId,
        userId,
        action: `atualizou as informações cadastrais de "${updatedPet.name}"`,
        entityType: "pet",
        entityId: petId,
      },
    });

    return NextResponse.json({
      success: true,
      pet: updatedPet,
      message: "Dados do pet atualizados com sucesso!",
    });
  } catch (error: any) {
    console.error("Pet update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    const userId = searchParams.get("userId");

    if (!petId || !userId) {
      return NextResponse.json(
        { error: "petId e userId são obrigatórios para exclusão." },
        { status: 400 }
      );
    }

    // Verificar se o usuário é o proprietário principal com permissão de exclusão
    const membership = await prisma.petMember.findUnique({
      where: {
        petId_userId: { petId, userId },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Você não possui vínculo com este animal." },
        { status: 403 }
      );
    }

    const perms = getRolePermissions(membership.role);
    if (!perms.canDeletePet) {
      return NextResponse.json(
        { error: "Apenas o Proprietário principal pode excluir o pet." },
        { status: 403 }
      );
    }

    const petToDelete = await prisma.pet.findUnique({ where: { id: petId } });
    if (!petToDelete) {
      return NextResponse.json({ error: "Pet não encontrado." }, { status: 404 });
    }

    // Excluir em cascata
    await prisma.pet.delete({
      where: { id: petId },
    });

    return NextResponse.json({
      success: true,
      message: `Animal "${petToDelete.name}" e seus registros foram excluídos com sucesso.`,
    });
  } catch (error: any) {
    console.error("Pet delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
