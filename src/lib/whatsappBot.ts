import { prisma } from "@/lib/prisma";
import { calculateStockForecast } from "@/lib/stockCalculation";
import { format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface BotProcessResult {
  replyText: string;
  actionTaken?: string;
  metadata?: any;
}

export function normalizePhoneNumber(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

/**
 * Motor central de lógica do WhatsApp Bot do PetRec.
 * Processa mensagens recebidas (tanto via Webhook oficial da Meta quanto pelo Simulador do App).
 */
export async function processIncomingWhatsAppMessage(params: {
  fromPhone: string; // Ex: "+5519988887777"
  messageText: string;
  wamid?: string;
}): Promise<BotProcessResult> {
  const { fromPhone, messageText, wamid } = params;
  const cleanPhone = normalizePhoneNumber(fromPhone);
  const text = messageText.trim();
  const upper = text.toUpperCase();

  // 1. Verificar comando especial de pareamento: "CONECTAR_<TOKEN>", "LINK_<TOKEN>", ou apenas "LINK_..."
  if (upper.startsWith("CONECTAR_") || upper.startsWith("LINK_") || upper.startsWith("CONECTAR ")) {
    return handlePairingCommand(cleanPhone, text);
  }

  // 2. Identificar Usuário pelo Telefone (testando formato normalizado e formato informado)
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { whatsappPhoneNumber: cleanPhone },
        { whatsappPhoneNumber: fromPhone.trim() },
      ],
    },
    include: {
      petMembers: {
        include: { pet: true },
      },
      whatsappSession: true,
    },
  });

  if (!user) {
    return {
      replyText:
        "👋 Olá! Não identificamos seu número cadastrado no *PetRec*.\n\n" +
        "Para vincular sua conta:\n" +
        "1. Acesse o PetRec Web: http://localhost:3000\n" +
        "2. Vá na aba *WhatsApp* ou no seu Perfil\n" +
        "3. Clique em *'Conectar com 1 Clique'* ou envie o código gerado aqui!\n\n" +
        `Seu número detectado: ${cleanPhone}`,
    };
  }

  // 3. Obter ou Criar Sessão do WhatsApp
  let session = user.whatsappSession;
  const userPets = user.petMembers.map((m) => m.pet);

  if (userPets.length === 0) {
    return {
      replyText: "Você ainda não possui nenhum pet cadastrado ou vinculado. Acesse o app para cadastrar seu primeiro pet!",
    };
  }

  if (!session) {
    session = await prisma.whatsappSession.create({
      data: {
        userId: user.id,
        currentPetId: userPets[0].id,
        state: "IDLE",
      },
    });
  }

  // Se o pet atual não for válido ou não pertencer mais ao usuário, ajusta para o primeiro pet
  let currentPet = userPets.find((p) => p.id === session!.currentPetId) || userPets[0];
  if (currentPet.id !== session.currentPetId) {
    session = await prisma.whatsappSession.update({
      where: { userId: user.id },
      data: { currentPetId: currentPet.id },
    });
  }

  // 4. Se a sessão estiver em um estado de espera de fluxo de passos (State Machine)
  if (session.state !== "IDLE") {
    return handleStateMachine(user, session, currentPet, userPets, text);
  }

  // 5. Normalizar texto para análise de intenção (números, palavras-chave e linguagem natural)
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // COMANDO 0 / Menu / Ajuda
  if (
    lower === "0" ||
    lower === "menu" ||
    lower === "ajuda" ||
    lower === "help" ||
    lower === "oi" ||
    lower === "olá" ||
    lower === "ola" ||
    lower === "início" ||
    lower === "inicio"
  ) {
    return getMenuReply(user, currentPet, userPets);
  }

  // COMANDO 1: Agenda / Hoje
  if (
    lower === "1" ||
    lower.startsWith("1 ") ||
    lower.startsWith("1-") ||
    lower.includes("hoje") ||
    lower.includes("agenda") ||
    lower.includes("o que tem") ||
    lower.includes("tarefa")
  ) {
    return handleTodayAgenda(user, currentPet);
  }

  // COMANDO 2: Estoque / Ração
  if (
    lower === "2" ||
    lower.startsWith("2 ") ||
    lower.startsWith("2-") ||
    lower === "estoque" ||
    lower.includes("quanto falta") ||
    lower.includes("previsão") ||
    lower.includes("previsao") ||
    (lower.includes("racao") && !lower.includes("dei") && !lower.includes("alimentei") && !lower.includes("comprei")) ||
    (lower.includes("ração") && !lower.includes("dei") && !lower.includes("alimentei") && !lower.includes("comprei"))
  ) {
    return handleStockQuery(currentPet);
  }

  // COMANDO 3: Medicamento / Administrar
  if (
    lower === "3" ||
    lower.startsWith("3 ") ||
    lower.startsWith("3-") ||
    lower.includes("dei remedio") ||
    lower.includes("dei remédio") ||
    lower.includes("dei comprimido") ||
    lower.includes("administrei") ||
    lower.includes("tomei") ||
    lower === "remedio" ||
    lower === "remédio" ||
    lower === "dei" ||
    lower === "dose"
  ) {
    return handleAdministerMedicationIntent(user, session, currentPet, text);
  }

  // COMANDO 4: Alimentação / Ração diária
  if (
    lower === "4" ||
    lower.startsWith("4 ") ||
    lower.startsWith("4-") ||
    lower.includes("dei comida") ||
    lower.includes("alimentei") ||
    lower.includes("comeu") ||
    lower.includes("refeição") ||
    lower.includes("refeicao") ||
    lower.includes("dei ração") ||
    lower.includes("dei racao") ||
    lower === "comida"
  ) {
    return handleQuickFeedIntent(user, currentPet, text);
  }

  // COMANDO 5: Vacinas
  if (
    lower === "5" ||
    lower.startsWith("5 ") ||
    lower.startsWith("5-") ||
    lower === "vacina" ||
    lower === "vacinas" ||
    lower.includes("carteira de vacina") ||
    lower.includes("reforço") ||
    lower.includes("reforco")
  ) {
    return handleVaccinesQuery(currentPet);
  }

  // COMANDO 6: Compras
  if (
    lower === "6" ||
    lower.startsWith("6 ") ||
    lower.startsWith("6-") ||
    lower === "compras" ||
    lower === "compra" ||
    lower.includes("comprei") ||
    lower.includes("comprar")
  ) {
    return handlePurchaseIntent(user, session, currentPet, text);
  }

  // COMANDO 7: Peso
  if (
    lower === "7" ||
    lower.startsWith("7 ") ||
    lower.startsWith("7-") ||
    lower === "peso" ||
    lower.includes("pesei") ||
    lower.includes("pesagem") ||
    lower.includes("quanto pesa")
  ) {
    return handleWeightIntent(user, session, currentPet, text);
  }

  // COMANDO 8: Prontuário / Histórico Clínico / Consultas
  if (
    lower === "8" ||
    lower.startsWith("8 ") ||
    lower.startsWith("8-") ||
    lower === "prontuário" ||
    lower === "prontuario" ||
    lower.includes("consulta") ||
    lower.includes("veterinario") ||
    lower.includes("veterinário") ||
    lower.includes("historico") ||
    lower.includes("histórico")
  ) {
    return handleClinicalHistoryQuery(currentPet);
  }

  // COMANDO 9: Trocar pet de contexto
  if (
    lower === "9" ||
    lower.startsWith("9 ") ||
    lower.startsWith("9-") ||
    lower.startsWith("pet ") ||
    lower === "pets" ||
    lower === "pet" ||
    lower === "trocar pet" ||
    lower === "mudar pet"
  ) {
    return handlePetSwitch(user, session, userPets, text);
  }

  // Fallback amigável com menu
  return {
    replyText:
      `🐾 Não entendi o comando para o *${currentPet.name}*.\n\n` +
      `💡 Você pode digitar o número da opção desejada:\n` +
      `• *1* — Tarefas de Hoje\n` +
      `• *2* — Estoque de Ração\n` +
      `• *3* — Registrar Remédio\n` +
      `• *4* — Registrar Refeição\n` +
      `• *5* — Carteira de Vacinas\n` +
      `• *6* — Registrar Compra\n` +
      `• *7* — Controle de Peso\n` +
      `• *8* — Prontuário Veterinário\n` +
      `• *9* — Trocar Pet Ativo\n` +
      `• *0* — Ver Menu Completo`,
  };
}

