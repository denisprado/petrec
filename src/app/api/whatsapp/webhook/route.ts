import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://zany-owl-512.convex.cloud"
);

const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN ||
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
  "petrec_webhook_secret_token";

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

    if (body.object === "whatsapp_business_account" && body.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value?.messages && value.messages.length > 0) {
            const message = value.messages[0];
            const from = message.from;
            const formattedPhone = from.startsWith("+") ? from : `+${from}`;
            const text = message.text?.body || message.button?.text || "";

            console.log(`[WhatsApp Inbound] De: ${formattedPhone} | Mensagem: "${text}"`);

            let replyText = "🐾 Mensagem recebida pelo PetRec!";

            const cleanPhone = formattedPhone.startsWith("+") ? formattedPhone : `+${formattedPhone.replace(/[^\d]/g, "")}`;
            const upper = text.trim().toUpperCase();

            if (upper.startsWith("CONECTAR_") || upper.startsWith("LINK_") || upper.startsWith("CONECTAR ")) {
              const token = upper.startsWith("CONECTAR ") ? upper.replace("CONECTAR ", "").trim() : upper;
              const pairResult = await convex.mutation(api.whatsapp.pairByToken, {
                phone: cleanPhone,
                token,
              });

              if (pairResult.success && pairResult.user) {
                replyText = `🎉 *Conexão realizada com sucesso!*\n\nOlá *${pairResult.user.name}*, seu WhatsApp foi vinculado ao *PetRec*. Envie *0* ou *menu* para ver opções.`;
              } else {
                replyText = "❌ Este código de conexão é inválido ou expirou.";
              }
            } else {
              const context = await convex.query(api.whatsapp.getContextByPhone, {
                phone: cleanPhone,
              });

              if (!context?.user) {
                replyText = "👋 Olá! Não identificamos seu número no PetRec. Acesse o app para conectar!";
              } else {
                const pet = context.pets[0];
                replyText = `🐾 Olá *${context.user.name}*! Pet ativo: *${pet?.name || "Pet"}*.\nEnvie *1* para agenda de hoje ou *2* para estoque de ração!`;
              }
            }

            if (process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
              await sendMetaWhatsAppMessage({
                to: from,
                text: replyText,
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ status: "EVENT_RECEIVED" });
  } catch (error: any) {
    console.error("[WhatsApp Webhook Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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
