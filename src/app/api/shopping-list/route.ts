import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://zany-owl-512.convex.cloud"
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  try {
    let targetPetId = petId;
    if (!targetPetId) {
      const allPets = await convex.query(api.pets.listAll);
      targetPetId = allPets[0]?._id;
    }

    if (!targetPetId) {
      return NextResponse.json({ items: [] });
    }

    const items = await convex.query(api.inventory.listShoppingList, {
      petId: targetPetId as any,
    });

    return NextResponse.json({ items: items || [] });
  } catch (error: any) {
    console.error("Shopping list GET error:", error);
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

    const itemId = await convex.mutation(api.inventory.addShoppingItem, {
      petId: petId as any,
      inventoryItemId: inventoryItemId ? (inventoryItemId as any) : undefined,
      customName: customName || undefined,
      quantity: quantity ? Number(quantity) : undefined,
      unit: unit || undefined,
      userId: userId ? (userId as any) : undefined,
    });

    return NextResponse.json({ success: true, itemId });
  } catch (error: any) {
    console.error("Shopping list POST error:", error);
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

    const updated = await convex.mutation(api.inventory.toggleShoppingItem, {
      id: id as any,
      isPurchased: Boolean(isPurchased),
      userId: userId ? (userId as any) : undefined,
    });

    return NextResponse.json({ success: true, item: updated });
  } catch (error: any) {
    console.error("Shopping list PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