/**
 * Pareamento seguro via token
 */
async function handlePairingCommand(phone: string, rawInput: string): Promise<BotProcessResult> {
  const cleanPhone = normalizePhoneNumber(phone);
  const upper = rawInput.trim().toUpperCase();
  const withoutPrefix = upper.replace(/^(CONECTAR_|CONECTAR\s+|LINK_)/i, "").trim();

  // Buscar todas as variações possíveis que podem ter sido salvas no banco
  const candidateTokens = Array.from(
    new Set([
      upper, // ex: "LINK_ABCD12"
      withoutPrefix, // ex: "ABCD12"
      `LINK_${withoutPrefix}`, // ex: "LINK_ABCD12"
      `LINK_${upper}`,
      rawInput.trim(),
    ])
  );

  const pairing = await prisma.whatsappPairingToken.findFirst({
    where: {
      token: { in: candidateTokens },
    },
    include: {
      user: {
        include: {
          petMembers: { include: { pet: true } },
        },
      },
    },
  });

  if (!pairing || pairing.expiresAt < new Date()) {
    return {
      replyText: "❌ Este código de conexão é inválido ou já expirou. Por favor, gere um novo link no painel do PetRec.",
    };
  }

  // Atualizar usuário com o número verificado
  const user = await prisma.user.update({
    where: { id: pairing.userId },
    data: {
      whatsappPhoneNumber: cleanPhone,
      whatsappVerifiedAt: new Date(),
    },
  });

  // Criar ou atualizar sessão
  const firstPet = pairing.user.petMembers[0]?.pet;
  await prisma.whatsappSession.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      currentPetId: firstPet ? firstPet.id : null,
      state: "IDLE",
    },
    update: {
      currentPetId: firstPet ? firstPet.id : null,
      state: "IDLE",
      pendingActionPayload: null,
    },
  });

  // Remover token usado
  await prisma.whatsappPairingToken.delete({ where: { id: pairing.id } });

  // Registrar auditoria
  if (firstPet) {
    await prisma.activityLog.create({
      data: {
        petId: firstPet.id,
        userId: user.id,
        action: `conectou o WhatsApp (${phone}) como canal de atendimento`,
        entityType: "pet",
      },
    });
  }

  return {
    replyText:
      `🎉 *Conexão realizada com sucesso!*\n\n` +
      `Olá *${user.name}*, seu WhatsApp foi vinculado ao *PetRec*.\n` +
      (firstPet ? `🐾 Pet ativo no momento: *${firstPet.name}*\n\n` : "\n") +
      `Envie *menu* ou *0* a qualquer momento para ver as opções disponíveis!`,
    actionTaken: "whatsapp_paired",
  };
}

