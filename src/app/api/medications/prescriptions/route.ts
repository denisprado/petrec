import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/permissions";
import { calculateStockForecast } from "@/lib/stockCalculation";
import { addDays, parse, setHours, setMinutes, startOfDay } from "date-fns";

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
      return NextResponse.json({ pending: [], history: [] });
    }

    const [pending, history] = await Promise.all([
      // Prescrições que aguardam aprovação do tutor
      prisma.medication.findMany({
        where: {
          petId: targetPetId,
          status: "pending_tutor_approval",
        },
        include: {
          prescribedBy: {
            include: { professionalProfile: true },
          },
          schedules: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      // Prescrições já aprovadas ou arquivadas
      prisma.medication.findMany({
        where: {
          petId: targetPetId,
          status: { in: ["active", "rejected"] },
          prescribedById: { not: null },
        },
        include: {
          prescribedBy: {
            include: { professionalProfile: true },
          },
          approvedBy: true,
          schedules: true,
          inventoryItem: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    return NextResponse.json({ pending, history });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      petId,
      prescribedById,
      name,
      activeIngredient,
      presentation,
      dosage,
      unit,
      instructions,
      veterinarian,
      frequency = "daily",
      times = ["08:00"],
      durationDays,
      quantityPerAdministration = 1,
      initialStockQuantity = 0,
      purchaseLeadTimeDays = 5,
      clinicalNotes,
    } = body;

    if (!petId || !prescribedById || !name) {
      return NextResponse.json(
        { error: "petId, prescribedById e name são obrigatórios" },
        { status: 400 }
      );
    }

    // 1. Validar permissões do autor
    const membership = await prisma.petMember.findUnique({
      where: { petId_userId: { petId, userId: prescribedById } },
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
    if (!perms.canPrescribe) {
      return NextResponse.json(
        { error: "Seu papel não possui permissão para emitir prescrições" },
        { status: 403 }
      );
    }

    // Se for emitido por veterinário externo, fica pendente de aprovação do tutor.
    // Se for o próprio tutor proprietário/coproprietário cadastrando, já inicia ativo.
    const isDirectApproval = perms.canApprovePrescriptions;
    const initialStatus = isDirectApproval ? "active" : "pending_tutor_approval";

    const vetLabel =
      veterinarian ||
      (membership.user.professionalProfile
        ? `${membership.user.name} (${membership.user.professionalProfile.registerNumber || "Veterinário(a)"})`
        : membership.user.name);

    const now = new Date();
    const endDate = durationDays ? addDays(now, Number(durationDays)) : null;

    // 2. Criar registro de Medicamento
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
        prescribedById,
        approvedById: isDirectApproval ? prescribedById : null,
        approvedAt: isDirectApproval ? now : null,
        startDate: now,
        endDate,
        notes: clinicalNotes || null,
      },
    });

    // 3. Criar cronograma posológico (Schedule)
    const parsedTimes = Array.isArray(times) ? times : [times || "08:00"];
    const schedule = await prisma.medicationSchedule.create({
      data: {
        medicationId: medication.id,
        quantityPerAdministration: Number(quantityPerAdministration) || 1,
        administrationsPerDay: parsedTimes.length,
        frequency,
        times: JSON.stringify(parsedTimes),
        startDate: now,
        endDate,
        active: true,
      },
    });

    // 4. Se já foi aprovado diretamente (ex: tutor cadastrando) ou tem estoque informado
    if (initialStatus === "active") {
      const dailyConsumption =
        (Number(quantityPerAdministration) || 1) * parsedTimes.length;
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
          notes: `Item vinculado à prescrição de ${name}.`,
        },
      });

      if (initialQty > 0) {
        await prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: invItem.id,
            type: "purchase",
            quantity: initialQty,
            date: now,
            userId: prescribedById,
            notes: "Carga inicial de estoque da prescrição",
          },
        });
      }

      // Gerar administrações para o dia de hoje
      for (const timeStr of parsedTimes) {
        const [hours, minutes] = timeStr.split(":").map(Number);
        const scheduledTime = setMinutes(setHours(startOfDay(now), hours || 8), minutes || 0);

        await prisma.medicationAdministration.create({
          data: {
            petId,
            medicationId: medication.id,
            scheduledAt: scheduledTime,
            quantity: Number(quantityPerAdministration) || 1,
            status: "scheduled",
          },
        });
      }
    }

    // 5. Se o profissional adicionou notas clínicas, registrar no prontuário (ClinicalNote)
    if (clinicalNotes) {
      await prisma.clinicalNote.create({
        data: {
          petId,
          authorId: prescribedById,
          content: `Prescrição emitida: ${name} (${dosage || ""}, ${frequency}). ${clinicalNotes}`,
          visibility: "ALL_TUTORS",
        },
      });
    }

    // 6. Registrar no ActivityLog
    const actionDesc =
      initialStatus === "active"
        ? `cadastrou e ativou a medicação ${name}`
        : `prescreveu ${name} (aguardando aprovação do tutor)`;

    await prisma.activityLog.create({
      data: {
        petId,
        userId: prescribedById,
        action: actionDesc,
        entityType: "medication",
        entityId: medication.id,
        metadata: JSON.stringify({
          medicationName: name,
          veterinarian: vetLabel,
          status: initialStatus,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      medication,
      schedule,
      initialStatus,
    });
  } catch (error: any) {
    console.error("Prescription POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const {
      medicationId,
      action, // "approve" | "reject"
      userId,
      initialStockQuantity = 0,
      notes,
    } = body;

    if (!medicationId || !action || !userId) {
      return NextResponse.json(
        { error: "medicationId, action e userId são obrigatórios" },
        { status: 400 }
      );
    }

    // 1. Buscar a medicação
    const medication = await prisma.medication.findUnique({
      where: { id: medicationId },
      include: {
        schedules: true,
        pet: true,
        prescribedBy: true,
      },
    });

    if (!medication) {
      return NextResponse.json(
        { error: "Prescrição não encontrada" },
        { status: 404 }
      );
    }

    // 2. Validar permissões do usuário que está aprovando/rejeitando
    const membership = await prisma.petMember.findUnique({
      where: {
        petId_userId: {
          petId: medication.petId,
          userId,
        },
      },
      include: { user: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Usuário não possui vínculo com este animal" },
        { status: 403 }
      );
    }

    const perms = getRolePermissions(membership.role);
    if (!perms.canApprovePrescriptions) {
      return NextResponse.json(
        { error: "Apenas tutores com papel de Proprietário ou Coproprietário podem aprovar prescrições" },
        { status: 403 }
      );
    }

    const now = new Date();
    const userName = membership.user.name || "Tutor";

    if (action === "approve") {
      // 3. Atualizar medicação para ativa
      const updatedMedication = await prisma.medication.update({
        where: { id: medicationId },
        data: {
          status: "active",
          approvedById: userId,
          approvedAt: now,
          startDate: now,
        },
      });

      // 4. Calcular consumo diário e criar Item de Estoque
      const schedule = medication.schedules[0];
      const parsedTimes = schedule?.times ? JSON.parse(schedule.times) : ["08:00"];
      const dailyConsumption =
        (schedule?.quantityPerAdministration || 1) * parsedTimes.length;
      const initialQty = Number(initialStockQuantity) || 0;

      const forecast = calculateStockForecast({
        currentQuantity: initialQty,
        dailyConsumption,
        unit: medication.unit || "comprimidos",
        purchaseLeadTimeDays: 5,
        referenceDate: now,
      });

      // Verificar se já existe inventoryItem para este medicamento
      const existingInv = await prisma.inventoryItem.findUnique({
        where: { medicationId: medication.id },
      });

      if (!existingInv) {
        const invItem = await prisma.inventoryItem.create({
          data: {
            petId: medication.petId,
            medicationId: medication.id,
            name: `${medication.name} (${initialQty} ${medication.unit || "doses"})`,
            category: "medicamento",
            unit: medication.unit || "comprimidos",
            currentQuantity: initialQty,
            dailyConsumption,
            purchaseLeadTimeDays: 5,
            referenceDate: now,
            status: forecast.status,
            estimatedEndDate: forecast.estimatedEndDate,
            notes: `Estoque vinculado automaticamente à prescrição aprovada de ${medication.name}.`,
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
              notes: "Estoque inicial inserido no momento da aprovação da prescrição médica",
            },
          });
        }
      }

      // 5. Gerar administrações para o dia de hoje
      for (const timeStr of parsedTimes) {
        const [hours, minutes] = timeStr.split(":").map(Number);
        const scheduledTime = setMinutes(
          setHours(startOfDay(now), hours || 8),
          minutes || 0
        );

        // Não duplicar se já foi gerado
        const exists = await prisma.medicationAdministration.findFirst({
          where: {
            medicationId: medication.id,
            scheduledAt: scheduledTime,
          },
        });

        if (!exists) {
          await prisma.medicationAdministration.create({
            data: {
              petId: medication.petId,
              medicationId: medication.id,
              scheduledAt: scheduledTime,
              quantity: schedule?.quantityPerAdministration || 1,
              status: "scheduled",
            },
          });
        }
      }

      // 6. Registrar no prontuário que o tratamento foi aceito
      await prisma.clinicalNote.create({
        data: {
          petId: medication.petId,
          authorId: userId,
          content: `✅ Prescrição de "${medication.name}" aprovada por ${userName}. Tratamento iniciado com estoque inicial de ${initialQty} ${medication.unit || "unidades"}.`,
          visibility: "ALL_TUTORS",
        },
      });

      // 7. ActivityLog
      await prisma.activityLog.create({
        data: {
          petId: medication.petId,
          userId,
          action: `aprovou a prescrição médica de ${medication.name} e iniciou o tratamento`,
          entityType: "medication",
          entityId: medication.id,
        },
      });

      return NextResponse.json({
        success: true,
        action: "approved",
        medication: updatedMedication,
      });
    } else if (action === "reject") {
      const updatedMedication = await prisma.medication.update({
        where: { id: medicationId },
        data: {
          status: "rejected",
          notes: notes
            ? `${medication.notes || ""}\n[Motivo Rejeição]: ${notes}`.trim()
            : medication.notes,
        },
      });

      await prisma.activityLog.create({
        data: {
          petId: medication.petId,
          userId,
          action: `recusou a sugestão de prescrição de ${medication.name}`,
          entityType: "medication",
          entityId: medication.id,
          metadata: JSON.stringify({ reason: notes }),
        },
      });

      return NextResponse.json({
        success: true,
        action: "rejected",
        medication: updatedMedication,
      });
    } else {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Prescription PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
