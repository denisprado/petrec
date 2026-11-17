import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Envie um arquivo de imagem válido no campo 'file'." },
        { status: 400 }
      );
    }

    const contentType = file.type || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Apenas arquivos de imagem são permitidos." },
        { status: 400 }
      );
    }

    if (file.size > 6 * 1024 * 1024) {
      return NextResponse.json(
        { error: "A imagem deve ter no máximo 6 MB." },
        { status: 400 }
      );
    }

    // 1. Solicitar URL assinada de upload ao Convex File Storage
    const uploadUrl = await convex.mutation(api.files.generateUploadUrl, {});
    if (!uploadUrl) {
      return NextResponse.json(
        { error: "Não foi possível gerar URL de upload no Convex." },
        { status: 500 }
      );
    }

    // 2. Enviar o binário da imagem para o storage do Convex
    const arrayBuffer = await file.arrayBuffer();
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
      },
      body: arrayBuffer,
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Falha ao enviar arquivo ao storage (${uploadRes.status}): ${errBody}` },
        { status: 500 }
      );
    }

    const { storageId } = (await uploadRes.json()) as { storageId?: string };
    if (!storageId) {
      return NextResponse.json(
        { error: "Convex Storage não retornou storageId." },
        { status: 500 }
      );
    }

    // 3. Obter a URL pública permanente da imagem
    const publicUrl = await convex.mutation(api.files.getImageUrl, {
      storageId: storageId as any,
    });

    if (!publicUrl) {
      return NextResponse.json(
        { error: "Não foi possível obter a URL pública da imagem." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      storageId,
    });
  } catch (error: any) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno ao fazer upload da imagem." },
      { status: 500 }
    );
  }
}
