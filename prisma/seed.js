const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding PetRec database...");

  // Clean old data if any
  await prisma.clinicalNote.deleteMany({});
  await prisma.professionalProfile.deleteMany({});
  await prisma.whatsappSession.deleteMany({});
  await prisma.whatsappPairingToken.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.shoppingListItem.deleteMany({});
  await prisma.purchaseItem.deleteMany({});
  await prisma.purchase.deleteMany({});
  await prisma.inventoryTransaction.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  await prisma.medicationAdministration.deleteMany({});
  await prisma.medicationSchedule.deleteMany({});
  await prisma.medication.deleteMany({});
  await prisma.vaccination.deleteMany({});
  await prisma.healthEvent.deleteMany({});
  await prisma.weightRecord.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.petInvitation.deleteMany({});
  await prisma.petMember.deleteMany({});
  await prisma.pet.deleteMany({});
  await prisma.user.deleteMany({});

  // 1. Create Users
  const denis = await prisma.user.create({
    data: {
      name: "Denis Forigo",
      email: "denis@exemplo.com",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      timezone: "America/Sao_Paulo",
      whatsappPhoneNumber: "+5519988887777",
    },
  });

  const ana = await prisma.user.create({
    data: {
      name: "Ana Silva",
      email: "ana@exemplo.com",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
      timezone: "America/Sao_Paulo",
    },
  });

  const joao = await prisma.user.create({
    data: {
      name: "João Cuidador",
      email: "joao@exemplo.com",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      timezone: "America/Sao_Paulo",
    },
  });

  const draCamila = await prisma.user.create({
    data: {
      name: "Dra. Camila Ramos",
      email: "camila@veterinaria.com",
      avatar: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80",
      timezone: "America/Sao_Paulo",
    },
  });

  await prisma.professionalProfile.create({
    data: {
      userId: draCamila.id,
      professionalType: "vet",
      registerNumber: "CRMV-SP 24890",
      clinicName: "Hospital Veterinário PetCare",
      specialties: JSON.stringify(["Dermatologia", "Alergologia"]),
      bio: "Especialista em alergologia e dermatologia veterinária pela USP.",
      isVerified: true,
    },
  });

  const carlosSitter = await prisma.user.create({
    data: {
      name: "Carlos Sitter",
      email: "carlos@petsitter.com",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
      timezone: "America/Sao_Paulo",
    },
  });

  await prisma.professionalProfile.create({
    data: {
      userId: carlosSitter.id,
      professionalType: "sitter",
      clinicName: "Patas Amigas Daycare",
      specialties: JSON.stringify(["Hospedagem Domiciliar", "Passeios Educativos"]),
      bio: "Cuidador e adestrador positivo com certificação em primeiros socorros caninos.",
      isVerified: true,
    },
  });

  // 2. Create Pets: Rex (principal) and Luna, Thor (multi-pet demo)
  const rex = await prisma.pet.create({
    data: {
      name: "Rex",
      photo: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=500&auto=format&fit=crop&q=80",
      species: "Cão",
      breed: "Golden Retriever",
      sex: "Macho",
      birthDate: new Date("2021-04-15"),
      weight: 32.5,
      color: "Dourado",
      microchip: "981098102938475",
      notes: "Amigável, alérgico a picada de pulga e ração com corante.",
    },
  });

  const luna = await prisma.pet.create({
    data: {
      name: "Luna",
      photo: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500&auto=format&fit=crop&q=80",
      species: "Gato",
      breed: "Siamês",
      sex: "Fêmea",
      birthDate: new Date("2022-08-20"),
      weight: 4.2,
      color: "Seal Point",
      microchip: "981098108877112",
      notes: "Castrada, calma, adora sachê pela manhã.",
    },
  });

  const thor = await prisma.pet.create({
    data: {
      name: "Thor",
      photo: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=500&auto=format&fit=crop&q=80",
      species: "Cão",
      breed: "Bulldog Francês",
      sex: "Macho",
      birthDate: new Date("2023-01-10"),
      weight: 12.8,
      color: "Tigrado",
      microchip: "981098105544332",
      notes: "Sensível a calor excessivo.",
    },
  });

  // 3. Pet Members (Muitos para Muitos com Papéis)
  // Rex: Denis (Owner), Ana (Co-owner), João (Caregiver)
  await prisma.petMember.create({
    data: {
      petId: rex.id,
      userId: denis.id,
      role: "owner",
      isPrimary: true,
    },
  });

  await prisma.petMember.create({
    data: {
      petId: rex.id,
      userId: ana.id,
      role: "co_owner",
      isPrimary: false,
    },
  });

  await prisma.petMember.create({
    data: {
      petId: rex.id,
      userId: joao.id,
      role: "caregiver",
      isPrimary: false,
    },
  });

  // Dra. Camila: vet_limited com CRMV e autorização de prescrição
  await prisma.petMember.create({
    data: {
      petId: rex.id,
      userId: draCamila.id,
      role: "vet_limited",
      professionalType: "vet",
      isPrimary: false,
      canPrescribe: true,
      canViewFullHistory: true,
    },
  });

  // Carlos Sitter: caregiver_pro
  await prisma.petMember.create({
    data: {
      petId: rex.id,
      userId: carlosSitter.id,
      role: "caregiver_pro",
      professionalType: "sitter",
      isPrimary: false,
      canPrescribe: false,
      canViewFullHistory: true,
    },
  });

  // Luna: Denis (Owner), Ana (Co-owner)
  await prisma.petMember.create({
    data: {
      petId: luna.id,
      userId: denis.id,
      role: "owner",
      isPrimary: true,
    },
  });
  await prisma.petMember.create({
    data: {
      petId: luna.id,
      userId: ana.id,
      role: "co_owner",
      isPrimary: false,
    },
  });

  // Thor: Denis (Owner)
  await prisma.petMember.create({
    data: {
      petId: thor.id,
      userId: denis.id,
      role: "owner",
      isPrimary: true,
    },
  });

  // 4. Notification Preferences
  await prisma.notificationPreference.create({
    data: {
      userId: denis.id,
      petId: rex.id,
      allowFoodStock: true,
      allowMedicationStock: true,
      allowMedicationSchedule: false,
      allowAppointments: true,
      allowVaccines: true,
      leadTimeDays: 7,
    },
  });

  await prisma.notificationPreference.create({
    data: {
      userId: ana.id,
      petId: rex.id,
      allowFoodStock: false,
      allowMedicationStock: true,
      allowMedicationSchedule: true,
      allowAppointments: true,
      allowVaccines: true,
      leadTimeDays: 7,
    },
  });

  await prisma.notificationPreference.create({
    data: {
      userId: joao.id,
      petId: rex.id,
      allowFoodStock: false,
      allowMedicationStock: false,
      allowMedicationSchedule: true,
      allowAppointments: false,
      allowVaccines: false,
      leadTimeDays: 3,
    },
  });

  // 5. Inventory Items (Ração e Medicamentos e Suplementos)
  // Ração Rex: 12 kg (12000g), consumo 400g/dia -> 30 dias.
  // Supondo que estamos no dia 25 do ciclo (restam 2.000g = 5 dias! Menor que lead time de 7 dias -> COMPRAR AGORA)
  const racaoRex = await prisma.inventoryItem.create({
    data: {
      petId: rex.id,
      name: "Ração Premier Formula Adulto Raças Grandes",
      category: "racao",
      unit: "g",
      currentQuantity: 2000.0, // restam 2kg de 12kg -> 5 dias
      dailyConsumption: 400.0, // 400g / dia
      purchaseLeadTimeDays: 7, // precisa de 7 dias de antecedência!
      referenceDate: new Date(),
      status: "COMPRAR AGORA",
      notes: "Saco original de 12 kg.",
    },
  });

  // Medicamento A: Apoquel 16mg - 30 comprimidos, 1/dia
  // Restam 6 comprimidos, lead time 5 dias -> Atenção / Comprar agora
  const medA = await prisma.medication.create({
    data: {
      petId: rex.id,
      name: "Apoquel 16mg",
      activeIngredient: "Oclacitinib",
      presentation: "Comprimido",
      dosage: "16mg",
      unit: "comprimido",
      instructions: "Administrar 1 comprimido pela manhã junto com a refeição.",
      veterinarian: "Dra. Camila Ramos (CRMV-SP 24890)",
      startDate: new Date("2026-09-15"),
    },
  });

  const medAInventory = await prisma.inventoryItem.create({
    data: {
      petId: rex.id,
      medicationId: medA.id,
      name: "Apoquel 16mg (30 comp)",
      category: "medicamento",
      unit: "comprimidos",
      currentQuantity: 5.0, // restam 5 comp
      dailyConsumption: 1.0, // 1/dia -> dura 5 dias
      purchaseLeadTimeDays: 5,
      status: "COMPRAR AGORA",
      notes: "Uso contínuo para dermatite atópica.",
    },
  });

  // Medicamento B: Condroton Plus - 60 comprimidos, 2/dia (1 manhã, 1 noite)
  const medB = await prisma.medication.create({
    data: {
      petId: rex.id,
      name: "Condroton Plus 1000mg",
      activeIngredient: "Sulfato de Condroitina + Glicosamina",
      presentation: "Comprimido mastigável",
      dosage: "1000mg",
      unit: "comprimidos",
      instructions: "1 comprimido a cada 12 horas.",
      veterinarian: "Dr. Marcos Vinicius (CRMV-SP 18450)",
      startDate: new Date("2026-10-01"),
    },
  });

  const medBInventory = await prisma.inventoryItem.create({
    data: {
      petId: rex.id,
      medicationId: medB.id,
      name: "Condroton Plus 1000mg (60 comp)",
      category: "medicamento",
      unit: "comprimidos",
      currentQuantity: 44.0, // 44 comp restantes / 2 por dia = 22 dias restantes -> OK
      dailyConsumption: 2.0,
      purchaseLeadTimeDays: 7,
      status: "OK",
      notes: "Protetor articular.",
    },
  });

  // Antipulgas Simparic
  const antipulgas = await prisma.inventoryItem.create({
    data: {
      petId: rex.id,
      name: "Simparic 20-40kg",
      category: "antipulgas",
      unit: "comprimidos",
      currentQuantity: 0.0,
      dailyConsumption: 0.033, // 1 a cada 30 dias
      purchaseLeadTimeDays: 5,
      status: "SEM ESTOQUE",
      notes: "Dose mensal. Terminou na semana passada.",
    },
  });

  // Item de Ração para Luna
  await prisma.inventoryItem.create({
    data: {
      petId: luna.id,
      name: "Ração Royal Canin Siamese Adulto",
      category: "racao",
      unit: "g",
      currentQuantity: 2800.0,
      dailyConsumption: 70.0, // dura 40 dias
      purchaseLeadTimeDays: 7,
      status: "OK",
      notes: "Saco de 3kg.",
    },
  });

  // 6. Medication Schedules
  const scheduleA = await prisma.medicationSchedule.create({
    data: {
      medicationId: medA.id,
      quantityPerAdministration: 1.0,
      administrationsPerDay: 1,
      frequency: "daily",
      times: JSON.stringify(["08:00"]),
      startDate: new Date("2026-09-15"),
      active: true,
    },
  });

  const scheduleB = await prisma.medicationSchedule.create({
    data: {
      medicationId: medB.id,
      quantityPerAdministration: 1.0,
      administrationsPerDay: 2,
      frequency: "every_12h",
      times: JSON.stringify(["08:00", "20:00"]),
      startDate: new Date("2026-10-01"),
      active: true,
    },
  });

  // 7. Today Administrations Demo
  const today = new Date();
  const today8am = new Date(today);
  today8am.setHours(8, 0, 0, 0);

  const today14pm = new Date(today);
  today14pm.setHours(14, 0, 0, 0);

  const today20pm = new Date(today);
  today20pm.setHours(20, 0, 0, 0);

  // 08:00 ✓ Administrado por Ana (Condroton)
  await prisma.medicationAdministration.create({
    data: {
      medicationId: medB.id,
      petId: rex.id,
      scheduledAt: today8am,
      administeredAt: today8am,
      administeredByUserId: ana.id,
      quantity: 1.0,
      status: "administered",
      notes: "Dado com um pedaço de fruta.",
    },
  });

  // 08:00 ✓ Administrado por Denis (Apoquel)
  await prisma.medicationAdministration.create({
    data: {
      medicationId: medA.id,
      petId: rex.id,
      scheduledAt: today8am,
      administeredAt: today8am,
      administeredByUserId: denis.id,
      quantity: 1.0,
      status: "administered",
      notes: "Engoliu normalmente na refeição.",
    },
  });

  // 20:00 ⚠ Pendente (Condroton)
  await prisma.medicationAdministration.create({
    data: {
      medicationId: medB.id,
      petId: rex.id,
      scheduledAt: today20pm,
      quantity: 1.0,
      status: "scheduled",
      notes: "Pendente para a noite.",
    },
  });

  // 8. Purchases & Transactions
  const purchase1 = await prisma.purchase.create({
    data: {
      petId: rex.id,
      userId: ana.id,
      date: new Date("2026-09-10"),
      supplier: "Cobasi Shopping Dom Pedro",
      total: 349.9,
      notes: "Compra mensal de ração e petiscos.",
    },
  });

  await prisma.purchaseItem.create({
    data: {
      purchaseId: purchase1.id,
      inventoryItemId: racaoRex.id,
      quantity: 12000.0,
      unitPrice: 289.9,
      total: 289.9,
    },
  });

  await prisma.inventoryTransaction.create({
    data: {
      inventoryItemId: racaoRex.id,
      type: "purchase",
      quantity: 12000.0,
      unitPrice: 289.9,
      totalPrice: 289.9,
      date: new Date("2026-09-10"),
      userId: ana.id,
      notes: "Entrada do saco de 12kg.",
    },
  });

  // Consumo acumulado
  await prisma.inventoryTransaction.create({
    data: {
      inventoryItemId: racaoRex.id,
      type: "consumption",
      quantity: -10000.0,
      date: new Date("2026-10-05"),
      userId: denis.id,
      notes: "Consumo acumulado de 25 dias (400g/dia).",
    },
  });

  // 9. Shopping List (Compartilhada)
  await prisma.shoppingListItem.create({
    data: {
      petId: rex.id,
      inventoryItemId: racaoRex.id,
      customName: "Ração Premier Formula Adulto 12kg",
      quantity: 1,
      unit: "saco 12kg",
      isPurchased: false,
    },
  });

  await prisma.shoppingListItem.create({
    data: {
      petId: rex.id,
      inventoryItemId: antipulgas.id,
      customName: "Simparic 20-40kg (1 comp)",
      quantity: 1,
      unit: "caixa",
      isPurchased: false,
    },
  });

  await prisma.shoppingListItem.create({
    data: {
      petId: rex.id,
      inventoryItemId: medAInventory.id,
      customName: "Apoquel 16mg (30 comp)",
      quantity: 1,
      unit: "caixa",
      isPurchased: false,
    },
  });

  // Item já comprado anteriormente por Ana para testar histórico
  await prisma.shoppingListItem.create({
    data: {
      petId: rex.id,
      customName: "Petisco bifinho sabor carne",
      quantity: 2,
      unit: "pct",
      isPurchased: true,
      purchasedAt: new Date("2026-10-07T11:30:00Z"),
      purchasedByUserId: ana.id,
    },
  });

  // 10. Vaccinations
  await prisma.vaccination.create({
    data: {
      petId: rex.id,
      name: "Antirrábica",
      type: "Anual",
      applicationDate: new Date("2026-10-10"),
      nextDueDate: new Date("2027-10-10"),
      dose: "1 dose (1ml)",
      lot: "DEF88291",
      manufacturer: "Zoetis Defensor",
      veterinarian: "Dra. Camila Ramos",
      clinic: "Clínica Veterinária Morumbi",
      notes: "Vacina aplicada sem reações adversas. Confirmar protocolo anual com veterinário.",
    },
  });

  await prisma.vaccination.create({
    data: {
      petId: rex.id,
      name: "V10 Polivalente",
      type: "Anual",
      applicationDate: new Date("2025-10-25"),
      nextDueDate: new Date("2026-10-25"), // vence em 18 dias!
      dose: "1 dose",
      lot: "VAN99341",
      manufacturer: "Vanguard HTLP 5/CV-L",
      veterinarian: "Dr. Marcos Vinicius",
      clinic: "Hospital Veterinário PetCare",
      notes: "Vencimento próximo em outubro. Agendar reforço.",
    },
  });

  // Luna com vacina próxima
  await prisma.vaccination.create({
    data: {
      petId: luna.id,
      name: "V4 Felina",
      type: "Anual",
      applicationDate: new Date("2025-10-19"),
      nextDueDate: new Date("2026-10-19"), // vence em 12 dias!
      dose: "1 dose",
      manufacturer: "Zoetis Felocell",
      veterinarian: "Dra. Renata Alves",
      notes: "Vacina anual em 12 dias.",
    },
  });

  // 11. Appointments
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 5);
  await prisma.appointment.create({
    data: {
      petId: rex.id,
      type: "consulta",
      title: "Consulta Dermatológica de Retorno",
      date: nextWeek,
      time: "15:00",
      location: "Clínica PetCare - Av. Brasil, 1200",
      veterinarian: "Dra. Camila Ramos",
      notes: "Avaliar resposta ao Apoquel e estado das orelhas.",
      status: "scheduled",
    },
  });

  // 12. Weight Records
  await prisma.weightRecord.create({
    data: {
      petId: rex.id,
      weight: 31.8,
      date: new Date("2026-06-15"),
      userId: denis.id,
      notes: "Pesagem de rotina no banho.",
    },
  });
  await prisma.weightRecord.create({
    data: {
      petId: rex.id,
      weight: 32.2,
      date: new Date("2026-08-10"),
      userId: ana.id,
      notes: "Pesagem após consulta clínica.",
    },
  });
  await prisma.weightRecord.create({
    data: {
      petId: rex.id,
      weight: 32.5,
      date: new Date("2026-10-01"),
      userId: denis.id,
      notes: "Peso estabilizado.",
    },
  });

  // 13. Activity Logs (Audit Trail de Múltiplos Tutores)
  await prisma.activityLog.create({
    data: {
      petId: rex.id,
      userId: denis.id,
      action: "cadastrou o pet Rex e definiu Ana como Co-owner",
      entityType: "pet",
      timestamp: new Date("2026-09-01T10:00:00Z"),
    },
  });
  await prisma.activityLog.create({
    data: {
      petId: rex.id,
      userId: ana.id,
      action: "registrou compra de R$ 349,90 (Ração Premier 12kg)",
      entityType: "purchase",
      timestamp: new Date("2026-09-10T14:30:00Z"),
    },
  });
  await prisma.activityLog.create({
    data: {
      petId: rex.id,
      userId: joao.id,
      action: "registrou alimentação matinal e consumo de ração",
      entityType: "inventory",
      timestamp: new Date("2026-10-06T09:15:00Z"),
    },
  });
  await prisma.activityLog.create({
    data: {
      petId: rex.id,
      userId: ana.id,
      action: "administrou Condroton Plus (08:00)",
      entityType: "medication",
      timestamp: new Date("2026-10-07T08:05:00Z"),
    },
  });
  await prisma.activityLog.create({
    data: {
      petId: rex.id,
      userId: denis.id,
      action: "administrou Apoquel 16mg (08:00)",
      entityType: "medication",
      timestamp: new Date("2026-10-07T08:10:00Z"),
    },
  });

  // 14. Prescrição Pendente de Aprovação (Dra. Camila para Rex)
  await prisma.medication.create({
    data: {
      petId: rex.id,
      name: "Shampoo Clorexiderm 200ml",
      activeIngredient: "Clorexidina 3%",
      presentation: "Frasco Líquido",
      dosage: "1 banho a cada 4 dias",
      unit: "banhos",
      instructions: "Deixar agir por 10 minutos na pele antes de enxaguar abundantemente com água fria.",
      veterinarian: "Dra. Camila Ramos (CRMV-SP 24890)",
      status: "pending_tutor_approval",
      prescribedById: draCamila.id,
      notes: "Prescrição sugerida após retorno dermatológico.",
    },
  });

  // 15. Notas Clínicas (Prontuário Médico Compartilhado)
  await prisma.clinicalNote.create({
    data: {
      petId: rex.id,
      authorId: draCamila.id,
      content:
        "Orientação Pós-Consulta: Manter Apoquel 16mg diariamente. Iniciar banhos com Clorexiderm a cada 4 dias assim que aprovado. Retorno em 15 dias para nova citologia das orelhas.",
      visibility: "ALL_TUTORS",
      createdAt: new Date("2026-10-07T11:00:00Z"),
    },
  });

  await prisma.clinicalNote.create({
    data: {
      petId: rex.id,
      authorId: draCamila.id,
      content:
        "🔒 Nota Interna Veterinária: Suspeita de dermatite atópica secundária a ácaros de poeira ou atopia alimentar. Citologia de ouvido pendente de análise microscópica. Se persistir, avaliar teste alérgico sorológico.",
      visibility: "PROFESSIONALS_ONLY",
      createdAt: new Date("2026-10-07T11:05:00Z"),
    },
  });

  await prisma.clinicalNote.create({
    data: {
      petId: rex.id,
      authorId: carlosSitter.id,
      content:
        "Relatório do Passeio: Rex passeou 40 minutos no parque hoje às 16h. Apresentou bom vigor físico, bebeu 300ml de água e não apresentou coceira durante o trajeto.",
      visibility: "ALL_TUTORS",
      createdAt: new Date("2026-10-07T16:45:00Z"),
    },
  });

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
