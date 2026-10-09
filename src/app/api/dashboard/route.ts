import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { calculateStockForecast } from "@/lib/stockCalculation";
import { differenceInCalendarDays, startOfDay } from "date-fns";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const petId = searchParams.get("petId");

  try {
    const allPets = await convex.query(api.pets.listAll);

    if (allPets.length === 0) {
      return NextResponse.json({
        pets: [],
        activePet: null,
        today: { administrations: [], appointments: [] },
        attention: {
          criticalStock: [],
          attentionStock: [],
          upcomingVaccines: [],
          pendingPrescriptions: [],
          pendingTasksCount: 0,
        },
        purchases: { pendingList: [], completedList: [] },
        health: { vaccines: [], upcomingAppointments: [] },
        inventory: [],
        medications: [],
        recentActivities: [],
      });
    }

    const activePetBasic = (petId ? allPets.find((p) => p._id === petId) : null) || allPets[0];
    const activePetId = activePetBasic._id;

    const [
      activePetWithMembers,
      inventoryItems,
      medications,
      administrationsToday,
      petHealth,
      shoppingList,
      recentActivities,
    ] = await Promise.all([
      convex.query(api.pets.getById, { petId: activePetId }).catch(() => activePetBasic),
      convex.query(api.inventory.listByPet, { petId: activePetId }).catch(() => []),
      convex.query(api.medications.listByPet, { petId: activePetId }).catch(() => []),
      convex.query(api.medications.getAdministrationsToday, { petId: activePetId }).catch(() => []),
      convex.query(api.health.getPetHealth, { petId: activePetId }).catch(() => ({
        weights: [],
        vaccines: [],
        appointments: [],
        clinicalNotes: [],
        healthEvents: [],
      })),
      convex.query(api.inventory.listShoppingList, { petId: activePetId }).catch(() => []),
      convex.query(api.inventory.listActivityLogs, { petId: activePetId }).catch(() => []),
    ]);

    const stockForecasts = (inventoryItems || []).map((item: any) => {
      const forecast = calculateStockForecast({
        currentQuantity: item.currentQuantity,
        dailyConsumption: item.dailyConsumption,
        unit: item.unit,
        purchaseLeadTimeDays: item.purchaseLeadTimeDays || 7,
      });

      return {
        ...item,
        id: item._id,
        forecast,
      };
    });

    const criticalStockItems = stockForecasts.filter(
      (i) =>
        i.forecast.status === "COMPRAR AGORA" ||
        i.forecast.status === "SEM ESTOQUE" ||
        i.forecast.status === "ESTOQUE INSUFICIENTE"
    );

    const attentionStockItems = stockForecasts.filter(
      (i) => i.forecast.status === "ATENÇÃO"
    );

    const today = new Date();
    const vaccinations = (petHealth?.vaccines || []).map((v: any) => ({
      ...v,
      id: v._id,
    }));
    const appointments = (petHealth?.appointments || []).map((a: any) => ({
      ...a,
      id: a._id,
    }));

    const upcomingVaccines = vaccinations
      .filter((v: any) => v.nextDueDate)
      .map((v: any) => {
        const daysUntil = differenceInCalendarDays(new Date(v.nextDueDate), today);
        return {
          ...v,
          daysUntil,
          isUpcoming: daysUntil >= 0 && daysUntil <= 30,
          isOverdue: daysUntil < 0,
        };
      })
      .filter((v: any) => v.isUpcoming || v.isOverdue);

    const multiPetStatus = allPets.map((p) => ({
      id: p._id,
      name: p.name,
      photo: p.photo || null,
      species: p.species,
      statusColor: "green" as const,
      statusText: "Tudo em dia",
    }));

    return NextResponse.json({
      activePet: {
        ...activePetWithMembers,
        id: activePetWithMembers?._id || activePetId,
        members: (activePetWithMembers as any)?.members || [],
      },
      pets: multiPetStatus,
      today: {
        administrations: (administrationsToday || []).map((adm: any) => ({
          ...adm,
          id: adm._id,
        })),
        appointments: appointments.filter(
          (a: any) => differenceInCalendarDays(new Date(a.date), today) === 0
        ),
      },
      attention: {
        criticalStock: criticalStockItems,
        attentionStock: attentionStockItems,
        upcomingVaccines,
        pendingPrescriptions: (medications || []).filter(
          (m: any) => m.status === "pending_tutor_approval"
        ),
        pendingTasksCount:
          criticalStockItems.length +
          (administrationsToday || []).filter((a: any) => a.status === "scheduled").length,
      },
      purchases: {
        pendingList: (shoppingList || []).filter((s: any) => !s.isPurchased),
        completedList: (shoppingList || []).filter((s: any) => s.isPurchased),
      },
      health: {
        vaccines: vaccinations,
        upcomingAppointments: appointments.filter(
          (a: any) => new Date(a.date) >= startOfDay(today)
        ),
      },
      inventory: stockForecasts,
      medications: (medications || []).map((m: any) => ({ ...m, id: m._id })),
      recentActivities: (recentActivities || []).map((l: any) => ({
        ...l,
        id: l._id,
        timestamp: l.timestamp || l._creationTime || new Date().toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Erro ao carregar dados do dashboard via Convex", details: error.message },
      { status: 500 }
    );
  }
}
