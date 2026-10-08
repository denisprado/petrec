import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  if (!petId) {
    return NextResponse.json({ error: "petId é obrigatório" }, { status: 400 });
  }

  try {
    const logs = await prisma.activityLog.findMany({
      where: { petId },
      include: { user: true },
      orderBy: { timestamp: "desc" },
      take: 30,
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
