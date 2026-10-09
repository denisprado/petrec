import { NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsappBot";

const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN ||
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
  "petrec_webhook_secret_token";

/**
 * GET: Handshake de verificação obrigatório exigido pela Meta Cloud API.
 * Quando você cadastra o Webhook no Meta for Developers, a Meta faz um GET
 * enviando hub.mode, hub.verify_token e hub.challenge.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp Webhook] Handshake verificado com sucesso pela Meta!");
    return new Response(challenge, { status: 200 });
  }

  console.warn(
    `[WhatsApp Webhook] Falha de autenticação no handshake. Token recebido: "${token}" | Esperado: "${VERIFY_TOKEN}"`
  );
  return new Response("Forbidden", { status: 403 });
}

/**
 * POST: Recepção de mensagens reais recebidas pelo WhatsApp da Meta Cloud API.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.object === "whatsapp_business_account" && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          const value = change.value;

          // Processar somente quando houver mensagens recebidas do usuário
          if (value?.messages && Array.isArray(value.messages) && value.messages.length > 0) {
            for (const message of value.messages) {
              const from = message.from; // Número do usuário sem '+' (ex: "5519988887777")
              if (!from) continue;

              // Extrair texto da mensagem (seja texto normal, botão ou lista interativa)
              let text = "";
              if (message.type === "text" && message.text?.body) {
                text = message.text.body;
              } else if (message.type === "button" && message.button?.text) {
                text = message.button.text;
              } else if (message.type === "interactive") {
                text =
                  message.interactive?.button_reply?.title ||
                  message.interactive?.list_reply?.title ||
                  message.interactive?.button_reply?.id ||
                  "";
              }

              if (!text.trim()) continue;

              console.log(`[WhatsApp Inbound] De: +${from} | Mensagem: "${text}"`);

              // Executar o motor conversacional do PetRec
              const botResult = await processWhatsAppMessage({
                fromPhone: from,
                messageText: text,
              });

              console.log(
                `[WhatsApp Outbound] Resposta para +${from}: "${botResult.replyText.substring(0, 60)}..."`
              );

              // Despachar a resposta de volta ao WhatsApp do usuário via Meta Cloud API
              const apiToken =
                process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
              const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

              if (apiToken && phoneId) {
                await sendMetaWhatsAppMessage({
                  to: from,
                  text: botResult.replyText,
                  apiToken,
                  phoneId,
                });
              } else {
                console.warn(
                  "[WhatsApp Webhook] WHATSAPP_API_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurados. Mensagem não enviada à Meta."
                );
              }
            }
          }
        }
      }
    }

    // A Meta exige resposta 200 OK rápida com EVENT_RECEIVED
    return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
  } catch (error: any) {
    console.error("[WhatsApp Webhook Error]:", error);
    // Retornamos 200 para evitar que a Meta fique re-enviando loops de mensagens em erro de aplicação
    return NextResponse.json({ status: "ERROR_PROCESSED", error: error.message }, { status: 200 });
  }
}

async function sendMetaWhatsAppMessage(params: {
  to: string;
  text: string;
  apiToken: string;
  phoneId: string;
}) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.to,
        type: "text",
        text: {
          preview_url: false,
          body: params.text,
        },
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[Meta API Send Error]:", JSON.stringify(errData, null, 2));
    } else {
      console.log(`[Meta API Send Success] Mensagem enviada para ${params.to}`);
    }
  } catch (err) {
    console.error("[Meta API Network Error]:", err);
  }
}
