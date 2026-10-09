import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

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
      return NextResponse.json({ pending: [], history: [] });
    }

    const { pending, history } = await convex.query(api.medications.listPrescriptions, {
      petId: targetPetId as any,
    });

    return NextResponse.json({ pending: pending || [], history: history || [] });
  } catch (error: any) {
    console.error("Prescriptions GET error:", error);
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
      times = ["08:00"],
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

    const parsedTimes = Array.isArray(times) ? times : [times || "08:00"];

    const medId = await convex.mutation(api.medications.create, {
      petId: petId as any,
      userId: prescribedById as any,
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
      status: "pending_tutor_approval",
      notes: clinicalNotes || undefined,
    });

    return NextResponse.json({
      success: true,
      medicationId: medId,
      initialStatus: "pending_tutor_approval",
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

    if (action === "approve") {
      await convex.mutation(api.medications.approvePrescription, {
        medicationId: medicationId as any,
        userId: userId as any,
        initialStockQuantity: Number(initialStockQuantity) || 0,
      });

      return NextResponse.json({
        success: true,
        action: "approved",
      });
    } else if (action === "reject") {
      await convex.mutation(api.medications.rejectPrescription, {
        medicationId: medicationId as any,
        userId: userId as any,
        notes: notes || undefined,
      });

      return NextResponse.json({
        success: true,
        action: "rejected",
      });
    } else {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Prescription PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
