import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { getRolePermissions } from "@/lib/permissions";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");
  const userId = searchParams.get("userId");

  try {
    let targetPetId = petId;
    if (!targetPetId) {
      const allPets = await convex.query(api.pets.listAll);
      targetPetId = allPets[0]?._id;
    }

    if (!targetPetId) {
      return NextResponse.json({ purchases: [], financialsBlocked: false });
    }

    // RBAC check
    if (userId) {
      const pet = await convex.query(api.pets.getById, {
        petId: targetPetId as any,
      });
      if (pet && (pet as any).members) {
        const membership = (pet as any).members.find(
          (m: any) => m.userId === userId
        );
        if (membership) {
          const perms = getRolePermissions(membership.role);
          if (!perms.canViewFinancials) {
            return NextResponse.json({
              purchases: [],
              financialsBlocked: true,
              message:
                "Dados financeiros e valores de compra são restritos aos tutores.",
            });
          }
        }
      }
    }

    const purchases = await convex.query(api.inventory.listPurchases, {
      petId: targetPetId as any,
    });

    return NextResponse.json({ purchases, financialsBlocked: false });
  } catch (error: any) {
    console.error("Purchases GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { petId, userId, supplier, items, notes } = body;

    if (!petId || !userId || !items || !items.length) {
      return NextResponse.json(
        { error: "Dados incompletos para registrar a compra" },
        { status: 400 }
      );
    }

    // Validação de permissões
    const pet = await convex.query(api.pets.getById, { petId: petId as any });
    if (pet && (pet as any).members) {
      const membership = (pet as any).members.find(
        (m: any) => m.userId === userId
      );
      if (membership) {
        const perms = getRolePermissions(membership.role);
        if (!perms.canRegisterPurchases) {
          return NextResponse.json(
            {
              error:
                "Seu papel não possui permissão para registrar compras financeiras.",
            },
            { status: 403 }
          );
        }
      }
    }

    let total = 0;
    const formattedItems = [];

    for (const it of items) {
      const qty = Number(it.quantity);
      const unitPrice = Number(it.unitPrice || 0);
      total += qty * unitPrice;

      formattedItems.push({
        inventoryItemId: it.inventoryItemId as any,
        quantity: qty,
        unitPrice,
      });
    }

    const purchaseId = await convex.mutation(api.inventory.recordPurchaseFull, {
      petId: petId as any,
      userId: userId as any,
      supplier: supplier || "Loja Pet",
      total,
      notes: notes || undefined,
      items: formattedItems,
    });

    return NextResponse.json({
      success: true,
      purchaseId,
      message: "Compra registrada com sucesso no Convex!",
    });
  } catch (error: any) {
    console.error("Purchases POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
