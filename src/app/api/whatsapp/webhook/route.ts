import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { processWhatsAppMessage } from "@/lib/whatsappBot";
import { sendMetaWhatsAppMessage } from "@/lib/whatsappNotifier";

export const maxDuration = 60;

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

// Barreira instantânea em memória para impedir reprocessamento paralelo na mesma instância
const processedMessageIds = new Set<string>();

function trackMessageId(id: string) {
  if (processedMessageIds.size > 500) {
    const first = processedMessageIds.values().next().value;
    if (first) processedMessageIds.delete(first);
  }
  processedMessageIds.add(id);
}

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

              const messageId: string =
                message.id || `${from}:${message.timestamp || Date.now()}`;

              if (processedMessageIds.has(messageId)) {
                console.log(
                  `[WhatsApp Webhook] Mensagem duplicada ignorada (memória): ${messageId}`
                );
                continue;
              }
              trackMessageId(messageId);

              const apiToken =
                process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;

              // Extrair texto ou identificação inicial da mídia antes do claim
              let text = "";
              let mediaType: "audio" | "image" | undefined;
              let mediaBase64: string | undefined;
              let mediaMimeType: string | undefined;

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
              } else if (message.type === "audio" && message.audio?.id) {
                mediaType = "audio";
                mediaMimeType = (message.audio.mime_type || "audio/ogg").split(";")[0].trim();
                text = "[Áudio recebido]";
              } else if (message.type === "image" && message.image?.id) {
                mediaType = "image";
                mediaMimeType = (message.image.mime_type || "image/jpeg").split(";")[0].trim();
                text = message.image.caption?.trim() || "[Imagem recebida]";
              }

              if (!text.trim() && !mediaType) continue;

              // Deduplicação atômica no Convex (evita retentativas e execução dupla da Meta)
              let claimedLogId: any = undefined;
              try {
                const claim = await convex.mutation(api.whatsapp.claimWebhookMessage, {
                  messageId,
                  from: `+${from}`,
                  messageText: text,
                });
                if (claim.alreadyProcessed) {
                  console.log(
                    `[WhatsApp Webhook] Mensagem duplicada ignorada (Convex): ${messageId}`
                  );
                  continue;
                }
                claimedLogId = claim.logId;
              } catch (claimErr) {
                console.warn("[WhatsApp Webhook] Aviso ao verificar idempotência no Convex:", claimErr);
              }

              // Baixar mídia somente após confirmar que a mensagem é inédita
              if (mediaType === "audio" && message.audio?.id && apiToken) {
                const downloaded = await downloadMetaMediaAsBase64(message.audio.id, apiToken);
                if (downloaded) {
                  mediaBase64 = downloaded.base64;
                  mediaMimeType = downloaded.mimeType;
                }
              } else if (mediaType === "image" && message.image?.id && apiToken) {
                const downloaded = await downloadMetaMediaAsBase64(message.image.id, apiToken);
                if (downloaded) {
                  mediaBase64 = downloaded.base64;
                  mediaMimeType = downloaded.mimeType;
                }
              }

              console.log(
                `[WhatsApp Inbound] ID: ${messageId} | De: +${from} | Tipo: ${message.type} | Mensagem: "${text}"`
              );

              const incomingPhoneId =
                value?.metadata?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;

              // Executar o motor conversacional do PetRec
              const botResult = await processWhatsAppMessage({
                fromPhone: from,
                messageText: text,
                mediaType,
                mediaBase64,
                mediaMimeType,
                metaPhoneNumberId: incomingPhoneId,
              });

              console.log(
                `[WhatsApp Outbound] Resposta para +${from}: "${botResult.replyText.substring(0, 60)}..."`
              );

              // Despachar a resposta de volta ao WhatsApp do usuário via Meta Cloud API
              const phoneId = incomingPhoneId;

              console.log(
                `[WhatsApp Outbound] Usando Phone ID: ${phoneId} (metadata: ${value?.metadata?.phone_number_id}, env: ${process.env.WHATSAPP_PHONE_NUMBER_ID})`
              );

              let sendStatus = "SUCCESS";
              let sendError: string | undefined = undefined;

              if (apiToken && phoneId) {
                const sendRes = await sendMetaWhatsAppMessage({
                  to: from,
                  text: botResult.replyText,
                  apiToken,
                  phoneId,
                });

                if (!sendRes.success) {
                  sendStatus = "META_ERROR";
                  sendError =
                    typeof sendRes.error === "object"
                      ? JSON.stringify(sendRes.error)
                      : String(sendRes.error);
                }
              } else {
                sendStatus = "CONFIG_MISSING";
                sendError =
                  "WHATSAPP_API_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurados no ambiente (Vercel).";
                console.warn(
                  "[WhatsApp Webhook] WHATSAPP_API_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurados. Mensagem não enviada à Meta."
                );
              }

              // Atualizar no histórico de logs do Convex com a resposta final
              try {
                await convex.mutation(api.whatsapp.logWebhookEvent, {
                  logId: claimedLogId,
                  messageId,
                  from: `+${from}`,
                  messageText: text,
                  replyText: botResult.replyText,
                  status: sendStatus,
                  metaError: sendError,
                });
              } catch (logErr) {
                console.error("[WhatsApp Webhook] Falha ao gravar log no Convex:", logErr);
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
    return NextResponse.json(
      { status: "ERROR_PROCESSED", error: error.message },
      { status: 200 }
    );
  }
}

async function downloadMetaMediaAsBase64(
  mediaId: string,
  apiToken: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!metaRes.ok) {
      console.error("[Meta Media Info Error]:", await metaRes.text().catch(() => ""));
      return null;
    }

    const metaInfo = await metaRes.json();
    if (!metaInfo?.url) return null;

    const fileRes = await fetch(metaInfo.url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!fileRes.ok) {
      console.error("[Meta Media Download Error]:", fileRes.status);
      return null;
    }

    const arrayBuf = await fileRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString("base64");
    const rawMime = metaInfo.mime_type || fileRes.headers.get("content-type") || "application/octet-stream";
    return {
      base64,
      mimeType: rawMime.split(";")[0].trim(),
    };
  } catch (err) {
    console.error("[Meta Media Download Network Error]:", err);
    return null;
  }
}
