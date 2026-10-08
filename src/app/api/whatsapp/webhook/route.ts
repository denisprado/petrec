import { NextResponse } from "next/server";
import { processIncomingWhatsAppMessage } from "@/lib/whatsappBot";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "petrec_webhook_secret_token";

// GET: Verificação obrigatória do Webhook da Meta
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp Webhook] Verificado com sucesso pela Meta!");
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// POST: Recepção de eventos da Meta Cloud API
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validação de formato da Meta Cloud API
    if (body.object === "whatsapp_business_account" && body.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value?.messages && value.messages.length > 0) {
            const message = value.messages[0];
            const from = message.from; // Número do remetente (Ex: "5519988887777")
            const formattedPhone = from.startsWith("+") ? from : `+${from}`;
            const text = message.text?.body || message.button?.text || "";

            console.log(`[WhatsApp Inbound] De: ${formattedPhone} | Mensagem: "${text}"`);

            // Executar lógica de processamento do PetRec
            const result = await processIncomingWhatsAppMessage({
              fromPhone: formattedPhone,
              messageText: text,
              wamid: message.id,
            });

            console.log(`[WhatsApp Outbound] Resposta: "${result.replyText.substring(0, 60)}..."`);

            // Se o token da Meta estiver configurado no .env, despacha via Graph API
            if (process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
              await sendMetaWhatsAppMessage({
                to: from,
                text: result.replyText,
              });
            }
          }
        }
      }
    }

    // A Meta exige resposta 200 OK rápida
    return NextResponse.json({ status: "EVENT_RECEIVED" });
  } catch (error: any) {
    console.error("[WhatsApp Webhook Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Função auxiliar para envio via Meta Cloud API
async function sendMetaWhatsAppMessage(params: { to: string; text: string }) {
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.to,
        type: "text",
        text: { body: params.text },
      }),
    });
  } catch (err) {
    console.error("Falha ao despachar mensagem pela Meta Graph API:", err);
  }
}
