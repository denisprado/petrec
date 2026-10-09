import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

export interface ProcessWhatsAppParams {
  fromPhone: string;
  messageText: string;
  userId?: string;
}

export interface ProcessWhatsAppResult {
  success: boolean;
  replyText: string;
  senderPhone: string;
  userFound: boolean;
  userName?: string;
  actionTaken?: string;
  currentState: string;
}

/**
 * Motor central de processamento de mensagens do Chatbot do WhatsApp PetRec.
 * Compartilhado tanto pelo Webhook oficial da Meta quanto pelo Simulador interno.
 */
export async function processWhatsAppMessage(
  params: ProcessWhatsAppParams
): Promise<ProcessWhatsAppResult> {
  const { fromPhone, messageText, userId } = params;

  let phone = fromPhone || "+5519988887777";
  const text = (messageText || "").trim();

  if (!text) {
    return {
      success: false,
      replyText: "Mensagem vazia.",
      senderPhone: phone,
      userFound: false,
      currentState: "IDLE",
    };
  }

  // Formatar telefone: dígitos com prefixo '+'
  const digits = phone.replace(/[^\d]/g, "");
  const cleanPhone = digits.startsWith("+") ? digits : `+${digits}`;
  const upper = text.toUpperCase();

  // 1. Comando de pareamento / vinculação via token
  if (
    upper.startsWith("CONECTAR_") ||
    upper.startsWith("LINK_") ||
    upper.startsWith("CONECTAR ")
  ) {
    const token = upper.startsWith("CONECTAR ")
      ? upper.replace("CONECTAR ", "").trim()
      : upper;

    const pairResult = await convex.mutation(api.whatsapp.pairByToken, {
      phone: cleanPhone,
      token,
    });

    if (pairResult.success && pairResult.user) {
      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: pairResult.user.name,
        replyText: `🎉 *Conexão realizada com sucesso!*\n\nOlá *${pairResult.user.name}*, seu WhatsApp foi vinculado ao *PetRec*.\nEnvie *menu* ou *0* a qualquer momento para ver as opções disponíveis!`,
        actionTaken: "whatsapp_paired",
        currentState: "IDLE",
      };
    } else {
      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: false,
        replyText:
          "❌ Este código de conexão é inválido ou já expirou. Gere um novo código no app em WhatsApp > Conectar.",
        currentState: "IDLE",
      };
    }
  }

  // 2. Buscar usuário pelo telefone no Convex
  let context = await convex.query(api.whatsapp.getContextByPhone, {
    phone: cleanPhone,
  });

  // Se não encontrou por cleanPhone exato, tentar buscar por userId
  if (!context?.user && userId) {
    try {
      const userById = await convex.query(api.users.getById, {
        userId: userId as any,
      });
      if (userById) {
        if (userById.whatsappPhoneNumber) {
          context = await convex.query(api.whatsapp.getContextByPhone, {
            phone: userById.whatsappPhoneNumber,
          });
        }
        if (!context?.user) {
          // Se o usuário ainda não tiver whatsappPhoneNumber vinculado, conectar automaticamente agora
          await convex.mutation(api.whatsapp.directConnect, {
            userId: userById._id,
            phone: cleanPhone,
          });
          context = await convex.query(api.whatsapp.getContextByPhone, {
            phone: cleanPhone,
          });
        }
      }
    } catch (e) {
      console.error("[WhatsAppBot] Erro ao buscar usuário por id:", e);
    }
  }

  // Fallback: se ainda não encontrou e há usuários na base, associar ao primeiro usuário ativo
  if (!context?.user) {
    const allUsers = await convex.query(api.users.list);
    if (allUsers.length > 0) {
      const defaultUser = allUsers[0];
      await convex.mutation(api.whatsapp.directConnect, {
        userId: defaultUser._id,
        phone: cleanPhone,
      });
      context = await convex.query(api.whatsapp.getContextByPhone, {
        phone: cleanPhone,
      });
    }
  }

  if (!context?.user) {
    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: false,
      replyText:
        "👋 Olá! Não identificamos seu número cadastrado no *PetRec*.\n\n" +
        "Para vincular sua conta:\n" +
        "1. Acesse o PetRec Web\n" +
        "2. Vá na aba *WhatsApp*\n" +
        "3. Insira seu número e clique em *'Conectar / Salvar Número'*!",
      currentState: "IDLE",
    };
  }

  const user = context.user;
  let pets = context.pets || [];

  if (pets.length === 0) {
    const allPets = await convex.query(api.pets.listAll);
    pets = allPets || [];
  }

  const currentPet = pets[0];

  if (!currentPet) {
    return {
      success: true,
      userFound: true,
      senderPhone: cleanPhone,
      userName: user.name,
      replyText:
        "🐾 Você ainda não possui nenhum pet cadastrado. Cadastre seu pet no aplicativo PetRec para começar!",
      currentState: "IDLE",
    };
  }

  const lower = text.toLowerCase();
  const currentSession = context.session;
  const currentState = currentSession?.state || "IDLE";

  // 3. Estado interativo: WAITING_WEIGHT (aguardando digitação de peso)
  if (currentState === "WAITING_WEIGHT") {
    const match = text.match(/(\d+([.,]\d+)?)/);
    if (match) {
      const val = parseFloat(match[1].replace(",", "."));
      if (!isNaN(val) && val > 0 && val < 200) {
        await convex.mutation(api.health.recordWeight, {
          petId: currentPet._id,
          userId: user._id,
          weight: val,
          notes: "Registrado via WhatsApp",
        });

        await convex.mutation(api.whatsapp.updateSession, {
          userId: user._id,
          currentPetId: currentPet._id,
          state: "IDLE",
        });

        return {
          success: true,
          senderPhone: cleanPhone,
          userFound: true,
          userName: user.name,
          replyText: `⚖️ *Pesagem registrada com sucesso!*\n\n*${currentPet.name}* agora está com *${val} kg* registrado no histórico! ✨\nEnvie *0* para voltar ao menu.`,
          actionTaken: "weight_recorded",
          currentState: "IDLE",
        };
      }
    }

    if (lower === "cancelar" || lower === "sair" || lower === "0") {
      await convex.mutation(api.whatsapp.updateSession, {
        userId: user._id,
        currentPetId: currentPet._id,
        state: "IDLE",
      });
      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText: "Operação cancelada. Envie *0* para ver o menu principal.",
        currentState: "IDLE",
      };
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText: `⚠️ Não consegui entender o valor do peso.\nPor favor, envie apenas o número (exemplo: *18.5* ou *18.5kg*), ou digite *cancelar*.`,
      currentState: "WAITING_WEIGHT",
    };
  }

  // 4. Reconhecimento Direto de Linguagem Natural: "alimentei 250g", "dei 300g", etc.
  const naturalFeedingMatch = text.match(
    /(?:alimentei|dei|comeu|coloquei|racao|ração)\s+(\d+)\s*(?:g|gramas)?/i
  );
  if (naturalFeedingMatch) {
    const dose = parseInt(naturalFeedingMatch[1]);
    if (!isNaN(dose) && dose > 0) {
      const inv = await convex.query(api.inventory.listByPet, {
        petId: currentPet._id,
      });
      const racao = inv.find((i: any) => i.category === "racao") || inv[0];
      if (racao) {
        await convex.mutation(api.inventory.recordConsumption, {
          inventoryItemId: racao._id,
          quantity: dose,
          userId: user._id,
          notes: "Refeição registrada via WhatsApp (NLP)",
        });

        return {
          success: true,
          senderPhone: cleanPhone,
          userFound: true,
          userName: user.name,
          replyText: `🥣 *Refeição registrada!*\n\nVocê registrou *${dose} ${racao.unit}* de *${racao.name}* para *${currentPet.name}*.\nSaldo de estoque atualizado no PetRec!`,
          actionTaken: "consumption_recorded",
          currentState: "IDLE",
        };
      }
    }
  }

  // Reconhecimento Direto de Linguagem Natural: "pesei 18.5kg" ou "peso 32kg"
  const explicitWeightMatch = text.match(
    /(?:pesei|peso|pesar)\s+(\d+([.,]\d+)?)\s*(?:kg)?/i
  );
  if (explicitWeightMatch) {
    const val = parseFloat(explicitWeightMatch[1].replace(",", "."));
    if (!isNaN(val) && val > 0 && val < 200) {
      await convex.mutation(api.health.recordWeight, {
        petId: currentPet._id,
        userId: user._id,
        weight: val,
        notes: "Registrado via WhatsApp",
      });

      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText: `⚖️ *Pesagem registrada!*\n\n*${currentPet.name}* atualizado para *${val} kg* no prontuário!`,
        actionTaken: "weight_recorded",
        currentState: "IDLE",
      };
    }
  }

  // 5. COMANDO 0 / Menu
  if (
    lower === "0" ||
    lower === "menu" ||
    lower === "ajuda" ||
    lower === "oi" ||
    lower === "ola" ||
    lower === "olá" ||
    lower === "start" ||
    lower === "bom dia" ||
    lower === "boa tarde" ||
    lower === "boa noite"
  ) {
    await convex.mutation(api.whatsapp.updateSession, {
      userId: user._id,
      currentPetId: currentPet._id,
      state: "IDLE",
    });
    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText:
        `🐾 *Menu PetRec — ${currentPet.name}*\n\n` +
        `1️⃣ *Hoje* — Medicamentos e rotina do dia\n` +
        `2️⃣ *Estoque* — Nível de ração e previsão de compra\n` +
        `3️⃣ *Remédio* — Confirmar administração de dose\n` +
        `4️⃣ *Refeição* — Registrar ração dada\n` +
        `5️⃣ *Vacinas* — Próximos reforços e imunização\n` +
        `6️⃣ *Compras* — Lista de itens para comprar\n` +
        `7️⃣ *Peso* — Consultar ou registrar peso\n` +
        `8️⃣ *Prontuário* — Histórico clínico e consultas\n\n` +
        `💡 _Responda com o número ou envie frases naturais como "alimentei 200g" ou "pesei 18.5kg"!_`,
      currentState: "IDLE",
    };
  }

  // 6. COMANDO 1 / Hoje
  if (lower === "1" || lower.includes("hoje") || lower.includes("agenda")) {
    const todayAdms = await convex.query(
      api.medications.getAdministrationsToday,
      {
        petId: currentPet._id,
      }
    );

    let reply = `📅 *Agenda de Hoje — ${currentPet.name}:*\n\n`;
    if (!todayAdms || todayAdms.length === 0) {
      reply += "Nenhum medicamento pendente para hoje! Tudo em dia. ✨";
    } else {
      for (const a of todayAdms) {
        const statusIcon = a.status === "administered" ? "✅" : "⏰";
        reply += `${statusIcon} *${a.medication?.name || "Medicamento"}* (${a.quantity} dose)\n   Status: ${a.status === "administered" ? "Administrado" : "Agendado"}\n`;
      }
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText: reply,
      currentState: "IDLE",
    };
  }

  // 7. COMANDO 2 / Estoque
  if (
    lower === "2" ||
    lower === "estoque" ||
    lower.includes("ração") ||
    lower.includes("racao")
  ) {
    const inv = await convex.query(api.inventory.listByPet, {
      petId: currentPet._id,
    });
    let reply = `📦 *Estoque & Previsão — ${currentPet.name}:*\n\n`;

    if (!inv || inv.length === 0) {
      reply += "Nenhum item cadastrado no estoque deste pet.";
    } else {
      for (const item of inv) {
        reply += `• *${item.name}*: ${item.currentQuantity} ${item.unit} (Consumo: ${item.dailyConsumption} ${item.unit}/dia) — Status: *${item.status}*\n`;
      }
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText: reply,
      currentState: "IDLE",
    };
  }

  // 8. COMANDO 3 / Remédio
  if (
    lower === "3" ||
    lower.includes("remédio") ||
    lower.includes("remedio") ||
    lower.includes("dose")
  ) {
    const todayAdms = await convex.query(
      api.medications.getAdministrationsToday,
      {
        petId: currentPet._id,
      }
    );
    const pending = todayAdms.find((a: any) => a.status === "scheduled");

    if (pending) {
      await convex.mutation(api.medications.administer, {
        administrationId: pending._id,
        userId: user._id,
        status: "administered",
      });

      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText: `💊 *Medicamento Registrado!*\n\nDose de *${pending.medication?.name || "Medicamento"}* para *${currentPet.name}* marcada como administrada!`,
        actionTaken: "medication_administered",
        currentState: "IDLE",
      };
    } else {
      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText: `💊 Nenhum medicamento agendado pendente no momento para *${currentPet.name}*.`,
        currentState: "IDLE",
      };
    }
  }

  // 9. COMANDO 4 / Refeição
  if (
    lower === "4" ||
    lower.includes("alimentei") ||
    lower.includes("comida") ||
    lower.includes("refeição") ||
    lower.includes("refeicao")
  ) {
    const inv = await convex.query(api.inventory.listByPet, {
      petId: currentPet._id,
    });
    const racao = inv.find((i: any) => i.category === "racao") || inv[0];

    if (racao) {
      const dose = racao.dailyConsumption
        ? Math.round(racao.dailyConsumption / 2)
        : 200;
      await convex.mutation(api.inventory.recordConsumption, {
        inventoryItemId: racao._id,
        quantity: dose,
        userId: user._id,
        notes: "Refeição registrada via WhatsApp",
      });

      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText: `🥣 *Refeição registrada!*\n\nVocê registrou *${dose} ${racao.unit}* de *${racao.name}* para *${currentPet.name}*.\nEstoque atualizado automaticamente no PetRec!`,
        actionTaken: "consumption_recorded",
        currentState: "IDLE",
      };
    } else {
      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText:
          "Nenhuma ração cadastrada no estoque deste pet. Cadastre no app para controlar refeições!",
        currentState: "IDLE",
      };
    }
  }

  // 10. COMANDO 5 / Vacinas
  if (lower === "5" || lower.includes("vacina")) {
    const health = await convex.query(api.health.getPetHealth, {
      petId: currentPet._id,
    });
    let reply = `💉 *Vacinas de ${currentPet.name}:*\n\n`;
    if (!health?.vaccines || health.vaccines.length === 0) {
      reply += "Nenhuma vacina registrada até o momento.";
    } else {
      for (const v of health.vaccines) {
        reply += `• *${v.name}* — Aplicada em: ${v.applicationDate || "Data não registrada"}\n  Próximo reforço: ${v.nextDueDate || "Não informado"}\n`;
      }
    }
    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText: reply,
      currentState: "IDLE",
    };
  }

  // 11. COMANDO 6 / Compras
  if (lower === "6" || lower.includes("compra") || lower.includes("compras")) {
    const shopping = await convex.query(api.inventory.listShoppingList, {
      petId: currentPet._id,
    });
    let reply = `🛒 *Lista de Compras — ${currentPet.name}:*\n\n`;
    const pendingItems = shopping.filter((s: any) => !s.purchased);

    if (pendingItems.length === 0) {
      reply += "Nenhum item pendente na lista de compras! Tudo abastecido. ✨";
    } else {
      for (const it of pendingItems) {
        reply += `• *${it.customName || it.inventoryItem?.name || "Item"}* (${it.quantity || 1} ${it.unit || "un"})\n`;
      }
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText: reply,
      currentState: "IDLE",
    };
  }

  // 12. COMANDO 7 / Peso
  if (lower === "7" || lower === "peso" || lower === "pesei") {
    await convex.mutation(api.whatsapp.updateSession, {
      userId: user._id,
      currentPetId: currentPet._id,
      state: "WAITING_WEIGHT",
    });

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText:
        `⚖️ *Controle de Peso — ${currentPet.name}*\n\n` +
        `• Peso atual no sistema: *${currentPet.weight ? `${currentPet.weight} kg` : "Não informado"}*\n\n` +
        `👉 *Qual o novo peso de ${currentPet.name}?*\n` +
        `Digite apenas o número (ex: *18.5* ou *32*) ou envie *cancelar*.`,
      currentState: "WAITING_WEIGHT",
    };
  }

  // 13. COMANDO 8 / Prontuário
  if (
    lower === "8" ||
    lower.includes("prontuário") ||
    lower.includes("prontuario") ||
    lower.includes("consulta")
  ) {
    const health = await convex.query(api.health.getPetHealth, {
      petId: currentPet._id,
    });
    let reply = `📋 *Prontuário & Histórico Clínico — ${currentPet.name}:*\n\n`;

    if (!health?.clinicalNotes || health.clinicalNotes.length === 0) {
      reply += "Nenhum apontamento veterinário registrado até o momento.";
    } else {
      for (const n of health.clinicalNotes.slice(0, 3)) {
        const authorName = (n as any).author?.name || "Veterinário";
        reply += `• *Nota por ${authorName}*:\n  ${(n as any).content || ""}\n`;
      }
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText: reply,
      currentState: "IDLE",
    };
  }

  // Fallback amigável
  return {
    success: true,
    senderPhone: cleanPhone,
    userFound: true,
    userName: user.name,
    replyText:
      `🐾 Mensagem recebida para *${currentPet.name}*!\n\n` +
      `Envie *0* para ver o menu completo ou escolha:\n` +
      `• *1* — Tarefas de Hoje\n` +
      `• *2* — Estoque de Ração\n` +
      `• *3* — Remédio\n` +
      `• *4* — Registrar Refeição\n` +
      `• *7* — Atualizar Peso`,
    currentState: "IDLE",
  };
}
