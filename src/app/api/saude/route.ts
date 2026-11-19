import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { notifyPetMembersOnWhatsApp } from "@/lib/whatsappNotifier";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  try {
    let targetPetId = petId;
    if (!targetPetId) {
      const allPets = await convex.query(api.pets.listAll);
      targetPetId = allPets[0]?._id;
    }

    if (!targetPetId) {
      return NextResponse.json({
        vaccines: [],
        weightHistory: [],
        appointments: [],
        healthEvents: [],
      });
    }

    const health = await convex.query(api.health.getPetHealth, {
      petId: targetPetId as any,
    });

    return NextResponse.json({
      vaccines: health.vaccines || [],
      weightHistory: health.weights || [],
      appointments: health.appointments || [],
      healthEvents: health.healthEvents || [],
    });
  } catch (error: any) {
    console.error("Saude GET error:", error);
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
      const recordId = await convex.mutation(api.health.recordWeight, {
        petId: petId as any,
        userId: userId ? (userId as any) : undefined,
        weight: Number(data.weight),
        notes: data.notes || undefined,
        date: data.date || undefined,
      });

      await notifyPetMembersOnWhatsApp({
        convex,
        petId: String(petId),
        actorUserId: userId ? String(userId) : undefined,
        category: "appointments",
        summary: `⚖️ *Novo Peso Registrado:* ${Number(data.weight)} kg`,
      });

      return NextResponse.json({ success: true, recordId });
    }

    if (type === "appointment") {
      const apptId = await convex.mutation(api.health.recordAppointment, {
        petId: petId as any,
        userId: userId ? (userId as any) : undefined,
        title: data.title,
        type: data.type || "consulta",
        date: data.date,
        time: data.time || "10:00",
        location: data.location || undefined,
        veterinarian: data.veterinarian || undefined,
        notes: data.notes || undefined,
      });

      await notifyPetMembersOnWhatsApp({
        convex,
        petId: String(petId),
        actorUserId: userId ? String(userId) : undefined,
        category: "appointments",
        summary: `📅 *Compromisso Agendado:* ${data.title} em ${data.date} às ${
          data.time || "10:00"
        }`,
      });

      return NextResponse.json({ success: true, appointmentId: apptId });
    }

    if (type === "vaccination") {
      const vaccId = await convex.mutation(api.health.recordVaccine, {
        petId: petId as any,
        userId: userId ? (userId as any) : undefined,
        name: data.name,
        applicationDate: data.applicationDate,
        nextDueDate: data.nextDueDate || undefined,
        veterinarian: data.veterinarian || undefined,
        crmv: data.crmv || undefined,
        batch: data.batch || undefined,
        notes: data.notes || undefined,
      });

      await notifyPetMembersOnWhatsApp({
        convex,
        petId: String(petId),
        actorUserId: userId ? String(userId) : undefined,
        category: "vaccinations",
        summary: `💉 *Vacina Registrada:* ${data.name} (aplicada em ${data.applicationDate})`,
      });

      return NextResponse.json({ success: true, vaccineId: vaccId });
    }

    return NextResponse.json(
      { error: "Tipo de evento de saúde inválido" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Saude POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { type, id, userId, data } = body;

    if (!type || !id || !data) {
      return NextResponse.json({ error: "Dados incompletos para atualização." }, { status: 400 });
    }

    if (type === "weight") {
      await convex.mutation(api.health.updateWeight, {
        weightId: id as any,
        userId: userId ? (userId as any) : undefined,
        weight: Number(data.weight),
        date: data.date || undefined,
        notes: data.notes || undefined,
      });
      return NextResponse.json({ success: true });
    }

    if (type === "vaccination") {
      await convex.mutation(api.health.updateVaccine, {
        vaccineId: id as any,
        userId: userId ? (userId as any) : undefined,
        name: String(data.name),
        applicationDate: String(data.applicationDate),
        nextDueDate: data.nextDueDate || undefined,
        veterinarian: data.veterinarian || undefined,
        crmv: data.crmv || undefined,
        batch: data.batch || undefined,
        notes: data.notes || undefined,
      });
      return NextResponse.json({ success: true });
    }

    if (type === "appointment") {
      await convex.mutation(api.health.updateAppointment, {
        appointmentId: id as any,
        userId: userId ? (userId as any) : undefined,
        title: String(data.title),
        type: String(data.type || "consulta"),
        date: String(data.date),
        time: String(data.time || "10:00"),
        location: data.location || undefined,
        veterinarian: data.veterinarian || undefined,
        notes: data.notes || undefined,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Tipo de evento de saúde inválido" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Saude PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");

    if (!type || !id) {
      return NextResponse.json(
        { error: "Informe type e id para exclusão." },
        { status: 400 }
      );
    }

    if (type === "weight") {
      await convex.mutation(api.health.deleteWeight, {
        weightId: id as any,
        userId: userId ? (userId as any) : undefined,
      });
      return NextResponse.json({ success: true });
    }

    if (type === "vaccination") {
      await convex.mutation(api.health.deleteVaccine, {
        vaccineId: id as any,
        userId: userId ? (userId as any) : undefined,
      });
      return NextResponse.json({ success: true });
    }

    if (type === "appointment") {
      await convex.mutation(api.health.deleteAppointment, {
        appointmentId: id as any,
        userId: userId ? (userId as any) : undefined,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Tipo de evento de saúde inválido" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Saude DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
