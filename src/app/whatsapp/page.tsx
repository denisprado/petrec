"use client";

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import {
  MessageCircle,
  Smartphone,
  Send,
  Check,
  CheckCheck,
  ShieldCheck,
  RefreshCw,
  Zap,
  Info,
  ExternalLink,
  Bot,
  QrCode,
  AlertCircle,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  time: string;
}

export default function WhatsAppPage() {
  const { currentUser, activePetId, pets, triggerRefresh, refreshTrigger } = useApp();

  // Estados de conexão
  const [loadingPairing, setLoadingPairing] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [waLink, setWaLink] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState<string>("+55 19 98888-7777");

  // Estados do Chat Simulador
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-welcome",
      sender: "bot",
      text: "👋 Olá! Sou o assistente PetRec no WhatsApp.\nEnvie *0* ou *menu* para ver opções, ou digite:\n1️⃣ Hoje | 2️⃣ Estoque | 3️⃣ Remédio | 4️⃣ Alimentei | 5️⃣ Vacinas | 6️⃣ Comprei | 7️⃣ Peso | 8️⃣ Prontuário | 9️⃣ Trocar Pet",
      time: "10:00",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [currentState, setCurrentState] = useState("IDLE");
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carregar status do WhatsApp do usuário logado
  useEffect(() => {
    async function checkStatus() {
      if (!currentUser.id) return;
      try {
        const res = await fetch(`/api/whatsapp/pairing?userId=${currentUser.id}`);
        const data = await res.json();
        if (data.connectedPhone) {
          setConnectedPhone(data.connectedPhone);
        } else {
          setConnectedPhone(null);
        }
        setPairingToken(data.token);
        setWaLink(data.waLink);
      } catch (err) {
        console.error(err);
      }
    }
    checkStatus();
  }, [currentUser.id, refreshTrigger]);

  const handleRegenerateToken = async () => {
    setLoadingPairing(true);
    try {
      const res = await fetch("/api/whatsapp/pairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const data = await res.json();
      setPairingToken(data.token);
      setWaLink(data.waLink);
      setToastMessage("Novo código de conexão gerado!");
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPairing(false);
    }
  };

  // Scroll automático no chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Enviar mensagem no simulador
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: textToSend,
      time: format(new Date(), "HH:mm"),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText("");
    setIsSending(true);

    try {
      const res = await fetch("/api/whatsapp/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromPhone: connectedPhone || phoneInput,
          messageText: textToSend,
          userId: currentUser.id,
        }),
      });

      const data = await res.json();

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: data.replyText || "Mensagem processada.",
        time: format(new Date(), "HH:mm"),
      };

      setMessages((prev) => [...prev, botMsg]);
      setCurrentState(data.currentState || "IDLE");
      if (data.actionTaken) {
        setLastAction(data.actionTaken);
        setToastMessage(`✓ Ação sincronizada: ${data.actionTaken}`);
        setTimeout(() => setToastMessage(null), 4000);
        triggerRefresh(); // Atualiza dashboard e estoque em tempo real!
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  // Vínculo rápido de demonstração com 1 clique
  const handleQuickConnect = async () => {
    if (!pairingToken) return;
    setIsSending(true);
    try {
      // Simula o envio da mensagem com o token de conexão
      await handleSendMessage(pairingToken);
      setConnectedPhone(phoneInput);
      setToastMessage("✓ WhatsApp conectado com sucesso!");
      setTimeout(() => setToastMessage(null), 3500);
      triggerRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  // Desconectar WhatsApp
  const handleDisconnect = async () => {
    if (!confirm("Deseja realmente desconectar o WhatsApp desta conta?")) return;
    try {
      await fetch(`/api/whatsapp/pairing?userId=${currentUser.id}`, {
        method: "DELETE",
      });
      setConnectedPhone(null);
      setToastMessage("WhatsApp desconectado.");
      setTimeout(() => setToastMessage(null), 3500);
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-emerald-600" />
            <span>Chatbot no WhatsApp & Simulador</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Interaja com o PetRec em linguagem natural, registre cuidados e consulte o estoque sem abrir o app.
          </p>
        </div>
        <div className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Bot Engine Ativo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Conexão e Informações (5 colunas) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Card de Pareamento e Status do Tutor */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                <span>Vínculo do WhatsApp</span>
              </h2>
              <span className="text-xs text-slate-500">
                Tutor: <strong>{currentUser.name.split(" ")[0]}</strong>
              </span>
            </div>

            {connectedPhone ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Conectado e Verificado</span>
                  </span>
                  <button
                    onClick={handleDisconnect}
                    className="text-[11px] text-red-600 hover:underline flex items-center gap-1 font-bold"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Desconectar</span>
                  </button>
                </div>
                <div className="text-sm font-black text-emerald-950 font-mono">
                  {connectedPhone}
                </div>
                <p className="text-[11px] text-emerald-800">
                  Todas as mensagens deste número atualizarão o banco de dados como ações realizadas por{" "}
                  <strong>{currentUser.name}</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Nenhum número conectado para {currentUser.name}</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Vincule seu número para testar as ações rápidas pelo WhatsApp.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Número do WhatsApp para teste:
                  </label>
                  <input
                    type="text"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                    placeholder="+55 19 98888-7777"
                  />
                </div>

                {pairingToken && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Código de Conexão:</span>
                      <div className="flex items-center gap-1.5">
                        <code className="bg-slate-200 px-2 py-0.5 rounded font-black text-slate-800">
                          {pairingToken}
                        </code>
                        <button
                          type="button"
                          onClick={handleRegenerateToken}
                          disabled={loadingPairing}
                          className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition"
                          title="Gerar novo código"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingPairing ? "animate-spin" : ""}`} />
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleQuickConnect}
                      disabled={isSending}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Zap className="w-4 h-4" />
                      <span>{isSending ? "Conectando..." : "Conectar com 1 Clique (Simulação)"}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Estado Interno da Máquina de Estados (Contexto do Bot) */}
          <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" />
                <span>Estado da Conversa (State Machine)</span>
              </span>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono text-[10px] rounded-full">
                {currentState}
              </span>
            </div>

            <div className="space-y-1 text-slate-400 text-[11px]">
              <div>• Pet em Foco: <strong className="text-white">{pets[0]?.name || "Rex"}</strong></div>
              <div>• Tutor Remetente: <strong className="text-white">{currentUser.name}</strong></div>
              <div>• Permissão RBAC: <strong className="text-white">Validada automaticamente</strong></div>
              {lastAction && (
                <div>• Última Ação Executada: <strong className="text-emerald-400">{lastAction}</strong></div>
              )}
            </div>
          </div>

          {/* Atalhos Rápidos para Testar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Comandos Rápidos para Testar:
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "0 - Menu", cmd: "0" },
                { label: "1 - Hoje", cmd: "1" },
                { label: "2 - Estoque", cmd: "2" },
                { label: "3 - Remédio", cmd: "3" },
                { label: "4 - Alimentei", cmd: "4" },
                { label: "5 - Vacinas", cmd: "5" },
                { label: "6 - Comprei", cmd: "6" },
                { label: "7 - Peso", cmd: "7" },
                { label: "8 - Prontuário", cmd: "8" },
                { label: "9 - Trocar Pet", cmd: "9" },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => handleSendMessage(btn.cmd)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 rounded-lg text-xs font-medium transition border border-slate-200 cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Simulador Visual Estilo WhatsApp (7 colunas) */}
        <div className="lg:col-span-7 bg-[#efeae2] border border-slate-300 rounded-3xl shadow-lg flex flex-col h-[650px] overflow-hidden relative">
          {/* Header do WhatsApp */}
          <div className="bg-[#075e54] text-white px-4 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-700 border-2 border-emerald-400 flex items-center justify-center font-bold text-white text-base">
                🐾
              </div>
              <div>
                <div className="font-bold text-sm leading-tight">PetRec Assistente</div>
                <div className="text-[11px] text-emerald-200">
                  online • respondendo como {currentUser.name.split(" ")[0]}
                </div>
              </div>
            </div>

            <button
              onClick={() =>
                setMessages([
                  {
                    id: "msg-welcome",
                    sender: "bot",
                    text: "👋 Olá! Sou o assistente PetRec no WhatsApp.\nEnvie *menu* para ver opções ou faça uma pergunta sobre seus pets.",
                    time: format(new Date(), "HH:mm"),
                  },
                ])
              }
              className="p-1.5 hover:bg-emerald-800 rounded-lg text-emerald-200 hover:text-white transition"
              title="Limpar histórico da conversa"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Área de Mensagens (Fundo clássico do WhatsApp) */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            <div className="text-center my-1">
              <span className="bg-white/80 backdrop-blur-xs text-slate-500 text-[10px] px-2.5 py-1 rounded-full shadow-2xs font-medium">
                Criptografia de ponta a ponta simulada • PetRec Bot
              </span>
            </div>

            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-xs relative leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? "bg-[#dcf8c6] text-slate-900 rounded-tr-none"
                        : "bg-white text-slate-900 rounded-tl-none border border-slate-200/50"
                    }`}
                  >
                    <p>{msg.text}</p>
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                      <span>{msg.time}</span>
                      {isUser && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Barra de Digitação */}
          <div className="bg-[#f0f2f5] p-3 border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Digite uma mensagem (ex: 'dei o remédio', 'estoque')..."
              className="flex-1 px-4 py-2.5 bg-white text-xs border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#075e54] shadow-2xs text-slate-900"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isSending || !inputText.trim()}
              className="w-10 h-10 rounded-full bg-[#075e54] hover:bg-[#128c7e] text-white flex items-center justify-center transition shadow-xs disabled:opacity-50"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