/**
 * Menu principal estruturado e numerado
 */
function getMenuReply(user: any, pet: any, allPets: any[]): BotProcessResult {
  const otherPets = allPets.filter((p) => p.id !== pet.id);
  const switchTip =
    otherPets.length > 0
      ? `9️⃣ *Trocar pet* — Alternar foco (${otherPets.map((p) => p.name).join(", ")})\n`
      : "";

  return {
    replyText:
      `🐾 *Assistente PetRec — ${pet.name}*\n` +
      `Olá, *${user.name.split(" ")[0]}*! Escolha uma opção digitando o número:\n\n` +
      `1️⃣ *Hoje* — Remédios e tarefas do dia\n` +
      `2️⃣ *Estoque* — Ração e previsão de término\n` +
      `3️⃣ *Dei remédio* — Registrar dose administrada\n` +
      `4️⃣ *Alimentei* — Registrar refeição de ração\n` +
      `5️⃣ *Vacinas* — Carteira e reforços\n` +
      `6️⃣ *Comprei* — Registrar compra de produto\n` +
      `7️⃣ *Peso* — Consultar ou registrar peso\n` +
      `8️⃣ *Prontuário* — Consultas e anotações clínicas\n` +
      switchTip +
      `0️⃣ *Menu* — Reexibir este menu\n\n` +
      `_Você também pode falar naturalmente, como "quanto falta de ração?" ou "pesei o ${pet.name}: 18.5kg"._`,
  };
}

/**
 * Agenda do Dia (Medicamentos e Consultas)
 */
async function handleTodayAgenda(user: any, pet: any): Promise<BotProcessResult> {
  const [administrations, appointments] = await Promise.all([
    prisma.medicationAdministration.findMany({
      where: {
        petId: pet.id,
        scheduledAt: { gte: startOfDay(new Date()) },
      },
      include: {
        medication: true,
        administeredBy: true,
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        petId: pet.id,
        date: { gte: startOfDay(new Date()) },
      },
      orderBy: { date: "asc" },
      take: 3,
    }),
  ]);

  let msg = `📅 *Rotina de Hoje para ${pet.name}:*\n\n`;

  if (administrations.length === 0) {
    msg += "• Nenhum medicamento programado para hoje.\n";
  } else {
    msg += "*Medicamentos:*\n";
    for (const adm of administrations) {
      const time = format(new Date(adm.scheduledAt), "HH:mm");
      if (adm.status === "administered") {
        msg += `✅ ${time} — ${adm.medication.name} (Feito por ${adm.administeredBy?.name?.split(" ")[0] || "Tutor"})\n`;
      } else if (adm.status === "skipped") {
        msg += `⏭️ ${time} — ${adm.medication.name} (Pulado)\n`;
      } else {
        msg += `⏰ ${time} — ${adm.medication.name} (*Pendente*)\n`;
      }
    }
  }

  if (appointments.length > 0) {
    msg += "\n*Próximos Compromissos:*\n";
    for (const app of appointments) {
      msg += `📍 ${format(new Date(app.date), "dd/MM")} às ${app.time} — ${app.title} (${app.type})\n`;
    }
  }

  msg += `\n_Dica: Se já deu um medicamento, responda com "3" ou "Dei remédio"._`;

  return { replyText: msg };
}

/**
 * Consulta de Estoque & Consumo Real
 */
async function handleStockQuery(pet: any): Promise<BotProcessResult> {
  const items = await prisma.inventoryItem.findMany({
    where: { petId: pet.id },
  });

  if (items.length === 0) {
    return { replyText: `Não há itens cadastrados no estoque do ${pet.name}.` };
  }

  let msg = `📦 *Status de Estoque — ${pet.name}:*\n\n`;

  for (const item of items) {
    const fc = calculateStockForecast({
      currentQuantity: item.currentQuantity,
      dailyConsumption: item.dailyConsumption,
      unit: item.unit,
      purchaseLeadTimeDays: item.purchaseLeadTimeDays,
    });

    let statusEmoji = "🟢";
    if (fc.status === "COMPRAR AGORA" || fc.status === "SEM ESTOQUE") statusEmoji = "🔴";
    else if (fc.status === "ATENÇÃO" || fc.status === "ESTOQUE INSUFICIENTE") statusEmoji = "🟡";

    const qtyStr =
      item.unit === "g" && item.currentQuantity >= 1000
        ? `${(item.currentQuantity / 1000).toFixed(1)} kg`
        : `${item.currentQuantity} ${item.unit}`;

    msg += `${statusEmoji} *${item.name}*\n`;
    msg += `   Restam: ${qtyStr} (~${Math.round(fc.daysRemaining)} dias)\n`;
    msg += `   Comprar até: *${fc.comprarAteLabel}*\n\n`;
  }

  msg += `_Dica: Para registrar uma nova compra, responda com "6" ou "Comprei"._`;

  return { replyText: msg };
}

