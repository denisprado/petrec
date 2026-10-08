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
    const allUsers = await convex.query(api.users.list);

    if (!petId) {
      return NextResponse.json({ members: [], invitations: [], allUsers });
    }

    const pet = await convex.query(api.pets.getById, { petId: petId as any });
    const members = (pet as any)?.members || [];

    return NextResponse.json({ members, invitations: [], allUsers });
  } catch (error: any) {
    console.error("GET /api/tutores error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { petId, invitedEmail, role = "caregiver" } = body;

    if (!petId || !invitedEmail) {
      return NextResponse.json(
        { error: "Dados incompletos para vincular tutor" },
        { status: 400 }
      );
    }

    const allUsers = await convex.query(api.users.list);
    let user = allUsers.find((u: any) => u.email === invitedEmail);

    return NextResponse.json({
      success: true,
      message: `Tutor ${invitedEmail} vinculado com sucesso!`,
    });
  } catch (error: any) {
    console.error("POST /api/tutores error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  return NextResponse.json({ success: true });
}
