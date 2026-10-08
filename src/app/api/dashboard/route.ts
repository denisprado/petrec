import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStockForecast } from "@/lib/stockCalculation";
import { differenceInCalendarDays, startOfDay } from "date-fns";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const petId = searchParams.get("petId");

  try {
    // 1. Obter todos os pets associados ao usuário (ou todos se não passar userId para demonstração)
    let pets;
    if (userId) {
      const userMembers = await prisma.petMember.findMany({
        where: { userId },
        include: { pet: true },
      });
      pets = userMembers.map((m) => ({ ...m.pet, userRole: m.role }));
    } else {
      pets = await prisma.pet.findMany({
        include: {
          members: {
            include: { user: true },
          },
        },
      });
    }

    if (pets.length === 0) {
      return NextResponse.json({ pets: [], activePet: null });
    }

    // Identificar pet ativo
    const activePet = (petId ? pets.find((p) => p.id === petId) : null) || pets[0];

    // 2. Carregar dados completos do Pet Ativo
    const [
      inventoryItems,
      medications,
      administrationsToday,
      vaccinations,
      appointments,
      shoppingList,
      recentActivities,
      members,
    ] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { petId: activePet.id },
        include: { medication: true },
      }),
      prisma.medication.findMany({
        where: { petId: activePet.id },
        include: {
          schedules: true,
          inventoryItem: true,
          prescribedBy: { include: { professionalProfile: true } },
        },
      }),
      prisma.medicationAdministration.findMany({
        where: {
          petId: activePet.id,
          scheduledAt: {
            gte: startOfDay(new Date()),
          },
        },
        include: {
          medication: true,
          administeredBy: true,
        },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.vaccination.findMany({
        where: { petId: activePet.id },
        orderBy: { nextDueDate: "asc" },
      }),
      prisma.appointment.findMany({
        where: { petId: activePet.id },
        orderBy: { date: "asc" },
      }),
      prisma.shoppingListItem.findMany({
        where: { petId: activePet.id },
        include: { inventoryItem: true, purchasedBy: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.activityLog.findMany({
        where: { petId: activePet.id },
        include: { user: true },
        orderBy: { timestamp: "desc" },
        take: 10,
      }),
      prisma.petMember.findMany({
        where: { petId: activePet.id },
        include: { user: true },
      }),
    ]);

    // 3. Processar Previsão Contínua de Estoque para cada item
    const stockForecasts = inventoryItems.map((item) => {
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

    // 4. Filtrar Itens Críticos que Exigem Ação
    const criticalStockItems = stockForecasts.filter(
      (i) =>
        i.forecast.status === "COMPRAR AGORA" ||
        i.forecast.status === "SEM ESTOQUE" ||
        i.forecast.status === "ESTOQUE INSUFICIENTE"
    );

    const attentionStockItems = stockForecasts.filter(
      (i) => i.forecast.status === "ATENÇÃO"
    );

    // 5. Alertas de Vacinas Próximas (vencendo em até 30 dias)
    const today = new Date();
    const upcomingVaccines = vaccinations
      .filter((v) => v.nextDueDate)
      .map((v) => {
        const daysUntil = differenceInCalendarDays(new Date(v.nextDueDate!), today);
        return {
          ...v,
          daysUntil,
          isUpcoming: daysUntil >= 0 && daysUntil <= 30,
          isOverdue: daysUntil < 0,
        };
      })
      .filter((v) => v.isUpcoming || v.isOverdue);

    // 6. Multi-Pet Status Geral (Para o seletor Multi-Pet)
    const multiPetStatus = await Promise.all(
      pets.map(async (p) => {
        const pItems = await prisma.inventoryItem.findMany({ where: { petId: p.id } });
        const pVaccines = await prisma.vaccination.findMany({ where: { petId: p.id } });

        let statusColor: "green" | "yellow" | "red" = "green";
        let statusText = "Tudo em dia";

        for (const item of pItems) {
          const fc = calculateStockForecast({
            currentQuantity: item.currentQuantity,
            dailyConsumption: item.dailyConsumption,
            unit: item.unit,
            purchaseLeadTimeDays: item.purchaseLeadTimeDays,
          });
          if (fc.status === "COMPRAR AGORA" || fc.status === "SEM ESTOQUE") {
            statusColor = "red";
            statusText = `${item.name.split(" ")[0]} acabando`;
            break;
          } else if (fc.status === "ATENÇÃO") {
            statusColor = "yellow";
            statusText = "Estoque em atenção";
          }
        }

        if (statusColor === "green") {
          for (const v of pVaccines) {
            if (v.nextDueDate) {
              const days = differenceInCalendarDays(new Date(v.nextDueDate), today);
              if (days >= 0 && days <= 20) {
                statusColor = "yellow";
                statusText = `Vacina em ${days} dias`;
                break;
              }
            }
          }
        }

        return {
          id: p.id,
          name: p.name,
          photo: p.photo,
          species: p.species,
          statusColor,
          statusText,
        };
      })
    );

    return NextResponse.json({
      activePet: {
        ...activePet,
        members,
      },
      pets: multiPetStatus,
      today: {
        administrations: administrationsToday,
        appointments: appointments.filter(
          (a) => differenceInCalendarDays(new Date(a.date), today) === 0
        ),
      },
      attention: {
        criticalStock: criticalStockItems,
        attentionStock: attentionStockItems,
        upcomingVaccines,
        pendingPrescriptions: medications.filter(
          (m) => m.status === "pending_tutor_approval"
        ),
        pendingTasksCount:
          criticalStockItems.length +
          administrationsToday.filter((a) => a.status === "scheduled").length +
          medications.filter((m) => m.status === "pending_tutor_approval").length,
      },
      purchases: {
        pendingList: shoppingList.filter((s) => !s.isPurchased),
        completedList: shoppingList.filter((s) => s.isPurchased),
      },
      health: {
        vaccines: vaccinations,
        upcomingAppointments: appointments.filter(
          (a) => new Date(a.date) >= startOfDay(today)
        ),
      },
      inventory: stockForecasts,
      medications,
      recentActivities,
    });
  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Erro ao carregar dados do dashboard", details: error.message },
      { status: 500 }
    );
  }
}
