import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://zany-owl-512.convex.cloud"
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");
  const userId = searchParams.get("userId");

  try {
    let targetPetId = petId;
    if (!targetPetId) {
      const allPets = await convex.query(api.pets.listAll);
      targetPetId = allPets[0]?._id;
    }

    if (!targetPetId) {
      return NextResponse.json({ notes: [], canViewPrivateVetNotes: false });
    }

    const notes = await convex.query(api.health.listClinicalNotes, {
      petId: targetPetId as any,
      userId: userId ? (userId as any) : undefined,
    });

    return NextResponse.json({
      notes: notes || [],
      userCanViewPrivateVetNotes: true,
    });
  } catch (error: any) {
    console.error("Clinical notes GET error:", error);
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
      appointmentId,
    } = body;

    if (!petId || !authorId || !content) {
      return NextResponse.json(
        { error: "petId, authorId e content são obrigatórios" },
        { status: 400 }
      );
    }

    const noteId = await convex.mutation(api.health.recordClinicalNote, {
      petId: petId as any,
      authorId: authorId as any,
      content: content.trim(),
      visibility: visibility || "ALL_TUTORS",
      appointmentId: appointmentId || undefined,
    });

    return NextResponse.json({ success: true, noteId });
  } catch (error: any) {
    console.error("Clinical notes POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
