import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import {
  buildPetContextSnapshot,
  executeAssistantToolCall,
  PendingItemCandidate,
  processNaturalLanguageWithAI,
} from "./whatsappAiAssistant";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

function normalizeForMatch(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPetMentionedInText(text: string, pets: any[]): any | undefined {
  const normText = normalizeForMatch(text);
  for (const pet of pets) {
    const normName = normalizeForMatch(pet.name || "");
    if (!normName || normName.length < 2) continue;
    const regex = new RegExp(`(^|\\b|\\s)${escapeRegex(normName)}($|\\b|\\s|[,.:!?])`, "i");
    if (regex.test(normText)) {
      return pet;
    }
  }
  return undefined;
}

function findAllPetsMentionedInText(text: string, pets: any[]): any[] {
  const normText = normalizeForMatch(text);
  const found: Array<{ pet: any; index: number }> = [];

  for (const pet of pets) {
    const normName = normalizeForMatch(pet.name || "");
    if (!normName || normName.length < 2) continue;
    const regex = new RegExp(`(?:^|\\b|\\s)(${escapeRegex(normName)})(?:$|\\b|\\s|[,.:!?])`, "i");
    const match = normText.match(regex);
    if (match && match.index !== undefined) {
      found.push({ pet, index: match.index });
    }
  }

  return found.sort((a, b) => a.index - b.index).map((f) => f.pet);
}

async function syncPetRoutineSafe(pet: any): Promise<void> {
  try {
    const tasks: Promise<any>[] = [
      convex.mutation(api.medications.syncRoutineMedications, {
        petId: pet._id,
      }),
    ];
    if (pet.routineMode !== "manual") {
      tasks.push(
        convex.mutation(api.inventory.syncRoutineConsumption, {
          petId: pet._id,
        })
      );
    }
    await Promise.all(tasks);
  } catch (syncErr) {
    console.warn("[WhatsAppBot] Aviso ao sincronizar rotina:", syncErr);
  }
}

export interface ProcessWhatsAppParams {
  fromPhone: string;
  messageText: string;
  userId?: string;
  mediaType?: "audio" | "image";
  mediaBase64?: string;
  mediaMimeType?: string;
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
  const { fromPhone, messageText, userId, mediaType, mediaBase64, mediaMimeType } = params;

  let phone = fromPhone || "+5519988887777";
  const text = (messageText || "").trim();

  if (!text && !mediaType) {
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

  if (!context?.user) {
    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: false,
      replyText:
        "👋 Olá! Não identificamos seu número cadastrado no *PetRec*.\n\n" +
        "Para vincular sua conta:\n" +
        "1. Acesse o PetRec Web e crie ou acesse sua conta\n" +
        "2. Vá na aba *WhatsApp*\n" +
        "3. Insira seu número e clique em *'Conectar / Salvar Número'*!",
      currentState: "IDLE",
    };
  }

  const user = context.user;
  const pets = context.pets || [];

  const currentSession = context.session;
  const currentState = currentSession?.state || "IDLE";

  const previousPet =
    (currentSession?.currentPetId
      ? pets.find((p: any) => p._id === currentSession.currentPetId)
      : null) || pets[0];
  let currentPet = previousPet;

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
  const normalizedCmd = normalizeForMatch(text);
  const mentionedPets = text ? findAllPetsMentionedInText(text, pets) : [];

  // Processamento Multi-Pet simultâneo na mesma mensagem (ex: "O Rex comeu 200g e a Luna ficou em jejum")
  if (currentState === "IDLE" && !mediaType && mentionedPets.length >= 2) {
    const petNamesAlternation = mentionedPets
      .map((p: any) => escapeRegex(normalizeForMatch(p.name || "")))
      .filter(Boolean)
      .join("|");

    const splitPattern = new RegExp(
      `(?:,|;|\\s+e\\s+)(?=(?:o\\s+|a\\s+)?(?:${petNamesAlternation})\\b)`,
      "i"
    );
    const clauses = text
      .split(splitPattern)
      .map((c) => c.trim())
      .filter(Boolean);

    if (clauses.length >= 2) {
      const replies: string[] = [];
      const actions: string[] = [];
      let lastHandledPet = currentPet;
      let nextState = "IDLE";
      let pendingPayload: string | undefined;

      for (const clause of clauses) {
        const clausePet = findPetMentionedInText(clause, mentionedPets) || lastHandledPet;
        lastHandledPet = clausePet;
        await syncPetRoutineSafe(clausePet);

        const aiClauseRes = await processNaturalLanguageWithAI({
          convex,
          messageText: clause,
          currentPet: clausePet,
          allPets: pets,
          userId: user._id,
        });

        if (aiClauseRes.handled) {
          replies.push(aiClauseRes.replyText);
          if (aiClauseRes.actionTaken) actions.push(aiClauseRes.actionTaken);
          if (aiClauseRes.nextState !== "IDLE" && aiClauseRes.pendingActionPayload) {
            nextState = aiClauseRes.nextState;
            pendingPayload = aiClauseRes.pendingActionPayload;
          }
        }
      }

      if (replies.length > 0) {
        await convex.mutation(api.whatsapp.updateSession, {
          userId: user._id,
          currentPetId: lastHandledPet._id,
          state: nextState,
          pendingActionPayload: pendingPayload,
        });

        return {
          success: true,
          senderPhone: cleanPhone,
          userFound: true,
          userName: user.name,
          replyText: `🐾 *Atualização Multi-Pet registrada:*\n\n${replies.join("\n\n---\n\n")}`,
          actionTaken: actions.join(",") || "multi_pet_updated",
          currentState: nextState,
        };
      }
    }
  }

  let autoSwitchNotice = "";
  if (
    mentionedPets.length === 1 &&
    currentState === "IDLE" &&
    mentionedPets[0]._id !== currentPet._id
  ) {
    currentPet = mentionedPets[0];
    await convex.mutation(api.whatsapp.updateSession, {
      userId: user._id,
      currentPetId: currentPet._id,
      state: currentState,
      pendingActionPayload: currentSession?.pendingActionPayload,
    });
    autoSwitchNotice = `🔄 _(Pet em foco alternado para *${currentPet.name}*)_\n\n`;
  }

  // Sincroniza rotina diária antes de avaliar ações/perguntas
  await syncPetRoutineSafe(currentPet);

  // 3a. Estado interativo: WAITING_PET_CHOICE (escolha de pet via lista numerada)
  if (currentState === "WAITING_PET_CHOICE") {
    if (normalizedCmd === "cancelar" || normalizedCmd === "sair" || normalizedCmd === "0") {
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

    let candidates: Array<{ id: string; name: string; species: string }> = pets.map((p: any) => ({
      id: String(p._id),
      name: p.name,
      species: p.species,
    }));

    if (currentSession?.pendingActionPayload) {
      try {
        const parsed = JSON.parse(currentSession.pendingActionPayload);
        if (Array.isArray(parsed?.candidates)) candidates = parsed.candidates;
      } catch {
        // usa lista atual de pets
      }
    }

    const numMatch = normalizedCmd.match(/^(\d+)$/);
    let chosenPet =
      numMatch && candidates[parseInt(numMatch[1], 10) - 1]
        ? candidates[parseInt(numMatch[1], 10) - 1]
        : undefined;

    if (!chosenPet) {
      chosenPet = candidates.find((c) => {
        const normName = normalizeForMatch(c.name);
        return normName === normalizedCmd || normalizedCmd.includes(normName);
      });
    }

    if (chosenPet) {
      await convex.mutation(api.whatsapp.updateSession, {
        userId: user._id,
        currentPetId: chosenPet.id as any,
        state: "IDLE",
      });

      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText:
          `🐾 *Pet em foco alternado!*\n\n` +
          `Agora estou respondendo para *${chosenPet.name}* (${chosenPet.species}).\n` +
          `Envie *0* para ver o menu de *${chosenPet.name}* ou fale naturalmente!`,
        actionTaken: "pet_switched",
        currentState: "IDLE",
      };
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText:
        "⚠️ Não entendi qual pet você escolheu. Responda com o *número* da lista ou *nome do pet*, ou digite *cancelar*.",
      currentState: "WAITING_PET_CHOICE",
    };
  }

  // 3b. Estado interativo: WAITING_ITEM_CHOICE (desambiguação de itens no estoque)
  if (currentState === "WAITING_ITEM_CHOICE" && currentSession?.pendingActionPayload) {
    if (normalizedCmd === "cancelar" || normalizedCmd === "sair" || normalizedCmd === "0") {
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

    try {
      const payload = JSON.parse(currentSession.pendingActionPayload) as {
        toolName: string;
        args: Record<string, any>;
        candidates: PendingItemCandidate[];
      };

      const numMatch = normalizedCmd.match(/^(\d+)$/);
      let chosen =
        numMatch && payload.candidates[parseInt(numMatch[1], 10) - 1]
          ? payload.candidates[parseInt(numMatch[1], 10) - 1]
          : undefined;

      if (!chosen) {
        chosen = payload.candidates.find((c) => {
          const normName = normalizeForMatch(c.name);
          return normName.includes(normalizedCmd) || normalizedCmd.includes(normName);
        });
      }

      if (chosen) {
        const snapshot = await buildPetContextSnapshot(convex, currentPet, pets);
        const exec = await executeAssistantToolCall({
          convex,
          toolName: payload.toolName,
          args: { ...payload.args, itemName: chosen.name },
          snapshot,
          userId: user._id,
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
          replyText: exec.replyText,
          actionTaken: exec.actionTaken,
          currentState: "IDLE",
        };
      }
    } catch (parseErr) {
      console.warn("[WhatsAppBot] Erro ao ler WAITING_ITEM_CHOICE payload:", parseErr);
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText:
        "⚠️ Não consegui identificar o item. Responda com o *número* da opção ou *nome do produto*, ou digite *cancelar*.",
      currentState: "WAITING_ITEM_CHOICE",
    };
  }

  // 3c. Estado interativo: WAITING_MISSING_QUANTITY (quantidade pendente em compra)
  if (currentState === "WAITING_MISSING_QUANTITY" && currentSession?.pendingActionPayload) {
    if (normalizedCmd === "cancelar" || normalizedCmd === "sair" || normalizedCmd === "0") {
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

    try {
      const payload = JSON.parse(currentSession.pendingActionPayload) as {
        itemName: string;
      };

      const qtyMatch = normalizedCmd.match(
        /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas|comprimidos?|capsulas?|ml|unidades?|un)?/
      );
      if (qtyMatch) {
        const qty = parseFloat(qtyMatch[1].replace(",", "."));
        const unit = qtyMatch[2] || (payload.itemName.toLowerCase().includes("raç") ? "kg" : "unidades");

        const snapshot = await buildPetContextSnapshot(convex, currentPet, pets);
        const exec = await executeAssistantToolCall({
          convex,
          toolName: "record_purchase",
          args: {
            itemName: payload.itemName,
            quantity: qty,
            unit,
            notes: `Compra completada via WhatsApp (${text})`,
          },
          snapshot,
          userId: user._id,
        });

        await convex.mutation(api.whatsapp.updateSession, {
          userId: user._id,
          currentPetId: currentPet._id,
          state: exec.nextState || "IDLE",
          pendingActionPayload: exec.pendingActionPayload,
        });

        return {
          success: true,
          senderPhone: cleanPhone,
          userFound: true,
          userName: user.name,
          replyText: exec.replyText,
          actionTaken: exec.actionTaken,
          currentState: exec.nextState || "IDLE",
        };
      }
    } catch (parseErr) {
      console.warn("[WhatsAppBot] Erro ao ler WAITING_MISSING_QUANTITY:", parseErr);
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText:
        "⚠️ Informe a quantidade comprada (ex: *15kg*, *2kg* ou *20 unidades*), ou digite *cancelar*.",
      currentState: "WAITING_MISSING_QUANTITY",
    };
  }

  // 3d. Estado interativo: WAITING_MED_CHOICE (desambiguação de medicamentos)
  if (currentState === "WAITING_MED_CHOICE" && currentSession?.pendingActionPayload) {
    if (normalizedCmd === "cancelar" || normalizedCmd === "sair" || normalizedCmd === "0") {
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

    try {
      const payload = JSON.parse(currentSession.pendingActionPayload) as {
        targetStatus: "administered" | "skipped";
        reason?: string;
        candidates: Array<{
          id: string;
          name: string;
          time: string;
          status: string;
          quantity: number;
        }>;
      };

      const numMatch = normalizedCmd.match(/^(\d+)$/);
      let chosen =
        numMatch &&
        payload.candidates[parseInt(numMatch[1], 10) - 1]
          ? payload.candidates[parseInt(numMatch[1], 10) - 1]
          : undefined;

      if (!chosen) {
        chosen = payload.candidates.find((c) => {
          const normName = normalizeForMatch(c.name);
          return (
            normName.includes(normalizedCmd) ||
            normalizedCmd.includes(normName) ||
            normalizedCmd.includes(c.time.slice(0, 2))
          );
        });
      }

      if (chosen) {
        await convex.mutation(api.medications.administer, {
          administrationId: chosen.id as any,
          userId: user._id,
          status: payload.targetStatus,
          notes: payload.reason,
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
          replyText:
            payload.targetStatus === "skipped"
              ? `💊 *Exceção Registrada!*\n\nA dose das *${chosen.time}* de *${chosen.name}* para *${currentPet.name}* foi marcada como *NÃO administrada / pulada*.\n🛡️ Estoque preservado/estornado no PetRec!`
              : `💊 *Medicamento Registrado!*\n\nDose das *${chosen.time}* de *${chosen.name}* para *${currentPet.name}* marcada como administrada!`,
          actionTaken:
            payload.targetStatus === "skipped"
              ? "medication_skipped"
              : "medication_administered",
          currentState: "IDLE",
        };
      }
    } catch (parseErr) {
      console.warn("[WhatsAppBot] Erro ao ler pendingActionPayload:", parseErr);
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText:
        "⚠️ Não entendi qual dose você escolheu. Responda com o *número* da opção ou digite *cancelar*.",
      currentState: "WAITING_MED_CHOICE",
    };
  }

  // 3e. Estado interativo: WAITING_WEIGHT (aguardando digitação de peso)
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

  // 4. Atalhos diretos inequívocos (frases curtas e exatas)
  const simpleFeedingMatch = normalizedCmd.match(
    /^(?:alimentei|dei|coloquei)\s+(\d+)\s*(?:g|gramas)?$/i
  );
  if (simpleFeedingMatch) {
    const dose = parseInt(simpleFeedingMatch[1], 10);
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
          notes: "Refeição registrada via WhatsApp",
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

  const simpleWeightMatch = normalizedCmd.match(
    /^(?:pesei|peso|pesar)\s+(\d+(?:[.,]\d+)?)\s*(?:kg)?$/i
  );
  if (simpleWeightMatch) {
    const val = parseFloat(simpleWeightMatch[1].replace(",", "."));
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
    normalizedCmd === "0" ||
    normalizedCmd === "menu" ||
    normalizedCmd === "ajuda" ||
    normalizedCmd === "oi" ||
    normalizedCmd === "ola" ||
    normalizedCmd === "start" ||
    normalizedCmd === "bom dia" ||
    normalizedCmd === "boa tarde" ||
    normalizedCmd === "boa noite"
  ) {
    await convex.mutation(api.whatsapp.updateSession, {
      userId: user._id,
      currentPetId: currentPet._id,
      state: "IDLE",
    });

    const isRoutineAuto = currentPet.routineMode !== "manual";
    const routineBadge = isRoutineAuto
      ? "🔄 *Modo por Exceção Ativo*"
      : "✍️ *Modo Manual Ativo*";
    const switchPetLine =
      pets.length > 1
        ? `9️⃣ *Trocar Pet* — Alternar entre seus ${pets.length} pets\n`
        : "";

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText:
        `🐾 *Menu PetRec — ${currentPet.name}*\n` +
        `Status: ${routineBadge}\n\n` +
        `1️⃣ *Hoje* — Medicamentos e rotina do dia\n` +
        `2️⃣ *Estoque* — Nível de ração e previsão de compra\n` +
        `3️⃣ *Remédio* — ${
          isRoutineAuto
            ? "Registrar Exceção / Pular dose (não dei)"
            : "Confirmar administração de dose"
        }\n` +
        `4️⃣ *Refeição* — ${
          isRoutineAuto
            ? "Registrar Exceção / Jejum (não comeu)"
            : "Registrar ração dada"
        }\n` +
        `5️⃣ *Vacinas* — Próximos reforços e imunização\n` +
        `6️⃣ *Compras* — Lista de itens para comprar\n` +
        `7️⃣ *Peso* — Consultar ou registrar peso\n` +
        `8️⃣ *Prontuário* — Histórico clínico e consultas\n` +
        `${switchPetLine}\n` +
        `🤖 _Você também pode conversar naturalmente:_\n` +
        `_"deixou metade do pote"_, _"comprei 15kg de ração"_, _"cuspiu o comprimido das 8h"_ ou _"quando a ração vai acabar?"_!`,
      currentState: "IDLE",
    };
  }

  // 6. COMANDO 1 / Hoje
  if (
    normalizedCmd === "1" ||
    normalizedCmd === "hoje" ||
    normalizedCmd === "agenda" ||
    normalizedCmd === "tarefas"
  ) {
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
        const timeMatch = (a.scheduledAt || "").match(/T(\d{2}:\d{2})/);
        const timeStr = timeMatch ? timeMatch[1] : "--:--";
        const statusIcon =
          a.status === "administered"
            ? "✅"
            : a.status === "skipped"
            ? "❌"
            : "⏰";
        const statusLabel =
          a.status === "administered"
            ? "Administrado"
            : a.status === "skipped"
            ? "Pulado (estornado)"
            : "Agendado";
        reply += `${statusIcon} *${a.medication?.name || "Medicamento"}* às ${timeStr} (${a.quantity} dose)\n   Status: ${statusLabel}\n`;
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
    normalizedCmd === "2" ||
    normalizedCmd === "estoque" ||
    normalizedCmd === "ver estoque"
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
    normalizedCmd === "3" ||
    normalizedCmd === "remedio" ||
    normalizedCmd === "remedios" ||
    normalizedCmd === "dose"
  ) {
    const isRoutineAuto = currentPet.routineMode !== "manual";
    const todayAdms = await convex.query(
      api.medications.getAdministrationsToday,
      {
        petId: currentPet._id,
      }
    );

    if (isRoutineAuto) {
      let reply = `💊 *Medicamentos & Rotina — ${currentPet.name}*\n`;
      reply += `_(🔄 Modo por Exceção: doses são baixadas automaticamente pelo horário)_\n\n`;

      if (!todayAdms || todayAdms.length === 0) {
        reply += `Nenhum medicamento agendado para hoje.`;
      } else {
        reply += `*Doses de hoje:*\n`;
        for (const a of todayAdms) {
          const timeMatch = (a.scheduledAt || "").match(/T(\d{2}:\d{2})/);
          const timeStr = timeMatch ? ` (${timeMatch[1]})` : "";
          const icon =
            a.status === "administered"
              ? "✅ Assumido como dado"
              : a.status === "skipped"
              ? "❌ Pulado (estornado)"
              : "⏰ Agendado";
          reply += `• *${a.medication?.name || "Medicamento"}*${timeStr}: ${icon}\n`;
        }
        reply += `\n⚠️ *Para registrar que NÃO deu uma dose:*\nEnvie por exemplo *"não dei o remédio das 8h"* ou *"pulei a dose"*. O estoque será estornado!`;
      }

      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText: reply,
        currentState: "IDLE",
      };
    } else {
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
  }

  // 9. COMANDO 4 / Refeição
  if (
    normalizedCmd === "4" ||
    normalizedCmd === "alimentei" ||
    normalizedCmd === "comida" ||
    normalizedCmd === "refeicao"
  ) {
    const isRoutineAuto = currentPet.routineMode !== "manual";
    const inv = await convex.query(api.inventory.listByPet, {
      petId: currentPet._id,
    });
    const racao = inv.find((i: any) => i.category === "racao") || inv[0];

    if (!racao) {
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

    if (isRoutineAuto) {
      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText:
          `🥣 *Alimentação Regular — ${currentPet.name}:*\n` +
          `_(🔄 Modo por Exceção Ativo)_\n\n` +
          `A ração é deduzida automaticamente todo dia conforme o consumo diário de *${racao.dailyConsumption} ${racao.unit}/dia* de *${racao.name}*.\n\n` +
          `⚠️ *Se o pet ficou em jejum ou deixou sobra no pote:*\n` +
          `Envie *"jejum"*, *"deixou metade do pote"* ou *"sobrou 150g"*. Essa quantidade será preservada no estoque!`,
        currentState: "IDLE",
      };
    } else {
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
    }
  }

  // 10. COMANDO 5 / Vacinas
  if (
    normalizedCmd === "5" ||
    normalizedCmd === "vacina" ||
    normalizedCmd === "vacinas"
  ) {
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
  if (
    normalizedCmd === "6" ||
    normalizedCmd === "compra" ||
    normalizedCmd === "compras" ||
    normalizedCmd === "comprei" ||
    normalizedCmd === "lista de compras"
  ) {
    const shopping = await convex.query(api.inventory.listShoppingList, {
      petId: currentPet._id,
    });
    let reply = `🛒 *Lista de Compras — ${currentPet.name}:*\n\n`;
    const pendingItems = shopping.filter((s: any) => !s.isPurchased);

    if (pendingItems.length === 0) {
      reply += "Nenhum item pendente na lista de compras! Tudo abastecido. ✨";
    } else {
      for (const it of pendingItems) {
        reply += `• *${it.customName || it.inventoryItem?.name || "Item"}* (${it.quantity || 1} ${it.unit || "un"})\n`;
      }
    }

    reply += `\n💡 _Se já comprou algo, envie por exemplo: "comprei 15kg de ração"!_`;

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
  if (normalizedCmd === "7" || normalizedCmd === "peso" || normalizedCmd === "pesei") {
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
    normalizedCmd === "8" ||
    normalizedCmd === "prontuario" ||
    normalizedCmd === "consulta" ||
    normalizedCmd === "historico"
  ) {
    const health = await convex.query(api.health.getPetHealth, {
      petId: currentPet._id,
    });
    let reply = `📋 *Prontuário & Histórico Clínico — ${currentPet.name}:*\n\n`;

    if (!health?.clinicalNotes || health.clinicalNotes.length === 0) {
      reply += "Nenhum apontamento veterinário registrado até o momento.";
    } else {
      for (const n of health.clinicalNotes.slice(0, 3)) {
        const authorName = (n as any).author?.name || "Tutor/Vet";
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

  // 14. COMANDO 9 / Trocar Pet
  if (
    normalizedCmd === "9" ||
    normalizedCmd === "trocar pet" ||
    normalizedCmd === "mudar pet" ||
    normalizedCmd === "outro pet" ||
    normalizedCmd === "pets" ||
    normalizedCmd.startsWith("trocar para ") ||
    normalizedCmd.startsWith("mudar para ")
  ) {
    if (pets.length <= 1) {
      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText: `🐾 Você possui apenas *${currentPet.name}* cadastrado no momento.`,
        currentState: "IDLE",
      };
    }

    if (
      (normalizedCmd.startsWith("trocar para ") || normalizedCmd.startsWith("mudar para ")) &&
      mentionedPets.length === 1
    ) {
      const targetPet = mentionedPets[0];
      await convex.mutation(api.whatsapp.updateSession, {
        userId: user._id,
        currentPetId: targetPet._id,
        state: "IDLE",
      });

      return {
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText:
          `🐾 *Pet em foco alternado!*\n\n` +
          `Agora estou respondendo para *${targetPet.name}* (${targetPet.species}).\n` +
          `Envie *0* para ver o menu de *${targetPet.name}* ou fale naturalmente!`,
        actionTaken: "pet_switched",
        currentState: "IDLE",
      };
    }

    const candidates = pets.map((p: any) => ({
      id: String(p._id),
      name: p.name,
      species: p.species,
    }));

    const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
    const optionsLines = candidates.map((c: any, idx: number) => {
      const prefix = numberEmojis[idx] || `${idx + 1}.`;
      const isCurrent = c.id === String(currentPet._id);
      return `${prefix} *${c.name}* (${c.species})${isCurrent ? " ✅ [Atual]" : ""}`;
    });

    await convex.mutation(api.whatsapp.updateSession, {
      userId: user._id,
      currentPetId: currentPet._id,
      state: "WAITING_PET_CHOICE",
      pendingActionPayload: JSON.stringify({ candidates }),
    });

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText:
        `🐾 *Qual pet você deseja colocar em foco?*\n\n` +
        `${optionsLines.join("\n")}\n\n` +
        `👉 Responda com o *número* ou *nome do pet*, ou digite *cancelar*.`,
      currentState: "WAITING_PET_CHOICE",
    };
  }

  // 15. Interpretação com IA (Gemini 3.8 Flash + Tool Calling + NLU Contextual + Áudio/Fotos)
  const aiResult = await processNaturalLanguageWithAI({
    convex,
    messageText: text,
    currentPet,
    allPets: pets,
    userId: user._id,
    mediaType,
    mediaBase64,
    mediaMimeType,
  });

  if (aiResult.handled) {
    if (aiResult.nextState !== "IDLE" && aiResult.pendingActionPayload) {
      await convex.mutation(api.whatsapp.updateSession, {
        userId: user._id,
        currentPetId: currentPet._id,
        state: aiResult.nextState,
        pendingActionPayload: aiResult.pendingActionPayload,
      });
    }

    return {
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText: `${autoSwitchNotice}${aiResult.replyText}`,
      actionTaken: aiResult.actionTaken,
      currentState: aiResult.nextState,
    };
  }

  // 16. Fallback amigável
  return {
    success: true,
    senderPhone: cleanPhone,
    userFound: true,
    userName: user.name,
    replyText:
      `${autoSwitchNotice}🐾 Não identifiquei uma ação exata para *${currentPet.name}*, mas você pode tentar:\n\n` +
      `• _"O ${currentPet.name} deixou metade do pote hoje cedo"_\n` +
      `• _"Não consegui dar o comprimido das 8h"_\n` +
      `• _"Comprei um saco de 15kg de ração"_\n` +
      `• _"Pesei o balde e tem 4,2kg de ração"_\n` +
      `• _"Anota aí que ele teve diarreia hoje"_\n` +
      `• _"Quando a ração vai acabar?"_\n` +
      `• Ou enviar um *áudio* ou *foto de receita / vacina*!\n\n` +
      `Ou envie *0* para abrir o menu numérico.`,
    currentState: "IDLE",
  };
}
