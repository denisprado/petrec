import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://zany-owl-512.convex.cloud"
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fromPhone, messageText, userId } = body;

    let phone = fromPhone || "+5519988887777";
    const text = (messageText || "").trim();

    if (!text) {
      return NextResponse.json(
        { error: "Texto da mensagem é obrigatório" },
        { status: 400 }
      );
    }

    // Formatar telefone: remover qualquer caractere não numérico
    const digits = phone.replace(/[^\d]/g, "");
    const cleanPhone = digits.startsWith("+") ? digits : `+${digits}`;
    const upper = text.toUpperCase();

    // 1. Comando de pareamento
    if (upper.startsWith("CONECTAR_") || upper.startsWith("LINK_") || upper.startsWith("CONECTAR ")) {
      const token = upper.startsWith("CONECTAR ") ? upper.replace("CONECTAR ", "").trim() : upper;
      const pairResult = await convex.mutation(api.whatsapp.pairByToken, {
        phone: cleanPhone,
        token,
      });

      if (pairResult.success && pairResult.user) {
        return NextResponse.json({
          success: true,
          senderPhone: cleanPhone,
          userFound: true,
          userName: pairResult.user.name,
          replyText: `🎉 *Conexão realizada com sucesso!*\n\nOlá *${pairResult.user.name}*, seu WhatsApp foi vinculado ao *PetRec*.\nEnvie *menu* ou *0* a qualquer momento para ver as opções disponíveis!`,
          actionTaken: "whatsapp_paired",
          currentState: "IDLE",
        });
      } else {
        return NextResponse.json({
          success: true,
          senderPhone: cleanPhone,
          userFound: false,
          replyText: "❌ Este código de conexão é inválido ou já expirou. Gere um novo código no app.",
          currentState: "IDLE",
        });
      }
    }

    // 2. Buscar usuário pelo telefone no Convex
    let context = await convex.query(api.whatsapp.getContextByPhone, {
      phone: cleanPhone,
    });

    // Se não encontrou por cleanPhone exato, tentar buscar por userId
    if (!context?.user && userId) {
      try {
        const userById = await convex.query(api.users.getById, { userId: userId as any });
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
        console.error("Erro ao buscar usuário por id:", e);
      }
    }

    // Se ainda não encontrou e houver usuários cadastrados, pegar o primeiro usuário ativo (ex: Denis)
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
      return NextResponse.json({
        success: true,
        senderPhone: cleanPhone,
        userFound: false,
        replyText:
          "👋 Olá! Não identificamos seu número cadastrado no *PetRec*.\n\n" +
          "Para vincular sua conta:\n" +
          "1. Acesse o PetRec Web\n" +
          "2. Vá na aba *WhatsApp*\n" +
          "3. Digite seu número e clique em *'Conectar / Salvar Número'*!",
        currentState: "IDLE",
      });
    }

    const user = context.user;
    let pets = context.pets || [];

    // Se o usuário não tem pets via petMembers, buscar os pets globais para garantir a demonstração
    if (pets.length === 0) {
      const allPets = await convex.query(api.pets.listAll);
      pets = allPets || [];
    }

    const currentPet = pets[0];

    if (!currentPet) {
      return NextResponse.json({
        success: true,
        userFound: true,
        userName: user.name,
        replyText: "Você ainda não possui nenhum pet cadastrado. Cadastre seu pet no aplicativo!",
        currentState: "IDLE",
      });
    }

    const lower = text.toLowerCase();
    const currentSession = context.session;
    const currentState = currentSession?.state || "IDLE";

    // Se estiver aguardando o peso (estado interativo WAITING_WEIGHT):
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

          return NextResponse.json({
            success: true,
            replyText: `⚖️ *Pesagem registrada com sucesso!*\n\n*${currentPet.name}* agora está com *${val} kg* registrado no histórico! ✨\nEnvie *0* para voltar ao menu.`,
            actionTaken: "weight_recorded",
            currentState: "IDLE",
          });
        }
      }

      if (lower === "cancelar" || lower === "sair" || lower === "0") {
        await convex.mutation(api.whatsapp.updateSession, {
          userId: user._id,
          currentPetId: currentPet._id,
          state: "IDLE",
        });
        return NextResponse.json({
          success: true,
          replyText: "Operação cancelada. Envie *0* para ver o menu principal.",
          currentState: "IDLE",
        });
      }

      return NextResponse.json({
        success: true,
        replyText: `⚠️ Não consegui entender o valor do peso.\nPor favor, envie apenas o número (exemplo: *18.5* ou *18.5kg*), ou digite *cancelar*.`,
        currentState: "WAITING_WEIGHT",
      });
    }

    // COMANDO 0 / Menu
    if (lower === "0" || lower === "menu" || lower === "ajuda" || lower === "oi" || lower === "olá") {
      await convex.mutation(api.whatsapp.updateSession, {
        userId: user._id,
        currentPetId: currentPet._id,
        state: "IDLE",
      });
      return NextResponse.json({
        success: true,
        senderPhone: cleanPhone,
        userFound: true,
        userName: user.name,
        replyText:
          `🐾 *Menu PetRec — ${currentPet.name}*\n\n` +
          `1️⃣ *Hoje* — Tarefas e remédios agendados\n` +
          `2️⃣ *Estoque* — Nível de ração e previsão de término\n` +
          `3️⃣ *Remédio* — Confirmar administração de dose\n` +
          `4️⃣ *Refeição* — Registrar ração dada\n` +
          `5️⃣ *Vacinas* — Próximos reforços\n` +
          `6️⃣ *Compras* — Registrar compra de produtos\n` +
          `7️⃣ *Peso* — Consultar ou registrar peso\n` +
          `8️⃣ *Prontuário* — Histórico clínico e consultas\n\n` +
          `💡 _Responda com o número desejado ou digite comandos como "alimentei 200g" ou "pesei 18kg"._`,
        currentState: "IDLE",
      });
    }

    // COMANDO 1 / Hoje
    if (lower === "1" || lower.includes("hoje") || lower.includes("agenda")) {
      const todayAdms = await convex.query(api.medications.getAdministrationsToday, {
        petId: currentPet._id,
      });

      let reply = `📅 *Agenda de Hoje — ${currentPet.name}:*\n\n`;
      if (!todayAdms || todayAdms.length === 0) {
        reply += "Nenhum medicamento pendente para hoje! Tudo em ordem. ✨";
      } else {
        for (const a of todayAdms) {
          const statusIcon = a.status === "administered" ? "✅" : "⏰";
          reply += `${statusIcon} *${a.medication?.name || "Medicamento"}* (${a.quantity} dose)\n   Status: ${a.status}\n`;
        }
      }

      return NextResponse.json({
        success: true,
        replyText: reply,
        currentState: "IDLE",
      });
    }

    // COMANDO 2 / Estoque
    if (lower === "2" || lower === "estoque" || lower.includes("ração") || lower.includes("racao")) {
      const inv = await convex.query(api.inventory.listByPet, { petId: currentPet._id });
      let reply = `📦 *Estoque & Previsão — ${currentPet.name}:*\n\n`;

      if (!inv || inv.length === 0) {
        reply += "Nenhum item cadastrado no estoque deste pet.";
      } else {
        for (const item of inv) {
          reply += `• *${item.name}*: ${item.currentQuantity} ${item.unit} (Consumo: ${item.dailyConsumption} ${item.unit}/dia) — Status: *${item.status}*\n`;
        }
      }

      return NextResponse.json({
        success: true,
        replyText: reply,
        currentState: "IDLE",
      });
    }

    // COMANDO 3 / Remédio
    if (lower === "3" || lower.includes("remédio") || lower.includes("remedio")) {
      const todayAdms = await convex.query(api.medications.getAdministrationsToday, {
        petId: currentPet._id,
      });
      const pending = todayAdms.find((a: any) => a.status === "scheduled");

      if (pending) {
        await convex.mutation(api.medications.administer, {
          administrationId: pending._id,
          userId: user._id,
          status: "administered",
        });

        return NextResponse.json({
          success: true,
          replyText: `💊 *Medicamento Registrado!*\n\nDose de *${pending.medication?.name || "Medicamento"}* para *${currentPet.name}* marcada como administrada!`,
          actionTaken: "medication_administered",
          currentState: "IDLE",
        });
      } else {
        return NextResponse.json({
          success: true,
          replyText: `💊 Nenhum medicamento pendente para administração no momento para *${currentPet.name}*.`,
          currentState: "IDLE",
        });
      }
    }

    // COMANDO 4 / Refeição
    if (lower === "4" || lower.includes("alimentei") || lower.includes("comida") || lower.includes("refeição")) {
      const inv = await convex.query(api.inventory.listByPet, { petId: currentPet._id });
      const racao = inv.find((i: any) => i.category === "racao") || inv[0];

      if (racao) {
        const dose = racao.dailyConsumption ? Math.round(racao.dailyConsumption / 2) : 200;
        await convex.mutation(api.inventory.recordConsumption, {
          inventoryItemId: racao._id,
          quantity: dose,
          userId: user._id,
          notes: "Refeição registrada via WhatsApp",
        });

        return NextResponse.json({
          success: true,
          replyText: `🥣 *Refeição registrada!*\n\nVocê registrou *${dose} ${racao.unit}* de *${racao.name}* para *${currentPet.name}*.\nEstoque atualizado automaticamente no PetRec!`,
          actionTaken: "consumption_recorded",
          currentState: "IDLE",
        });
      }
    }

    // COMANDO 5 / Vacinas
    if (lower === "5" || lower.includes("vacina")) {
      const health = await convex.query(api.health.getPetHealth, { petId: currentPet._id });
      let reply = `💉 *Vacinas de ${currentPet.name}:*\n\n`;
      if (!health?.vaccines || health.vaccines.length === 0) {
        reply += "Nenhuma vacina registrada até o momento.";
      } else {
        for (const v of health.vaccines) {
          reply += `• *${v.name}* — Aplicada em: ${v.applicationDate || "Data não registrada"}\n  Próximo reforço: ${v.nextDueDate || "Não informado"}\n`;
        }
      }
      return NextResponse.json({
        success: true,
        replyText: reply,
        currentState: "IDLE",
      });
    }

    // COMANDO 7 / Peso
    // Se o usuário digitou uma frase com peso direto (ex: "pesei 18.5kg" ou "peso 32.5 kg")
    const explicitWeightMatch = text.match(/(?:pesei|peso|pesar)\s+(\d+([.,]\d+)?)\s*(?:kg)?/i);
    if (explicitWeightMatch) {
      const val = parseFloat(explicitWeightMatch[1].replace(",", "."));
      if (!isNaN(val) && val > 0 && val < 200) {
        await convex.mutation(api.health.recordWeight, {
          petId: currentPet._id,
          userId: user._id,
          weight: val,
          notes: "Registrado via WhatsApp",
        });

        return NextResponse.json({
          success: true,
          replyText: `⚖️ *Pesagem registrada!*\n\n*${currentPet.name}* atualizado para *${val} kg* no prontuário!`,
          actionTaken: "weight_recorded",
          currentState: "IDLE",
        });
      }
    }

    // Se o usuário selecionou apenas "7" ou digitou "peso":
    if (lower === "7" || lower === "peso" || lower === "pesei") {
      // Coloca a sessão em estado WAITING_WEIGHT para aguardar o número digitado pelo usuário
      await convex.mutation(api.whatsapp.updateSession, {
        userId: user._id,
        currentPetId: currentPet._id,
        state: "WAITING_WEIGHT",
      });

      return NextResponse.json({
        success: true,
        replyText:
          `⚖️ *Controle de Peso — ${currentPet.name}*\n\n` +
          `• Peso atual no sistema: *${currentPet.weight ? `${currentPet.weight} kg` : "Não informado"}*\n\n` +
          `👉 *Qual o novo peso de ${currentPet.name}?*\n` +
          `Digite apenas o número (ex: *18.5* ou *32*) ou envie *cancelar*.`,
        currentState: "WAITING_WEIGHT",
      });
    }

    // Fallback amigável
    return NextResponse.json({
      success: true,
      senderPhone: cleanPhone,
      userFound: true,
      userName: user.name,
      replyText:
        `🐾 Mensagem recebida para *${currentPet.name}*!\n\n` +
        `Envie *0* para ver o menu de opções ou digite:\n` +
        `• *1* — Tarefas de Hoje\n` +
        `• *2* — Estoque de Ração\n` +
        `• *4* — Registrar Refeição\n` +
        `• *7* — Peso`,
      currentState: "IDLE",
    });
  } catch (error: any) {
    console.error("WhatsApp simulate error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