/**
 * Consulta de Vacinas
 */
async function handleVaccinesQuery(pet: any): Promise<BotProcessResult> {
  const vaccines = await prisma.vaccination.findMany({
    where: { petId: pet.id },
    orderBy: { nextDueDate: "asc" },
  });

  if (vaccines.length === 0) {
    return { replyText: `Nenhuma vacina registrada para ${pet.name}.` };
  }

  let msg = `💉 *Carteira de Vacinas — ${pet.name}:*\n\n`;
  for (const v of vaccines) {
    const dueStr = v.nextDueDate
      ? format(new Date(v.nextDueDate), "dd/MM/yyyy")
      : "Não agendado";
    msg += `• *${v.name}*\n  Última dose: ${format(new Date(v.applicationDate), "dd/MM/yyyy")} | Reforço: *${dueStr}*\n`;
  }

  msg += "\n_Lembrete: Os protocolos vacinais devem ser validados pelo médico veterinário._";
  return { replyText: msg };
}

/**
 * Consulta ou Registro de Peso
 */
async function handleWeightIntent(
  user: any,
  session: any,
  pet: any,
  rawText: string
): Promise<BotProcessResult> {
  // 1. Verificar se o usuário já enviou o peso diretamente no texto (ex: "Pesei o Rex: 18.5kg" ou "18.5 kg")
  const match = rawText.match(/(\d+([.,]\d+)?)\s*(kg)?/i);
  const words = rawText.toLowerCase();

  if (match && (words.includes("pesei") || words.includes("está com") || words.includes("esta com") || words.includes("kg"))) {
    const weightVal = parseFloat(match[1].replace(",", "."));
    if (!isNaN(weightVal) && weightVal > 0 && weightVal < 250) {
      await prisma.weightRecord.create({
        data: {
          petId: pet.id,
          weight: weightVal,
          date: new Date(),
          notes: "Pesagem informada via WhatsApp",
        },
      });

      await prisma.pet.update({
        where: { id: pet.id },
        data: { weight: weightVal },
      });

      await prisma.activityLog.create({
        data: {
          petId: pet.id,
          userId: user.id,
          action: `registrou peso de ${weightVal} kg para ${pet.name} via WhatsApp`,
          entityType: "pet",
          entityId: pet.id,
        },
      });

      return {
        replyText:
          `⚖️ *Pesagem registrada!*\n\n` +
          `*${pet.name}* atualizado para *${weightVal} kg*.\n` +
          `O histórico de evolução e as dosagens no app foram sincronizados!`,
        actionTaken: "weight_recorded",
      };
    }
  }

  // 2. Se for apenas consulta ("7" ou "peso"), exibe o histórico atual e abre para nova pesagem
  const lastWeight = await prisma.weightRecord.findFirst({
    where: { petId: pet.id },
    orderBy: { date: "desc" },
  });

  const weightDisplay = lastWeight
    ? `${lastWeight.weight} kg (em ${format(new Date(lastWeight.date), "dd/MM/yyyy")})`
    : pet.weight
    ? `${pet.weight} kg (cadastro)`
    : "Não informado";

  await prisma.whatsappSession.update({
    where: { id: session.id },
    data: { state: "AWAITING_WEIGHT_INPUT", pendingActionPayload: null },
  });

  return {
    replyText:
      `⚖️ *Controle de Peso — ${pet.name}:*\n` +
      `Último peso registrado: *${weightDisplay}*\n\n` +
      `Para registrar uma nova pesagem agora, digite o valor em kg (Ex: *18.5*).\n` +
      `Ou envie *cancelar* para voltar ao menu.`,
  };
}

/**
 * Consulta de Prontuário, Consultas e Anotações Veterinárias
 */
