import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { addMinutes } from "date-fns";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://zany-owl-512.convex.cloud"
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
    }

    let user = null;
    try {
      user = await convex.query(api.users.getById, {
        userId: userId as any,
      });
    } catch {
      user = null;
    }

    if (!user) {
      // Fallback: tentar obter pelo primeiro usuário
      const allUsers = await convex.query(api.users.list);
      user = allUsers[0];
    }

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const targetUserId = user._id;

    const existingTokenDoc = await convex.query(api.users.getPairingToken, {
      userId: targetUserId,
    });

    let token = existingTokenDoc?.token;
    let expiresAt = existingTokenDoc?.expiresAt;

    if (!token) {
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      token = `LINK_${randomCode}`;
      expiresAt = addMinutes(new Date(), 30).getTime();

      await convex.mutation(api.users.createPairingToken, {
        userId: targetUserId,
        token,
        expiresAt,
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
    console.error("WhatsApp pairing GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, phone } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
    }

    let user = null;
    try {
      user = await convex.query(api.users.getById, {
        userId: userId as any,
      });
    } catch {
      user = null;
    }

    if (!user) {
      const allUsers = await convex.query(api.users.list);
      user = allUsers[0];
    }

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Se fornecido telefone direto para conectar:
    if (phone) {
      const digits = phone.replace(/[^\d]/g, "");
      const cleanPhone = digits.startsWith("+") ? digits : `+${digits}`;
      const res = await convex.mutation(api.whatsapp.directConnect, {
        userId: user._id,
        phone: cleanPhone,
      });
      return NextResponse.json({
        success: true,
        connectedPhone: cleanPhone,
        isVerified: true,
        user: res.user,
      });
    }

    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const token = `LINK_${randomCode}`;
    const expiresAt = addMinutes(new Date(), 30).getTime();

    await convex.mutation(api.users.createPairingToken, {
      userId: user._id,
      token,
      expiresAt,
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
    console.error("WhatsApp pairing POST error:", error);
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

    let targetUserId: any = userId;
    try {
      const user = await convex.query(api.users.getById, { userId: userId as any });
      if (user) targetUserId = user._id;
    } catch {
      const allUsers = await convex.query(api.users.list);
      if (allUsers[0]) targetUserId = allUsers[0]._id;
    }

    await convex.mutation(api.users.disconnectWhatsApp, {
      userId: targetUserId,
    });

    return NextResponse.json({
      success: true,
      message: "WhatsApp desconectado com sucesso.",
    });
  } catch (error: any) {
    console.error("WhatsApp pairing DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
