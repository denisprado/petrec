import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  if (!petId) {
    return NextResponse.json({ error: "petId é obrigatório" }, { status: 400 });
  }

  try {
    const [vaccines, weightHistory, appointments, healthEvents] = await Promise.all([
      prisma.vaccination.findMany({
        where: { petId },
        orderBy: { applicationDate: "desc" },
      }),
      prisma.weightRecord.findMany({
        where: { petId },
        orderBy: { date: "asc" },
        include: { user: true },
      }),
      prisma.appointment.findMany({
        where: { petId },
        orderBy: { date: "asc" },
      }),
      prisma.healthEvent.findMany({
        where: { petId },
        orderBy: { date: "desc" },
        include: { user: true },
      }),
    ]);

    return NextResponse.json({
      vaccines,
      weightHistory,
      appointments,
      healthEvents,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, petId, userId, data } = body;

    if (!petId || !type || !data) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    if (type === "weight") {
      const record = await prisma.weightRecord.create({
        data: {
          petId,
          weight: Number(data.weight),
          date: data.date ? new Date(data.date) : new Date(),
          userId: userId || null,
          notes: data.notes || null,
        },
      });

      // Atualiza peso atual do pet
      await prisma.pet.update({
        where: { id: petId },
        data: { weight: Number(data.weight) },
      });

      if (userId) {
        await prisma.activityLog.create({
          data: {
            petId,
            userId,
            action: `registrou novo peso de ${data.weight} kg`,
            entityType: "health",
            entityId: record.id,
          },
        });
      }

      return NextResponse.json({ success: true, record });
    }

    if (type === "appointment") {
      const appt = await prisma.appointment.create({
        data: {
          petId,
          type: data.type || "consulta",
          title: data.title,
          date: new Date(data.date),
          time: data.time || "10:00",
          location: data.location || null,
          veterinarian: data.veterinarian || null,
          notes: data.notes || null,
          createdBy: userId || null,
        },
      });

      if (userId) {
        await prisma.activityLog.create({
          data: {
            petId,
            userId,
            action: `agendou compromisso: "${data.title}"`,
            entityType: "appointment",
            entityId: appt.id,
          },
        });
      }

      return NextResponse.json({ success: true, appointment: appt });
    }

    if (type === "vaccination") {
      const vacc = await prisma.vaccination.create({
        data: {
          petId,
          name: data.name,
          type: data.type || "Anual",
          applicationDate: new Date(data.applicationDate),
          nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : null,
          dose: data.dose || null,
          lot: data.lot || null,
          manufacturer: data.manufacturer || null,
          veterinarian: data.veterinarian || null,
          clinic: data.clinic || null,
          notes: data.notes || null,
          createdBy: userId || null,
        },
      });

      if (userId) {
        await prisma.activityLog.create({
          data: {
            petId,
            userId,
            action: `registrou aplicação da vacina "${data.name}"`,
            entityType: "vaccine",
            entityId: vacc.id,
          },
        });
      }

      return NextResponse.json({ success: true, vaccination: vacc });
    }

    return NextResponse.json({ error: "Tipo de evento de saúde inválido" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