async function handleClinicalHistoryQuery(pet: any): Promise<BotProcessResult> {
  const [appointments, clinicalNotes, healthEvents] = await Promise.all([
    prisma.appointment.findMany({
      where: { petId: pet.id, date: { gte: startOfDay(new Date()) } },
      orderBy: { date: "asc" },
      take: 2,
    }),
    prisma.clinicalNote.findMany({
      where: { petId: pet.id, visibility: "ALL_TUTORS" },
      include: { author: true },
      orderBy: { createdAt: "desc" },
      take: 2,
    }),
    prisma.healthEvent.findMany({
      where: { petId: pet.id },
      orderBy: { date: "desc" },
      take: 2,
    }),
  ]);

  let msg = `📋 *Prontuário & Saúde — ${pet.name}:*\n\n`;

  if (appointments.length > 0) {
    msg += `🏥 *Próximas Consultas / Procedimentos:*\n`;
    for (const app of appointments) {
      msg += `• *${format(new Date(app.date), "dd/MM/yyyy")}* às ${app.time} — ${app.title} (${app.veterinarian || app.type})\n`;
    }
    msg += `\n`;
  } else {
    msg += `🏥 *Consultas:* Nenhuma consulta agendada para os próximos dias.\n\n`;
  }

  if (clinicalNotes.length > 0) {
    msg += `📝 *Últimas Notas da Equipe Veterinária:*\n`;
    for (const note of clinicalNotes) {
      const authorName = note.author?.name || "Veterinário";
      const dateStr = format(new Date(note.createdAt), "dd/MM");
      msg += `• [${dateStr}] *${authorName}:* "${note.content}"\n`;
    }
    msg += `\n`;
  }

  if (healthEvents.length > 0) {
    msg += `🩹 *Histórico de Eventos Recentes:*\n`;
    for (const ev of healthEvents) {
      const dateStr = format(new Date(ev.date), "dd/MM");
      msg += `• [${dateStr}] *${ev.title}* (${ev.type})\n`;
    }
  }

  return { replyText: msg.trim() };
}

/**
 * Ação: Registrar administração de medicamento
 */
async function handleAdministerMedicationIntent(
  user: any,
  session: any,
  pet: any,
  rawText: string
): Promise<BotProcessResult> {
  // Buscar medicações agendadas pendentes de hoje
  const pendingAdms = await prisma.medicationAdministration.findMany({
    where: {
      petId: pet.id,
      scheduledAt: { gte: startOfDay(new Date()) },
      status: "scheduled",
    },
    include: {
      medication: {
        include: { inventoryItem: true },
      },
    },
  });

  if (pendingAdms.length === 0) {
    // Nenhuma pendente hoje: buscar lista geral de remédios do pet
    const allMeds = await prisma.medication.findMany({
      where: { petId: pet.id, status: "active" },
      include: { inventoryItem: true },
    });

    if (allMeds.length === 0) {
      return { replyText: `Não há medicamentos ativos cadastrados para ${pet.name}.` };
    }

    // Se houver apenas 1 remédio cadastrado, administra direto
    if (allMeds.length === 1) {
      return commitMedicationAdministration(user, pet, allMeds[0], null);
    }

    // Se houver mais de 1, pedir escolha
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        state: "AWAITING_MED_CHOICE",
        pendingActionPayload: JSON.stringify({ options: allMeds.map((m) => m.id) }),
      },
    });

    let msg = `Qual medicamento você administrou para *${pet.name}*?\n\n`;
    allMeds.forEach((m, idx) => {
      msg += `${idx + 1}️⃣ *${m.name}* (${m.dosage || "1 dose"})\n`;
    });
    msg += `\nResponda com o número da opção (ex: *1* ou *2*) ou envie *cancelar*.`;
    return { replyText: msg };
  }

  // Se houver exatamente 1 pendente, administra direto!
  if (pendingAdms.length === 1) {
    const adm = pendingAdms[0];
    return commitMedicationAdministration(user, pet, adm.medication, adm.id);
  }

  // Se houver mais de 1 remédio pendente hoje, entrar no estado de escolha:
  await prisma.whatsappSession.update({
    where: { id: session.id },
    data: {
      state: "AWAITING_MED_CHOICE",
      pendingActionPayload: JSON.stringify({
        options: pendingAdms.map((a) => a.medication.id),
        adminIds: pendingAdms.map((a) => a.id),
      }),
    },
  });

  let msg = `Identifiquei *${pendingAdms.length} medicamentos pendentes* hoje para o *${pet.name}*:\n\n`;
  pendingAdms.forEach((adm, idx) => {
    const time = format(new Date(adm.scheduledAt), "HH:mm");
    msg += `${idx + 1}️⃣ [${time}] *${adm.medication.name}* (${adm.quantity} ${adm.medication.unit || "dose"})\n`;
  });
  msg += `\nQual deles você administrou? (Responda *1*, *2*, etc. ou *cancelar*)`;
  return { replyText: msg };
}

/**
 * Concluir administração e gravar no estoque + ActivityLog
 */
