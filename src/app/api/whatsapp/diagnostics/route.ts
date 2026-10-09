import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const testTo = searchParams.get("testTo");

  const apiToken =
    process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken =
    process.env.WHATSAPP_VERIFY_TOKEN ||
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const botNumber = process.env.WHATSAPP_BOT_NUMBER;

  // 1. Testar consulta da Meta API
  let metaApiLive: any = null;
  if (apiToken && phoneId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      metaApiLive = await res.json();
    } catch (e: any) {
      metaApiLive = { error: e.message };
    }
  }

  // 2. Disparar teste se solicitado
  let testSendResult: any = null;
  if (testTo && apiToken && phoneId) {
    try {
      const cleanTo = testTo.replace(/[^\d]/g, "");
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanTo,
            type: "text",
            text: {
              preview_url: false,
              body: "🐾 Teste do PetRec: sua conexão com o WhatsApp oficial da Meta está funcionando perfeitamente! Envie 0 para ver o menu.",
            },
          }),
        }
      );
      testSendResult = await res.json();
    } catch (e: any) {
      testSendResult = { error: e.message };
    }
  }

  // 3. Buscar logs de webhook gravados no Convex
  let webhookLogs: any[] = [];
  try {
    webhookLogs = await convex.query(api.whatsapp.listWebhookLogs);
  } catch (e: any) {
    webhookLogs = [];
  }

  return NextResponse.json({
    environment: {
      hasApiToken: !!apiToken,
      apiTokenPreview: apiToken
        ? `${apiToken.substring(0, 12)}... (tam: ${apiToken.length})`
        : "NÃO CONFIGURADO",
      hasPhoneId: !!phoneId,
      phoneId: phoneId || "NÃO CONFIGURADO",
      hasVerifyToken: !!verifyToken,
      verifyToken: verifyToken || "petrec_webhook_secret_token (padrão)",
      hasBotNumber: !!botNumber,
      botNumber: botNumber || "15551874911",
      convexUrl:
        process.env.NEXT_PUBLIC_CONVEX_URL ||
        "https://robust-bullfrog-290.convex.cloud",
    },
    metaApiLive,
    testSendResult,
    webhookLogs,
  });
}
