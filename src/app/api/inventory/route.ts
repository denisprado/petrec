import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStockForecast } from "@/lib/stockCalculation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");

  if (!petId) {
    return NextResponse.json({ error: "petId é obrigatório" }, { status: 400 });
  }

  try {
    const items = await prisma.inventoryItem.findMany({
      where: { petId },
      include: {
        medication: true,
        transactions: {
          orderBy: { date: "desc" },
          take: 5,
          include: { user: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const itemsWithForecast = items.map((item) => {
      const forecast = calculateStockForecast({
        currentQuantity: item.currentQuantity,
        dailyConsumption: item.dailyConsumption,
        unit: item.unit,
        purchaseLeadTimeDays: item.purchaseLeadTimeDays,
      });

      return {
        ...item,
        forecast,
      };
    });

    return NextResponse.json({ items: itemsWithForecast });
  } catch (error: any) {
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
    } = body;

    if (!inventoryItemId || !type || quantity === undefined) {
      return NextResponse.json(
        { error: "Dados incompletos para a transação de estoque" },
        { status: 400 }
      );
    }

    const item = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item de estoque não encontrado" },
        { status: 404 }
      );
    }

    // Calcula nova quantidade
    let delta = Number(quantity);
    let newQuantity = item.currentQuantity;

    if (type === "purchase") {
      newQuantity += Math.abs(delta);
    } else if (type === "consumption" || type === "loss" || type === "expiration") {
      newQuantity = Math.max(0, newQuantity - Math.abs(delta));
      delta = -Math.abs(delta);
    } else if (type === "adjustment") {
      newQuantity = Math.max(0, delta); // ajuste direto para o valor informado
      delta = newQuantity - item.currentQuantity;
    }

    // 1. Criar transação de estoque
    const transaction = await prisma.inventoryTransaction.create({
      data: {
        inventoryItemId,
        type,
        quantity: delta,
        unitPrice: unitPrice ? Number(unitPrice) : null,
        totalPrice: totalPrice ? Number(totalPrice) : null,
        date: new Date(),
        userId: userId || null,
        notes: notes || null,
      },
    });

    // 2. Recalcular status com a nova quantidade
    const forecast = calculateStockForecast({
      currentQuantity: newQuantity,
      dailyConsumption: item.dailyConsumption,
      unit: item.unit,
      purchaseLeadTimeDays: item.purchaseLeadTimeDays,
    });

    // 3. Atualizar item
    const updatedItem = await prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data: {
        currentQuantity: newQuantity,
        status: forecast.status,
        estimatedEndDate: forecast.estimatedEndDate,
      },
    });

    // 4. Registrar no audit trail (ActivityLog)
    if (userId) {
      let actionText = `atualizou estoque de ${item.name} para ${newQuantity} ${item.unit}`;
      if (type === "consumption") {
        actionText = `registrou consumo de ${Math.abs(delta)} ${item.unit} de ${item.name}`;
      } else if (type === "purchase") {
        actionText = `registrou entrada de ${Math.abs(delta)} ${item.unit} de ${item.name}`;
      }

      await prisma.activityLog.create({
        data: {
          petId: item.petId,
          userId,
          action: actionText,
          entityType: "inventory",
          entityId: item.id,
          metadata: JSON.stringify({
            oldQuantity: item.currentQuantity,
            newQuantity,
            type,
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      transaction,
      item: {
        ...updatedItem,
        forecast,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      id,
      dailyConsumption,
      purchaseLeadTimeDays,
      currentQuantity,
      unit,
      userId,
    } = body;

    const existing = await prisma.inventoryItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    }

    const newDaily = dailyConsumption !== undefined ? Number(dailyConsumption) : existing.dailyConsumption;
    const newLead = purchaseLeadTimeDays !== undefined ? Number(purchaseLeadTimeDays) : existing.purchaseLeadTimeDays;
    const newQty = currentQuantity !== undefined ? Number(currentQuantity) : existing.currentQuantity;
    const newUnit = unit || existing.unit;

    const forecast = calculateStockForecast({
      currentQuantity: newQty,
      dailyConsumption: newDaily,
      unit: newUnit,
      purchaseLeadTimeDays: newLead,
    });

    const updated = await prisma.inventoryItem.update({
      where: { id },
      data: {
        dailyConsumption: newDaily,
        purchaseLeadTimeDays: newLead,
        currentQuantity: newQty,
        unit: newUnit,
        status: forecast.status,
        estimatedEndDate: forecast.estimatedEndDate,
      },
    });

    if (userId) {
      await prisma.activityLog.create({
        data: {
          petId: existing.petId,
          userId,
          action: `alterou parâmetros de consumo diário (${newDaily} ${newUnit}/dia) e antecedência (${newLead} dias) de ${existing.name}`,
          entityType: "inventory",
          entityId: id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      item: {
        ...updated,
        forecast,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
