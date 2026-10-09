import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://zany-owl-512.convex.cloud"
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
