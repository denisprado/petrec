import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  if (!petId) {
    return NextResponse.json({ error: "petId é obrigatório" }, { status: 400 });
  }

  try {
    const items = await prisma.shoppingListItem.findMany({
      where: { petId },
      include: {
        inventoryItem: true,
        purchasedBy: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { petId, inventoryItemId, customName, quantity, unit, userId } = body;

    if (!petId || (!inventoryItemId && !customName)) {
      return NextResponse.json(
        { error: "Informe o pet e o item a comprar" },
        { status: 400 }
      );
    }

    const item = await prisma.shoppingListItem.create({
      data: {
        petId,
        inventoryItemId: inventoryItemId || null,
        customName: customName || null,
        quantity: quantity ? Number(quantity) : null,
        unit: unit || null,
        isPurchased: false,
      },
      include: {
        inventoryItem: true,
      },
    });

    if (userId) {
      const itemName = customName || item.inventoryItem?.name || "Item";
      await prisma.activityLog.create({
        data: {
          petId,
          userId,
          action: `adicionou "${itemName}" à lista de compras`,
          entityType: "shopping_list",
          entityId: item.id,
        },
      });
    }

    return NextResponse.json({ success: true, item });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, isPurchased, userId } = body;

    if (!id || isPurchased === undefined) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    const item = await prisma.shoppingListItem.findUnique({
      where: { id },
      include: { inventoryItem: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    }

    const updated = await prisma.shoppingListItem.update({
      where: { id },
      data: {
        isPurchased,
        purchasedAt: isPurchased ? new Date() : null,
        purchasedByUserId: isPurchased ? userId : null,
      },
      include: {
        purchasedBy: true,
        inventoryItem: true,
      },
    });

    // Registrar no audit log
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const userName = user?.name || "Tutor";
      const itemName = item.customName || item.inventoryItem?.name || "Item";
      const dateFormatted = format(new Date(), "dd/MM/yyyy", { locale: ptBR });

      await prisma.activityLog.create({
        data: {
          petId: item.petId,
          userId,
          action: isPurchased
            ? `marcou "${itemName}" como comprado em ${dateFormatted}`
            : `desmarcou "${itemName}" da lista de compras`,
          entityType: "shopping_list",
          entityId: item.id,
        },
      });
    }

    return NextResponse.json({ success: true, item: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
