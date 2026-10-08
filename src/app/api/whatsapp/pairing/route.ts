import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMinutes } from "date-fns";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        pairingTokens: {
          where: { expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    let token = user.pairingTokens[0]?.token;
    let expiresAt = user.pairingTokens[0]?.expiresAt;

    // Se não houver token válido existente, gera um novo
    if (!token) {
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      token = `LINK_${randomCode}`;
      expiresAt = addMinutes(new Date(), 30);

      await prisma.whatsappPairingToken.create({
        data: {
          userId,
          token,
          expiresAt,
        },
      });
    }

    const botNumber = process.env.WHATSAPP_BOT_NUMBER || "5519999999999";
    const waLink = `https://wa.me/${botNumber}?text=${encodeURIComponent(token)}`;

    return NextResponse.json({
      success: true,
      token,
      expiresAt,
      waLink,
      connectedPhone: user.whatsappPhoneNumber,
      isVerified: !!user.whatsappVerifiedAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Limpar tokens antigos do usuário
    await prisma.whatsappPairingToken.deleteMany({
      where: { userId },
    });

    // Gerar token efêmero de 6 caracteres alfanuméricos legíveis
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const token = `LINK_${randomCode}`;
    const expiresAt = addMinutes(new Date(), 30);

    await prisma.whatsappPairingToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    const botNumber = process.env.WHATSAPP_BOT_NUMBER || "5519999999999";
    const waLink = `https://wa.me/${botNumber}?text=${encodeURIComponent(token)}`;

    return NextResponse.json({
      success: true,
      token,
      expiresAt,
      waLink,
      connectedPhone: user.whatsappPhoneNumber,
      isVerified: !!user.whatsappVerifiedAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        whatsappPhoneNumber: null,
        whatsappVerifiedAt: null,
      },
    });

    await prisma.whatsappSession.deleteMany({
      where: { userId },
    });

    await prisma.whatsappPairingToken.deleteMany({
      where: { userId },
    });

    return NextResponse.json({ success: true, message: "WhatsApp desconectado com sucesso." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
