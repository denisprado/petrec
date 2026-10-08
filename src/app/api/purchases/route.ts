import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStockForecast } from "@/lib/stockCalculation";
import { getRolePermissions } from "@/lib/permissions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");
  const userId = searchParams.get("userId");

  if (!petId) {
    return NextResponse.json({ error: "petId é obrigatório" }, { status: 400 });
  }

  try {
    if (userId) {
      const membership = await prisma.petMember.findUnique({
        where: { petId_userId: { petId, userId } },
      });
      if (membership) {
        const perms = getRolePermissions(membership.role);
        if (!perms.canViewFinancials) {
          return NextResponse.json({
            purchases: [],
            financialsBlocked: true,
            message: "Dados financeiros e valores de compra são restritos aos tutores.",
          });
        }
      }
    }

    const purchases = await prisma.purchase.findMany({
      where: { petId },
      include: {
        user: true,
        items: {
          include: {
            inventoryItem: true,
          },
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ purchases, financialsBlocked: false });
  } catch (error: any) {
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

    const membership = await prisma.petMember.findUnique({
      where: { petId_userId: { petId, userId } },
    });
    if (membership) {
      const perms = getRolePermissions(membership.role);
      if (!perms.canRegisterPurchases) {
        return NextResponse.json(
          { error: "Seu papel não possui permissão para registrar compras financeiras." },
          { status: 403 }
        );
      }
    }

    let total = 0;
    for (const it of items) {
      total += Number(it.quantity) * Number(it.unitPrice || 0);
    }

    // 1. Criar Compra
    const purchase = await prisma.purchase.create({
      data: {
        petId,
        userId,
        supplier: supplier || "Loja Pet",
        total,
        notes,
        date: new Date(),
      },
    });

    // 2. Iterar itens comprados, atualizar estoque e recalcular previsão
    for (const it of items) {
      const invItem = await prisma.inventoryItem.findUnique({
        where: { id: it.inventoryItemId },
      });

      if (invItem) {
        const itemQty = Number(it.quantity);
        const unitPrice = Number(it.unitPrice || 0);
        const itemTotal = itemQty * unitPrice;

        // Criar item da compra
        await prisma.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            inventoryItemId: invItem.id,
            quantity: itemQty,
            unitPrice,
            total: itemTotal,
          },
        });

        // Criar transação de estoque
        await prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: invItem.id,
            type: "purchase",
            quantity: itemQty,
            unitPrice,
            totalPrice: itemTotal,
            date: new Date(),
            userId,
            notes: `Compra realizada via fornecedor: ${supplier || "Loja"}`,
          },
        });

        // Atualizar estoque e recalcular previsão
        const newQty = invItem.currentQuantity + itemQty;
        const forecast = calculateStockForecast({
          currentQuantity: newQty,
          dailyConsumption: invItem.dailyConsumption,
          unit: invItem.unit,
          purchaseLeadTimeDays: invItem.purchaseLeadTimeDays,
        });

        await prisma.inventoryItem.update({
          where: { id: invItem.id },
          data: {
            currentQuantity: newQty,
            status: forecast.status,
            estimatedEndDate: forecast.estimatedEndDate,
          },
        });

        // Se este item estava na lista de compras como pendente, marca como comprado!
        await prisma.shoppingListItem.updateMany({
          where: {
            petId,
            inventoryItemId: invItem.id,
            isPurchased: false,
          },
          data: {
            isPurchased: true,
            purchasedAt: new Date(),
            purchasedByUserId: userId,
          },
        });
      }
    }

    // 3. Registrar no audit trail (ActivityLog)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.activityLog.create({
      data: {
        petId,
        userId,
        action: `registrou compra de R$ ${total.toFixed(2).replace(".", ",")} (${supplier || "Loja"})`,
        entityType: "purchase",
        entityId: purchase.id,
      },
    });

    return NextResponse.json({ success: true, purchase });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
