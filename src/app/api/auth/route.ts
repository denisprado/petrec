import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

function extractCleanError(error: unknown, fallback = "Erro ao processar autenticação."): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (!raw) return fallback;
  const uncaughtMatch = raw.match(/Uncaught Error:\s*([^\n\r]+)/i);
  if (uncaughtMatch?.[1]) {
    return uncaughtMatch[1].replace(/\s+at\s+handler.*$/i, "").trim();
  }
  return raw.split("\n")[0].trim() || fallback;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const users = await convex.query(api.users.list, {});
    const currentUser = userId
      ? users.find((u: any) => (u._id || u.id) === userId) || null
      : null;

    return NextResponse.json({
      users,
      currentUser,
    });
  } catch (error) {
    console.error("GET /api/auth error:", error);
    return NextResponse.json(
      { error: extractCleanError(error, "Erro ao buscar usuários.") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body || {};

    if (action === "login") {
      const { email, password } = body;
      if (!email || !password) {
        return NextResponse.json(
          { error: "Informe e-mail e senha para entrar." },
          { status: 400 }
        );
      }

      const user = await convex.mutation(api.users.login, {
        email: String(email),
        password: String(password),
      });

      const users = await convex.query(api.users.list, {});
      return NextResponse.json({
        success: true,
        user,
        users,
      });
    }

    if (action === "register") {
      const {
        name,
        email,
        password,
        whatsappPhoneNumber,
        avatar,
        roleDescription,
        linkToExistingPetsRole,
      } = body;

      if (!name || !email || !password) {
        return NextResponse.json(
          { error: "Nome, e-mail e senha são obrigatórios." },
          { status: 400 }
        );
      }

      const user = await convex.mutation(api.users.register, {
        name: String(name),
        email: String(email),
        password: String(password),
        whatsappPhoneNumber: whatsappPhoneNumber ? String(whatsappPhoneNumber) : undefined,
        avatar: avatar ? String(avatar) : undefined,
        roleDescription: roleDescription ? String(roleDescription) : undefined,
        linkToExistingPetsRole: linkToExistingPetsRole
          ? String(linkToExistingPetsRole)
          : undefined,
      });

      const users = await convex.query(api.users.list, {});
      return NextResponse.json({
        success: true,
        user,
        users,
      });
    }

    if (action === "update_profile") {
      const {
        userId,
        name,
        email,
        avatar,
        whatsappPhoneNumber,
        roleDescription,
        newPassword,
      } = body;

      if (!userId || !name) {
        return NextResponse.json(
          { error: "ID do usuário e nome são obrigatórios." },
          { status: 400 }
        );
      }

      const user = await convex.mutation(api.users.updateProfile, {
        userId: userId as any,
        name: String(name),
        email: email !== undefined ? String(email) : undefined,
        avatar: avatar !== undefined ? String(avatar) : undefined,
        whatsappPhoneNumber:
          whatsappPhoneNumber !== undefined ? String(whatsappPhoneNumber) : undefined,
        roleDescription:
          roleDescription !== undefined ? String(roleDescription) : undefined,
        newPassword: newPassword ? String(newPassword) : undefined,
      });

      const users = await convex.query(api.users.list, {});
      return NextResponse.json({
        success: true,
        user,
        users,
      });
    }

    return NextResponse.json(
      { error: "Ação de autenticação inválida." },
      { status: 400 }
    );
  } catch (error) {
    const cleanMessage = extractCleanError(error);
    const isAuthFailure =
      cleanMessage.includes("Senha incorreta") ||
      cleanMessage.includes("Conta não encontrada");
    return NextResponse.json(
      { error: cleanMessage },
      { status: isAuthFailure ? 401 : 400 }
    );
  }
}
