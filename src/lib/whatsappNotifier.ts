import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

function getDefaultConvexClient(): ConvexHttpClient {
  return new ConvexHttpClient(
    process.env.NEXT_PUBLIC_CONVEX_URL ||
      "https://robust-bullfrog-290.convex.cloud"
  );
}

export function formatWhatsAppRecipient(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  // Se for celular do Brasil (DDI 55) com DDD e apenas 8 dígitos (total 12 dígitos), insere o 9º dígito:
  if (clean.startsWith("55") && clean.length === 12) {
    const ddd = clean.slice(2, 4);
    const rest = clean.slice(4);
    return `55${ddd}9${rest}`;
  }
  return clean;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 4500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMetaWhatsAppMessage(params: {
  to: string;
  text: string;
  apiToken: string;
  phoneId: string;
}): Promise<{ success: boolean; error?: any }> {
  const url = `https://graph.facebook.com/v21.0/${params.phoneId}/messages`;
  const targetTo = formatWhatsAppRecipient(params.to);

  async function postMessage(recipient: string, targetUrl = url) {
    return await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: {
          preview_url: false,
          body: params.text,
        },
      }),
    });
  }

  try {
    const res = await postMessage(targetTo);
    let resData = await res.json().catch(() => ({}));

    // Fallback: Se a Meta rejeitar por erro 131030 (não permitido), tenta versão alternativa (com ou sem 9)
    if (!res.ok && resData?.error?.code === 131030) {
      const alternateTo =
        targetTo.length === 13 && targetTo.startsWith("55")
          ? `55${targetTo.slice(2, 4)}${targetTo.slice(5)}`
          : formatWhatsAppRecipient(targetTo);

      if (alternateTo !== targetTo) {
        const retryRes = await postMessage(alternateTo);
        const retryData = await retryRes.json().catch(() => ({}));
        if (retryRes.ok) {
          console.log(`[Meta API Send Success] Enviado no formato alternativo para ${alternateTo}`);
          return { success: true };
        }
        resData = retryData;
      }
    }

    // Fallback: Se a Meta rejeitar por erro 131037 (display name pendente no número), tenta fallback pré-aprovado
    if (!res.ok && resData?.error?.code === 131037) {
      const fallbackPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (fallbackPhoneId && fallbackPhoneId !== params.phoneId) {
        const fallbackUrl = `https://graph.facebook.com/v21.0/${fallbackPhoneId}/messages`;
        const retryRes = await postMessage(targetTo, fallbackUrl);
        const retryData = await retryRes.json().catch(() => ({}));
        if (retryRes.ok) {
          console.log(
            `[Meta API Send Success] Enviado via fallback (${fallbackPhoneId}) para ${targetTo}`
          );
          return { success: true };
        }
        resData = retryData;
      }
    }

    if (!res.ok) {
      console.error("[Meta API Send Error]:", JSON.stringify(resData, null, 2));
      return { success: false, error: resData };
    }

    console.log(`[Meta API Send Success] Mensagem enviada para ${targetTo}`);
    return { success: true };
  } catch (err: any) {
    console.error("[Meta API Network Error]:", err);
    return { success: false, error: err?.message || "Erro de rede" };
  }
}

export async function notifyPetMembersOnWhatsApp(params: {
  convex?: ConvexHttpClient;
  petId: string;
  actorUserId?: string;
  summary: string;
  phoneIdOverride?: string;
}): Promise<{
  notifiedCount: number;
  recipients: Array<{ name: string; phone: string }>;
}> {
  try {
    if (!params.petId || !params.summary?.trim()) {
      return { notifiedCount: 0, recipients: [] };
    }

    const client = params.convex || getDefaultConvexClient();
    const data = await client.query(api.whatsapp.getPetNotificationRecipients, {
      petId: params.petId as any,
      excludeUserId: params.actorUserId ? (params.actorUserId as any) : undefined,
    });

    const recipients = data?.recipients || [];
    if (recipients.length === 0) {
      return { notifiedCount: 0, recipients: [] };
    }

    const notificationText =
      `🔔 *Atividade de ${data.petName} — PetRec*\n` +
      `👤 Registrado por: *${data.actorName}*\n\n` +
      `${params.summary.trim()}`;

    const apiToken =
      process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId =
      params.phoneIdOverride || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (apiToken && phoneId) {
      await Promise.allSettled(
        recipients.map((recipient) =>
          sendMetaWhatsAppMessage({
            to: recipient.phone,
            text: notificationText,
            apiToken,
            phoneId,
          })
        )
      );
    }

    return {
      notifiedCount: recipients.length,
      recipients: recipients.map((r) => ({
        name: r.name,
        phone: r.phone,
      })),
    };
  } catch (err) {
    console.warn("[WhatsAppNotifier] Aviso ao notificar membros do pet:", err);
    return { notifiedCount: 0, recipients: [] };
  }
}
