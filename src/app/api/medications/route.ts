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
      return NextResponse.json({ medications: [], administrationsToday: [] });
    }

    try {
      await convex.mutation(api.medications.syncRoutineMedications, {
        petId: targetPetId as any,
      });
    } catch (syncErr) {
      console.warn("Medications GET sync warning:", syncErr);
    }

    const [medications, administrationsToday] = await Promise.all([
      convex.query(api.medications.listByPet, { petId: targetPetId as any }),
      convex.query(api.medications.getAdministrationsToday, { petId: targetPetId as any }),
    ]);

    return NextResponse.json({
      medications: medications || [],
      administrationsToday: administrationsToday || [],
    });
  } catch (error: any) {
    console.error("Medications GET error:", error);
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
      times = ["08:00"],
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

    const parsedTimes = Array.isArray(times) && times.length > 0 ? times : ["08:00"];

    const medId = await convex.mutation(api.medications.create, {
      petId: petId as any,
      userId: userId as any,
      name: name.trim(),
      activeIngredient: activeIngredient || undefined,
      presentation: presentation || undefined,
      dosage: dosage || undefined,
      unit: unit || "comprimidos",
      instructions: instructions || undefined,
      veterinarian: veterinarian || undefined,
      times: parsedTimes,
      quantityPerAdministration: Number(quantityPerAdministration) || 1,
      initialStockQuantity: Number(initialStockQuantity) || 0,
      purchaseLeadTimeDays: Number(purchaseLeadTimeDays) || 5,
      status: "active",
      notes: notes || undefined,
    });

    await notifyPetMembersOnWhatsApp({
      convex,
      petId: String(petId),
      actorUserId: String(userId),
      summary: `💊 *Novo Medicamento Cadastrado:* ${name.trim()}${
        dosage ? ` (${dosage})` : ""
      } — horários: ${parsedTimes.join(", ")}`,
    });

    return NextResponse.json({
      success: true,
      medicationId: medId,
      medication: {
        id: medId,
        name: name.trim(),
        dosage: dosage || undefined,
        unit: unit || "comprimidos",
      },
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

    const parsedTimes = Array.isArray(times) && times.length > 0 ? times : ["08:00"];
    const parsedQty = Number(currentQuantity);

    const updatedMed = await convex.mutation(api.medications.update, {
      medicationId: medicationId as any,
      userId: userId as any,
      name: name.trim(),
      activeIngredient: activeIngredient ? String(activeIngredient).trim() : "",
      presentation: presentation ? String(presentation).trim() : "",
      dosage: dosage ? String(dosage).trim() : "",
      unit: unit || undefined,
      instructions: instructions ? String(instructions).trim() : "",
      veterinarian: veterinarian ? String(veterinarian).trim() : "",
      times: parsedTimes,
      quantityPerAdministration: Number(quantityPerAdministration) || 1,
      currentQuantity: Number.isFinite(parsedQty) ? parsedQty : 0,
      purchaseLeadTimeDays: Number(purchaseLeadTimeDays) || 5,
      notes: notes ? String(notes).trim() : "",
    });

    const targetPetId = updatedMed?.petId || body.petId;
    if (targetPetId) {
      await notifyPetMembersOnWhatsApp({
        convex,
        petId: String(targetPetId),
        actorUserId: String(userId),
        summary: `✏️ *Medicamento Atualizado:* ${name.trim()}${
          dosage ? ` (${dosage})` : ""
        } — horários: ${parsedTimes.join(", ")}`,
      });
    }

    return NextResponse.json({
      success: true,
      medication: updatedMed || { id: medicationId, name: name.trim() },
      message: "Medicamento atualizado com sucesso!",
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
    const result = await convex.mutation(api.medications.remove, {
      medicationId: medicationId as any,
      userId: userId as any,
    });

    if (result?.deleted && result?.petId) {
      await notifyPetMembersOnWhatsApp({
        convex,
        petId: String(result.petId),
        actorUserId: String(userId),
        summary: `🗑️ *Medicamento Excluído:* ${result.medicationName || "Medicamento"}`,
      });
    }

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
    const { administrationId, status, userId, notes } = body;

    if (!administrationId || !status) {
      return NextResponse.json(
        { error: "administrationId e status são obrigatórios" },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.medications.administer, {
      administrationId: administrationId as any,
      userId: userId ? (userId as any) : undefined,
      status,
      notes: notes || undefined,
    });

    if (result?.petId) {
      await notifyPetMembersOnWhatsApp({
        convex,
        petId: String(result.petId),
        actorUserId: userId ? String(userId) : undefined,
        summary: `💊 *Dose ${
          status === "skipped" ? "Pulada / Não Administrada" : "Administrada"
        }:* ${result.medicationName || "Medicamento"}${notes ? ` (${notes})` : ""}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Dose marcada como ${status}!`,
    });
  } catch (error: any) {
    console.error("Medication administration PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
