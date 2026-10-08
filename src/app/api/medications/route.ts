import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/permissions";
import { calculateStockForecast } from "@/lib/stockCalculation";
import { addDays, setHours, setMinutes, startOfDay } from "date-fns";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  try {
    let targetPetId: string | undefined = petId || undefined;
    if (!targetPetId) {
      const firstPet = await prisma.pet.findFirst();
      targetPetId = firstPet?.id;
    }

    if (!targetPetId) {
      return NextResponse.json({ medications: [], administrationsToday: [] });
    }

    const [medications, administrationsToday] = await Promise.all([
      prisma.medication.findMany({
        where: { petId: targetPetId },
        include: {
          schedules: true,
          inventoryItem: true,
          prescribedBy: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.medicationAdministration.findMany({
        where: {
          petId: targetPetId,
          scheduledAt: {
            gte: startOfDay(new Date()),
          },
        },
        include: {
          medication: true,
          administeredBy: true,
        },
        orderBy: { scheduledAt: "asc" },
      }),
    ]);

    return NextResponse.json({
      medications,
      administrationsToday,
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
      userId,
      name,
      activeIngredient,
      presentation,
      dosage,
      unit = "comprimidos",
      instructions,
      veterinarian,
      frequency = "daily",
      times = ["08:00"],
      durationDays,
      quantityPerAdministration = 1,
      initialStockQuantity = 0,
      purchaseLeadTimeDays = 5,
      notes,
    } = body;

    if (!petId || !userId || !name) {
      return NextResponse.json(
        { error: "petId, userId e name são obrigatórios" },
        { status: 400 }
      );
    }

    const membership = await prisma.petMember.findUnique({
      where: { petId_userId: { petId, userId } },
      include: {
        user: { include: { professionalProfile: true } },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Usuário não possui vínculo com este animal" },
        { status: 403 }
      );
    }

    const perms = getRolePermissions(membership.role);
    if (!perms.canManageMedications && !perms.canPrescribe) {
      return NextResponse.json(
        { error: "Seu papel não possui permissão para cadastrar medicamentos" },
        { status: 403 }
      );
    }

    const isDirectApproval = perms.canApprovePrescriptions;
    const initialStatus = isDirectApproval ? "active" : "pending_tutor_approval";

    const vetLabel =
      veterinarian ||
      (membership.user.professionalProfile
        ? `${membership.user.name} (${membership.user.professionalProfile.registerNumber || "Veterinário(a)"})`
        : null);

    const now = new Date();
    const endDate = durationDays ? addDays(now, Number(durationDays)) : null;

    const medication = await prisma.medication.create({
      data: {
        petId,
        name,
        activeIngredient: activeIngredient || null,
        presentation: presentation || null,
        dosage: dosage || null,
        unit: unit || "comprimidos",
        instructions: instructions || null,
        veterinarian: vetLabel,
        status: initialStatus,
        prescribedById: userId,
        approvedById: isDirectApproval ? userId : null,
        approvedAt: isDirectApproval ? now : null,
        startDate: now,
        endDate,
        notes: notes || null,
      },
    });

    const parsedTimes = Array.isArray(times) && times.length > 0 ? times : ["08:00"];
    const qtyPerAdmin = Number(quantityPerAdministration) || 1;

    const schedule = await prisma.medicationSchedule.create({
      data: {
        medicationId: medication.id,
        quantityPerAdministration: qtyPerAdmin,
        administrationsPerDay: parsedTimes.length,
        frequency,
        times: JSON.stringify(parsedTimes),
        startDate: now,
        endDate,
        active: true,
      },
    });

    if (initialStatus === "active") {
      const dailyConsumption = qtyPerAdmin * parsedTimes.length;
      const initialQty = Number(initialStockQuantity) || 0;

      const forecast = calculateStockForecast({
        currentQuantity: initialQty,
        dailyConsumption,
        unit: unit || "comprimidos",
        purchaseLeadTimeDays: Number(purchaseLeadTimeDays) || 5,
        referenceDate: now,
      });

      const invItem = await prisma.inventoryItem.create({
        data: {
          petId,
          medicationId: medication.id,
          name: `${name} (${initialQty} ${unit || "doses"})`,
          category: "medicamento",
          unit: unit || "comprimidos",
          currentQuantity: initialQty,
          dailyConsumption,
          purchaseLeadTimeDays: Number(purchaseLeadTimeDays) || 5,
          referenceDate: now,
          status: forecast.status,
          estimatedEndDate: forecast.estimatedEndDate,
          notes: `Item vinculado ao medicamento ${name}.`,
        },
      });

      if (initialQty > 0) {
        await prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: invItem.id,
            type: "purchase",
            quantity: initialQty,
            date: now,
            userId,
            notes: "Carga inicial de estoque do medicamento",
          },
        });
      }

      // Criar administrações para o dia de hoje
      for (const timeStr of parsedTimes) {
        const [hours, minutes] = timeStr.split(":").map(Number);
        const scheduledTime = setMinutes(
          setHours(startOfDay(now), hours || 8),
          minutes || 0
        );

        await prisma.medicationAdministration.create({
          data: {
            petId,
            medicationId: medication.id,
            scheduledAt: scheduledTime,
            quantity: qtyPerAdmin,
            status: "scheduled",
          },
        });
      }
    }

    await prisma.activityLog.create({
      data: {
        petId,
        userId,
        action: `cadastrou o medicamento ${name}`,
        entityType: "medication",
        entityId: medication.id,
        metadata: JSON.stringify({
          medicationName: name,
          status: initialStatus,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      medication,
      schedule,
    });
  } catch (error: any) {
    console.error("Medication POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      medicationId,
      userId,
      name,
      activeIngredient,
      presentation,
      dosage,
      unit,
      instructions,
      veterinarian,
      frequency,
      times,
      quantityPerAdministration,
      currentQuantity,
      purchaseLeadTimeDays = 5,
      notes,
    } = body;

    if (!medicationId || !userId || !name) {
      return NextResponse.json(
        { error: "medicationId, userId e name são obrigatórios" },
        { status: 400 }
      );
    }

    const medication = await prisma.medication.findUnique({
      where: { id: medicationId },
      include: {
        schedules: true,
        inventoryItem: true,
      },
    });

    if (!medication) {
      return NextResponse.json(
        { error: "Medicamento não encontrado" },
        { status: 404 }
      );
    }

    const membership = await prisma.petMember.findUnique({
      where: { petId_userId: { petId: medication.petId, userId } },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Usuário não possui vínculo com este animal" },
        { status: 403 }
      );
    }

    const perms = getRolePermissions(membership.role);
    if (!perms.canManageMedications) {
      return NextResponse.json(
        { error: "Seu papel não permite editar medicamentos" },
        { status: 403 }
      );
    }

    const updatedMedication = await prisma.medication.update({
      where: { id: medicationId },
      data: {
        name,
        activeIngredient: activeIngredient || null,
        presentation: presentation || null,
        dosage: dosage || null,
        unit: unit || medication.unit || "comprimidos",
        instructions: instructions || null,
        veterinarian: veterinarian || null,
        notes: notes || null,
      },
    });

    const parsedTimes = Array.isArray(times) && times.length > 0 ? times : ["08:00"];
    const qtyPerAdmin = Number(quantityPerAdministration) || 1;

    const firstSchedule = medication.schedules[0];
    if (firstSchedule) {
      await prisma.medicationSchedule.update({
        where: { id: firstSchedule.id },
        data: {
          quantityPerAdministration: qtyPerAdmin,
          administrationsPerDay: parsedTimes.length,
          frequency: frequency || firstSchedule.frequency,
          times: JSON.stringify(parsedTimes),
        },
      });
    } else {
      await prisma.medicationSchedule.create({
        data: {
          medicationId,
          quantityPerAdministration: qtyPerAdmin,
          administrationsPerDay: parsedTimes.length,
          frequency: frequency || "daily",
          times: JSON.stringify(parsedTimes),
        },
      });
    }

    const dailyConsumption = qtyPerAdmin * parsedTimes.length;
    const now = new Date();

    if (medication.inventoryItem) {
      const invItem = medication.inventoryItem;
      const targetQty = typeof currentQuantity === "number" ? currentQuantity : invItem.currentQuantity;
      const usedUnit = unit || invItem.unit;

      const forecast = calculateStockForecast({
        currentQuantity: targetQty,
        dailyConsumption,
        unit: usedUnit,
        purchaseLeadTimeDays: Number(purchaseLeadTimeDays) || invItem.purchaseLeadTimeDays,
        referenceDate: now,
      });

      await prisma.inventoryItem.update({
        where: { id: invItem.id },
        data: {
          name: `${name} (${targetQty} ${usedUnit})`,
          unit: usedUnit,
          currentQuantity: targetQty,
          dailyConsumption,
          purchaseLeadTimeDays: Number(purchaseLeadTimeDays) || invItem.purchaseLeadTimeDays,
          status: forecast.status,
          estimatedEndDate: forecast.estimatedEndDate,
        },
      });

      if (typeof currentQuantity === "number" && currentQuantity !== invItem.currentQuantity) {
        const diff = currentQuantity - invItem.currentQuantity;
        await prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: invItem.id,
            type: "adjustment",
            quantity: diff,
            date: now,
            userId,
            notes: "Ajuste de estoque ao atualizar medicamento",
          },
        });
      }
    } else if (typeof currentQuantity === "number" && currentQuantity >= 0) {
      const usedUnit = unit || "comprimidos";
      const forecast = calculateStockForecast({
        currentQuantity,
        dailyConsumption,
        unit: usedUnit,
        purchaseLeadTimeDays: Number(purchaseLeadTimeDays) || 5,
        referenceDate: now,
      });

      const newInv = await prisma.inventoryItem.create({
        data: {
          petId: medication.petId,
          medicationId: medication.id,
          name: `${name} (${currentQuantity} ${usedUnit})`,
          category: "medicamento",
          unit: usedUnit,
          currentQuantity,
          dailyConsumption,
          purchaseLeadTimeDays: Number(purchaseLeadTimeDays) || 5,
          referenceDate: now,
          status: forecast.status,
          estimatedEndDate: forecast.estimatedEndDate,
          notes: `Item de estoque criado para ${name}.`,
        },
      });

      if (currentQuantity > 0) {
        await prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: newInv.id,
            type: "purchase",
            quantity: currentQuantity,
            date: now,
            userId,
            notes: "Carga de estoque inicial",
          },
        });
      }
    }

    await prisma.activityLog.create({
      data: {
        petId: medication.petId,
        userId,
        action: `atualizou os dados do medicamento ${name}`,
        entityType: "medication",
        entityId: medicationId,
      },
    });

    return NextResponse.json({
      success: true,
      medication: updatedMedication,
    });
  } catch (error: any) {
    console.error("Medication PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const medicationId = searchParams.get("medicationId");
  const userId = searchParams.get("userId");

  if (!medicationId || !userId) {
    return NextResponse.json(
      { error: "medicationId e userId são obrigatórios" },
      { status: 400 }
    );
  }

  try {
    const medication = await prisma.medication.findUnique({
      where: { id: medicationId },
      include: {
        inventoryItem: true,
      },
    });

    if (!medication) {
      return NextResponse.json(
        { error: "Medicamento não encontrado" },
        { status: 404 }
      );
    }

    const membership = await prisma.petMember.findUnique({
      where: { petId_userId: { petId: medication.petId, userId } },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Usuário não possui vínculo com este animal" },
        { status: 403 }
      );
    }

    const perms = getRolePermissions(membership.role);
    if (!perms.canManageMedications) {
      return NextResponse.json(
        { error: "Seu papel não permite excluir medicamentos" },
        { status: 403 }
      );
    }

    // Se houver item de estoque vinculado, desvincular de compras e deletar
    if (medication.inventoryItem) {
      const invId = medication.inventoryItem.id;
      await prisma.shoppingListItem.updateMany({
        where: { inventoryItemId: invId },
        data: { inventoryItemId: null },
      });
      await prisma.inventoryItem.delete({
        where: { id: invId },
      });
    }

    // Excluir o medicamento (schedules e administrations cascateiam)
    await prisma.medication.delete({
      where: { id: medicationId },
    });

    // Registrar no ActivityLog
    await prisma.activityLog.create({
      data: {
        petId: medication.petId,
        userId,
        action: `removeu o medicamento ${medication.name} e seu cronograma`,
        entityType: "medication",
        entityId: medicationId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Medicamento excluído com sucesso",
    });
  } catch (error: any) {
    console.error("Medication DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const {
      administrationId,
      status, // "administered", "skipped", "missed"
      userId,
      notes,
    } = body;

    if (!administrationId || !status) {
      return NextResponse.json(
        { error: "administrationId e status são obrigatórios" },
        { status: 400 }
      );
    }

    const adminRecord = await prisma.medicationAdministration.findUnique({
      where: { id: administrationId },
      include: {
        medication: {
          include: { inventoryItem: true },
        },
        pet: true,
      },
    });

    if (!adminRecord) {
      return NextResponse.json(
        { error: "Registro de administração não encontrado" },
        { status: 404 }
      );
    }

    const now = new Date();
    const updated = await prisma.medicationAdministration.update({
      where: { id: administrationId },
      data: {
        status,
        administeredAt: status === "administered" ? now : null,
        administeredByUserId: status === "administered" ? userId : null,
        notes: notes || adminRecord.notes,
      },
      include: {
        administeredBy: true,
        medication: true,
      },
    });

    // Se foi administrado e há item de estoque vinculado, consome a dose e recalcula estoque!
    if (status === "administered" && adminRecord.medication.inventoryItem) {
      const invItem = adminRecord.medication.inventoryItem;
      const newQty = Math.max(0, invItem.currentQuantity - adminRecord.quantity);

      const forecast = calculateStockForecast({
        currentQuantity: newQty,
        dailyConsumption: invItem.dailyConsumption,
        unit: invItem.unit,
        purchaseLeadTimeDays: invItem.purchaseLeadTimeDays,
      });

      await prisma.inventoryTransaction.create({
        data: {
          inventoryItemId: invItem.id,
          type: "consumption",
          quantity: -adminRecord.quantity,
          date: now,
          userId: userId || null,
          notes: `Administração de dose (${adminRecord.quantity} ${invItem.unit})`,
        },
      });

      await prisma.inventoryItem.update({
        where: { id: invItem.id },
        data: {
          currentQuantity: newQty,
          status: forecast.status,
          estimatedEndDate: forecast.estimatedEndDate,
        },
      });
    }

    // Registrar no ActivityLog
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const userName = user ? user.name : "Tutor";
      const actionText =
        status === "administered"
          ? `administrou ${adminRecord.quantity} dose de ${adminRecord.medication.name}`
          : status === "skipped"
          ? `pulou a dose de ${adminRecord.medication.name}`
          : `marcou dose de ${adminRecord.medication.name} como perdida`;

      await prisma.activityLog.create({
        data: {
          petId: adminRecord.petId,
          userId,
          action: actionText,
          entityType: "medication",
          entityId: adminRecord.medicationId,
          metadata: JSON.stringify({
            status,
            time: now.toISOString(),
            administeredBy: userName,
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      administration: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