async function commitMedicationAdministration(
  user: any,
  pet: any,
  medication: any,
  administrationId: string | null
): Promise<BotProcessResult> {
  const now = new Date();

  // 1. Atualizar registro existente ou criar se for sob demanda
  if (administrationId) {
    await prisma.medicationAdministration.update({
      where: { id: administrationId },
      data: {
        status: "administered",
        administeredAt: now,
        administeredByUserId: user.id,
        notes: "Registrado via WhatsApp",
      },
    });
  } else {
    await prisma.medicationAdministration.create({
      data: {
        medicationId: medication.id,
        petId: pet.id,
        scheduledAt: now,
        administeredAt: now,
        administeredByUserId: user.id,
        quantity: 1.0,
        status: "administered",
        notes: "Dose avulsa via WhatsApp",
      },
    });
  }

  // 2. Decrementar estoque se houver item vinculado
  let stockInfo = "";
  if (medication.inventoryItem) {
    const inv = medication.inventoryItem;
    const newQty = Math.max(0, inv.currentQuantity - 1);

    const fc = calculateStockForecast({
      currentQuantity: newQty,
      dailyConsumption: inv.dailyConsumption,
      unit: inv.unit,
      purchaseLeadTimeDays: inv.purchaseLeadTimeDays,
    });

    await prisma.inventoryTransaction.create({
      data: {
        inventoryItemId: inv.id,
        type: "consumption",
        quantity: -1,
        date: now,
        userId: user.id,
        notes: "Administração via WhatsApp",
      },
    });

    await prisma.inventoryItem.update({
      where: { id: inv.id },
      data: {
        currentQuantity: newQty,
        status: fc.status,
        estimatedEndDate: fc.estimatedEndDate,
      },
    });

    stockInfo = `\n📦 Estoque atualizado: *${newQty} ${inv.unit}* (~${Math.round(fc.daysRemaining)} dias restantes).`;
  }

  // 3. Registrar no ActivityLog compartilhado
  await prisma.activityLog.create({
    data: {
      petId: pet.id,
      userId: user.id,
      action: `administrou 1 dose de ${medication.name} via WhatsApp`,
      entityType: "medication",
      entityId: medication.id,
    },
  });

  return {
    replyText:
      `✅ *${medication.name}* registrado para *${pet.name}* por *${user.name.split(" ")[0]}*!${stockInfo}\n\n` +
      `Outros tutores do ${pet.name} já foram notificados no painel.`,
    actionTaken: "medication_administered",
  };
}

/**
 * Ação rápida: Registrar consumo de ração
 */
async function handleQuickFeedIntent(user: any, pet: any, rawText: string): Promise<BotProcessResult> {
  const racao = await prisma.inventoryItem.findFirst({
    where: { petId: pet.id, category: "racao" },
  });

  if (!racao) {
    return { replyText: `Não encontrei nenhuma ração cadastrada no estoque do ${pet.name}.` };
  }

  // Consumo padrão da porção diária ou 400g
  const qty = racao.dailyConsumption > 0 ? racao.dailyConsumption : 400;
  const newQty = Math.max(0, racao.currentQuantity - qty);

  const fc = calculateStockForecast({
    currentQuantity: newQty,
    dailyConsumption: racao.dailyConsumption,
    unit: racao.unit,
    purchaseLeadTimeDays: racao.purchaseLeadTimeDays,
  });

  await prisma.inventoryTransaction.create({
    data: {
      inventoryItemId: racao.id,
      type: "consumption",
      quantity: -qty,
      date: new Date(),
      userId: user.id,
      notes: "Refeição diária via WhatsApp",
    },
  });

  await prisma.inventoryItem.update({
    where: { id: racao.id },
    data: {
      currentQuantity: newQty,
      status: fc.status,
      estimatedEndDate: fc.estimatedEndDate,
    },
  });

  await prisma.activityLog.create({
    data: {
      petId: pet.id,
      userId: user.id,
      action: `registrou refeição de ${qty} ${racao.unit} de ração via WhatsApp`,
      entityType: "inventory",
      entityId: racao.id,
    },
  });

  const displayCurrent =
    racao.unit === "g" && newQty >= 1000
      ? `${(newQty / 1000).toFixed(1)} kg`
      : `${newQty} ${racao.unit}`;

  return {
    replyText:
      `🥣 *Refeição registrada para ${pet.name}!*\n` +
      `Consumo de *${qty} ${racao.unit}* computado.\n` +
      `📦 Estoque restante: *${displayCurrent}* (~${Math.round(fc.daysRemaining)} dias).\n` +
      (fc.status === "COMPRAR AGORA" ? `⚠️ *ATENÇÃO:* O estoque atingiu a data ideal de compra!` : ""),
    actionTaken: "meal_registered",
  };
}

/**
 * Ação: Compra de produto
 */
async function handlePurchaseIntent(user: any, session: any, pet: any, rawText: string): Promise<BotProcessResult> {
  const items = await prisma.inventoryItem.findMany({ where: { petId: pet.id } });

  if (items.length === 0) {
    return { replyText: `Não há itens no estoque do ${pet.name} para registrar compra.` };
  }

  await prisma.whatsappSession.update({
    where: { id: session.id },
    data: {
      state: "AWAITING_PURCHASE_ITEM_CHOICE",
      pendingActionPayload: JSON.stringify({ itemIds: items.map((i) => i.id) }),
    },
  });

  let msg = `🛒 *Registrar Compra para ${pet.name}:*\nQual produto você comprou?\n\n`;
  items.forEach((it, idx) => {
    msg += `${idx + 1}️⃣ *${it.name}*\n`;
  });
  msg += `\nResponda com o número do produto (ex: *1*, *2*) ou envie *cancelar*.`;

  return { replyText: msg };
}

/**
 * Máquina de Estados para fluxos de múltiplos passos
 */
