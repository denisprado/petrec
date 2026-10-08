import { NextResponse } from "next/server";
import { processIncomingWhatsAppMessage } from "@/lib/whatsappBot";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fromPhone, messageText, userId } = body;

    let phone = fromPhone;

    // Se passou userId e não passou phone, busca o telefone cadastrado ou usa um mock
    if (userId && !phone) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      phone = user?.whatsappPhoneNumber || "+5519988887777";
    }

    if (!phone || !messageText) {
      return NextResponse.json(
        { error: "Telefone e texto da mensagem são obrigatórios" },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    const result = await processIncomingWhatsAppMessage({
      fromPhone: phone,
      messageText,
    });
    const durationMs = Date.now() - startTime;

    // Buscar sessão atualizada
    const user = await prisma.user.findFirst({
      where: { whatsappPhoneNumber: phone },
      include: { whatsappSession: true },
    });

    return NextResponse.json({
      success: true,
      senderPhone: phone,
      userFound: !!user,
      userName: user?.name,
      replyText: result.replyText,
      actionTaken: result.actionTaken,
      currentState: user?.whatsappSession?.state || "IDLE",
      durationMs,
    });
  } catch (error: any) {
    console.error("Erro no simulador de WhatsApp:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
