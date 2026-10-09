import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  if (!petId) {
    return NextResponse.json({ error: "petId é obrigatório" }, { status: 400 });
  }

  try {
    const logs = await convex.query(api.inventory.listActivityLogs, {
      petId: petId as any,
    });

    return NextResponse.json({
      logs: (logs || []).map((l: any) => ({
        ...l,
        id: l._id,
      })),
    });
  } catch (error: any) {
    console.error("Activity log GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