async function handleStateMachine(
  user: any,
  session: any,
  pet: any,
  userPets: any[],
  text: string
): Promise<BotProcessResult> {
  const state = session.state;
  const payload = session.pendingActionPayload ? JSON.parse(session.pendingActionPayload) : {};

  // Cancelar fluxo a qualquer momento
  if (
    text.toLowerCase() === "cancelar" ||
    text.toLowerCase() === "sair" ||
    text.toLowerCase() === "voltar"
  ) {
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: { state: "IDLE", pendingActionPayload: null },
    });
    return { replyText: "Operação cancelada. Como posso ajudar agora? Envie *menu* para ver opções." };
  }

  // 1. Escolha de Medicamento
  if (state === "AWAITING_MED_CHOICE") {
    const choiceNum = parseInt(text.trim(), 10);
    const options: string[] = payload.options || [];

    if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > options.length) {
      return {
        replyText: `Opção inválida. Digite um número de 1 a ${options.length} ou *cancelar*.`,
      };
    }

    const selectedMedId = options[choiceNum - 1];
    const medication = await prisma.medication.findUnique({
      where: { id: selectedMedId },
      include: { inventoryItem: true },
    });

    if (!medication) {
      await prisma.whatsappSession.update({
        where: { id: session.id },
        data: { state: "IDLE", pendingActionPayload: null },
      });
      return { replyText: "Medicamento não encontrado. Tente novamente." };
    }

    const adminId = payload.adminIds ? payload.adminIds[choiceNum - 1] : null;

    // Concluir e resetar máquina de estados
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: { state: "IDLE", pendingActionPayload: null },
    });

    return commitMedicationAdministration(user, pet, medication, adminId);
  }

  // 2. Escolha de Item de Compra
  if (state === "AWAITING_PURCHASE_ITEM_CHOICE") {
    const choiceNum = parseInt(text.trim(), 10);
    const itemIds: string[] = payload.itemIds || [];

    if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > itemIds.length) {
      return {
        replyText: `Opção inválida. Digite um número de 1 a ${itemIds.length} ou *cancelar*.`,
      };
    }

    const selectedItemId = itemIds[choiceNum - 1];
    const item = await prisma.inventoryItem.findUnique({ where: { id: selectedItemId } });

    if (!item) {
      return { replyText: "Item não encontrado." };
    }

    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        state: "AWAITING_PURCHASE_QTY",
        pendingActionPayload: JSON.stringify({ itemId: item.id, itemName: item.name, unit: item.unit }),
      },
    });

    return {
      replyText: `Qual a quantidade de *${item.name}* comprada? (Ex: *12kg*, *12000* ou *30* comprimidos)`,
    };
  }

  // 3. Quantidade da Compra (com conversão inteligente de kg para g)
  if (state === "AWAITING_PURCHASE_QTY") {
    const cleanInput = text.replace(",", ".").trim().toLowerCase();
    const isKgInput = cleanInput.includes("kg");
    const numVal = parseFloat(cleanInput.replace(/[^\d.]/g, ""));

    if (isNaN(numVal) || numVal <= 0) {
      return { replyText: `Por favor, digite um valor numérico válido maior que zero (ou envie *cancelar*).` };
    }

    const inv = await prisma.inventoryItem.findUnique({ where: { id: payload.itemId } });
    if (!inv) return { replyText: "Item não encontrado." };

    // Conversão inteligente se o item estiver cadastrado em gramas 'g' e usuário mandou kg
    let qty = numVal;
    if (inv.unit === "g" && (isKgInput || numVal <= 30)) {
      qty = numVal * 1000;
    }

    const newQty = inv.currentQuantity + qty;
    const fc = calculateStockForecast({
      currentQuantity: newQty,
      dailyConsumption: inv.dailyConsumption,
      unit: inv.unit,
      purchaseLeadTimeDays: inv.purchaseLeadTimeDays,
    });

    // Registrar Compra Formal e Transação
    const purchase = await prisma.purchase.create({
      data: {
        petId: pet.id,
        userId: user.id,
        supplier: "Via WhatsApp",
        total: 0,
        date: new Date(),
        notes: `Compra de ${qty} ${inv.unit} via WhatsApp`,
      },
    });

    await prisma.purchaseItem.create({
      data: {
        purchaseId: purchase.id,
        inventoryItemId: inv.id,
        quantity: qty,
        unitPrice: 0,
        total: 0,
      },
    });

    await prisma.inventoryTransaction.create({
      data: {
        inventoryItemId: inv.id,
        type: "purchase",
        quantity: qty,
        date: new Date(),
        userId: user.id,
        notes: "Entrada registrada via WhatsApp",
      },
    });

    await prisma.inventoryItem.update({
      where: { id: inv.id },
      data: {
        currentQuantity: newQty,
        status: fc.status,
        estimatedEndDate: fc.estimatedEndDate,
      },
    });

    await prisma.activityLog.create({
      data: {
        petId: pet.id,
        userId: user.id,
        action: `registrou compra de ${qty} ${inv.unit} de ${inv.name} via WhatsApp`,
        entityType: "purchase",
        entityId: purchase.id,
      },
    });

    // Resetar estado
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: { state: "IDLE", pendingActionPayload: null },
    });

    const displayAdded =
      inv.unit === "g" && qty >= 1000 ? `${(qty / 1000).toFixed(1)} kg` : `${qty} ${inv.unit}`;
    const displayTotal =
      inv.unit === "g" && newQty >= 1000 ? `${(newQty / 1000).toFixed(1)} kg` : `${newQty} ${inv.unit}`;

    return {
      replyText:
        `✅ *Compra de ${displayAdded} de ${inv.name} registrada!*\n` +
        `📦 Novo estoque disponível: *${displayTotal}* (~${Math.round(fc.daysRemaining)} dias restantes).\n` +
        `Data ideal da próxima compra recalculada para: *${fc.comprarAteLabel}*.`,
      actionTaken: "purchase_committed",
    };
  }

  // 4. Entrada de Peso
  if (state === "AWAITING_WEIGHT_INPUT") {
    const cleanInput = text.replace(",", ".").toLowerCase().replace("kg", "").trim();
    const weightVal = parseFloat(cleanInput);

    if (isNaN(weightVal) || weightVal <= 0 || weightVal > 250) {
      return {
        replyText: "Por favor, digite um peso válido em kg (ex: *18.5*) ou envie *cancelar*.",
      };
    }

    await prisma.weightRecord.create({
      data: {
        petId: pet.id,
        weight: weightVal,
        date: new Date(),
        notes: "Pesagem registrada via WhatsApp",
      },
    });

    await prisma.pet.update({
      where: { id: pet.id },
      data: { weight: weightVal },
    });

    await prisma.activityLog.create({
      data: {
        petId: pet.id,
        userId: user.id,
        action: `registrou peso de ${weightVal} kg para ${pet.name} via WhatsApp`,
        entityType: "pet",
        entityId: pet.id,
      },
    });

    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: { state: "IDLE", pendingActionPayload: null },
    });

    return {
      replyText:
        `⚖️ *Peso atualizado com sucesso!*\n\n` +
        `*${pet.name}* agora está com *${weightVal} kg* registrado.\n` +
        `O gráfico de evolução no app foi atualizado!`,
      actionTaken: "weight_recorded",
    };
  }

  // 5. Escolha de Troca de Pet
  if (state === "AWAITING_PET_SWITCH_CHOICE") {
    const options: string[] = payload.petIds || [];
    const choiceNum = parseInt(text.trim(), 10);
    let selectedPet: any = null;

    if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= options.length) {
      const selectedPetId = options[choiceNum - 1];
      selectedPet = userPets.find((p) => p.id === selectedPetId);
    } else {
      const nameSearch = text.trim().toLowerCase();
      selectedPet = userPets.find((p) => p.name.toLowerCase().includes(nameSearch));
    }

    if (!selectedPet) {
      return {
        replyText: `Opção inválida. Digite um número de 1 a ${options.length} ou envie *cancelar*.`,
      };
    }

    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: { currentPetId: selectedPet.id, state: "IDLE", pendingActionPayload: null },
    });

    return {
      replyText:
        `🔄 *Contexto alterado com sucesso!*\n\n` +
        `Pet ativo agora: *${selectedPet.name}* (${selectedPet.species}).\n` +
        `Envie *menu* para ver opções para este pet.`,
      actionTaken: "pet_switched",
    };
  }

  // Fallback de estado
  await prisma.whatsappSession.update({
    where: { id: session.id },
    data: { state: "IDLE", pendingActionPayload: null },
  });
  return { replyText: "Estado reiniciado. Como posso ajudar? Envie *menu* para ver opções." };
}

