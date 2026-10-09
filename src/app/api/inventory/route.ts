import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { calculateStockForecast } from "@/lib/stockCalculation";

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

    const items = await convex.query(api.inventory.listByPet, {
      petId: targetPetId as any,
    });

    const itemsWithForecast = (items || []).map((item: any) => {
      const forecast = calculateStockForecast({
        currentQuantity: item.currentQuantity,
        dailyConsumption: item.dailyConsumption,
        unit: item.unit,
        purchaseLeadTimeDays: item.purchaseLeadTimeDays,
      });

      return {
        ...item,
        id: item._id,
        forecast,
      };
    });

    return NextResponse.json({ items: itemsWithForecast });
  } catch (error: any) {
    console.error("Inventory GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      inventoryItemId,
      type, // "consumption", "purchase", "adjustment", "loss", "expiration"
      quantity, // valor da transação
      unitPrice,
      totalPrice,
      notes,
      userId,
      petId,
      // Se for criação de novo item de estoque
      isNewItem,
      name,
      category,
      unit,
      currentQuantity,
      dailyConsumption,
      purchaseLeadTimeDays,
    } = body;

    // Se for criação de um novo item de estoque (ração, petisco, medicamento etc)
    if (isNewItem || (!inventoryItemId && name && petId)) {
      if (!name || !unit || dailyConsumption === undefined) {
        return NextResponse.json(
          { error: "Nome, unidade e consumo diário são obrigatórios para novo item." },
          { status: 400 }
        );
      }

      const newItemId = await convex.mutation(api.inventory.createItem, {
        petId: petId as any,
        name: name.trim(),
        category: category || "racao",
        unit: unit.trim(),
        currentQuantity: Number(currentQuantity || 0),
        dailyConsumption: Number(dailyConsumption || 0),
        purchaseLeadTimeDays: Number(purchaseLeadTimeDays || 7),
        notes: notes || undefined,
        userId: userId ? (userId as any) : undefined,
      });

      return NextResponse.json({
        success: true,
        itemId: newItemId,
        message: `Item ${name} cadastrado no estoque com sucesso!`,
      });
    }

    if (!inventoryItemId || !type || quantity === undefined) {
      return NextResponse.json(
        { error: "Dados incompletos para a transação de estoque" },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.inventory.recordTransaction, {
      inventoryItemId: inventoryItemId as any,
      type,
      quantity: Number(quantity),
      unitPrice: unitPrice ? Number(unitPrice) : undefined,
      totalPrice: totalPrice ? Number(totalPrice) : undefined,
      notes: notes || undefined,
      userId: userId ? (userId as any) : undefined,
    });

    const updatedItem = result.item;
    const forecast = updatedItem
      ? calculateStockForecast({
          currentQuantity: updatedItem.currentQuantity,
          dailyConsumption: updatedItem.dailyConsumption,
          unit: updatedItem.unit,
          purchaseLeadTimeDays: updatedItem.purchaseLeadTimeDays,
        })
      : null;

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
      item: updatedItem
        ? {
            ...updatedItem,
            id: updatedItem._id,
            forecast,
          }
        : null,
    });
  } catch (error: any) {
    console.error("Inventory POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      id,
      name,
      category,
      dailyConsumption,
      purchaseLeadTimeDays,
      currentQuantity,
      unit,
      notes,
      userId,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID do item de estoque é obrigatório." },
        { status: 400 }
      );
    }

    const updated = await convex.mutation(api.inventory.updateItem, {
      id: id as any,
      name: name !== undefined ? String(name).trim() : undefined,
      category: category || undefined,
      dailyConsumption:
        dailyConsumption !== undefined ? Number(dailyConsumption) : undefined,
      purchaseLeadTimeDays:
        purchaseLeadTimeDays !== undefined
          ? Number(purchaseLeadTimeDays)
          : undefined,
      currentQuantity:
        currentQuantity !== undefined ? Number(currentQuantity) : undefined,
      unit: unit || undefined,
      notes: notes !== undefined ? String(notes).trim() : undefined,
      userId: userId ? (userId as any) : undefined,
    });

    const forecast = updated
      ? calculateStockForecast({
          currentQuantity: updated.currentQuantity,
          dailyConsumption: updated.dailyConsumption,
          unit: updated.unit,
          purchaseLeadTimeDays: updated.purchaseLeadTimeDays,
        })
      : null;

    return NextResponse.json({
      success: true,
      item: updated
        ? {
            ...updated,
            id: updated._id,
            forecast,
          }
        : null,
    });
  } catch (error: any) {
    console.error("Inventory PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    await convex.mutation(api.inventory.deleteItem, {
      id: id as any,
      userId: userId ? (userId as any) : undefined,
    });

    return NextResponse.json({ success: true, message: "Item excluído do estoque com sucesso." });
  } catch (error: any) {
    console.error("Inventory DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
