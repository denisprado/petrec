import { NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsappBot";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await processWhatsAppMessage({
      fromPhone: body.fromPhone,
      messageText: body.messageText,
      userId: body.userId,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("WhatsApp simulate error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