/**
 * Troca de Pet de contexto (Com suporte a seleção numérica)
 */
async function handlePetSwitch(
  user: any,
  session: any,
  userPets: any[],
  rawText: string
): Promise<BotProcessResult> {
  if (userPets.length <= 1) {
    return {
      replyText: `🐾 Você possui apenas o *${userPets[0]?.name || "pet"}* cadastrado na sua conta.`,
    };
  }

  const parts = rawText.trim().split(" ");
  // Se digitou diretamente "pet Luna"
  if (parts.length > 1) {
    const targetName = parts.slice(1).join(" ").toLowerCase();
    const found = userPets.find((p) => p.name.toLowerCase().includes(targetName));
    if (found) {
      await prisma.whatsappSession.update({
        where: { id: session.id },
        data: { currentPetId: found.id, state: "IDLE", pendingActionPayload: null },
      });
      return {
        replyText: `🔄 Contexto alterado para *${found.name}*! Todas as consultas e ações agora serão para este pet. Envie *menu* para ver opções.`,
        actionTaken: "pet_switched",
      };
    }
  }

  // Caso tenha digitado apenas "9" ou "trocar pet", abre a lista numerada
  await prisma.whatsappSession.update({
    where: { id: session.id },
    data: {
      state: "AWAITING_PET_SWITCH_CHOICE",
      pendingActionPayload: JSON.stringify({ petIds: userPets.map((p) => p.id) }),
    },
  });

  let msg = `🐾 *Escolha o pet para focar a conversa:*\n\n`;
  userPets.forEach((p, idx) => {
    const isCurrent = p.id === session.currentPetId ? " ⭐ *(Ativo agora)*" : "";
    msg += `${idx + 1}️⃣ *${p.name}* (${p.species})${isCurrent}\n`;
  });
  msg += `\nResponda com o número (ex: *1*, *2*) ou envie *cancelar*.`;

  return { replyText: msg };
}
