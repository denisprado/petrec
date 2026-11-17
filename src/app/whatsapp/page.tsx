"use client";

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import {
  MessageCircle,
  Smartphone,
  Send,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Camera,
  Mic,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  time: string;
  mediaType?: "audio" | "image";
  mediaPreviewUrl?: string;
}

export default function WhatsAppPage() {
  const { currentUser, activePetId, pets, triggerRefresh, refreshTrigger } = useApp();

  const activePet = pets.find((p) => p.id === activePetId) || pets[0];
  const petNameExample = activePet?.name || "Bidu";

  // Estados de conexão
  const [connectedPhone, setConnectedPhone] = useState<string | null>(
    currentUser?.whatsappPhoneNumber || null
  );
  const [waLink, setWaLink] = useState<string>("https://wa.me/15551874911?text=Oi");
  const [phoneInput, setPhoneInput] = useState<string>(
    currentUser?.whatsappPhoneNumber || ""
  );
  const [savingPhone, setSavingPhone] = useState(false);

  // Estados do Chat Simulador
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-welcome",
      sender: "bot",
      text: "👋 Olá! Sou o assistente PetRec no WhatsApp.\nEnvie *0* ou *menu* para ver opções, ou converse naturalmente sobre seus pets (texto, áudio ou foto de receita/vacina)!",
      time: format(new Date(), "HH:mm"),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Carregar status do WhatsApp do usuário autenticado
  useEffect(() => {
    async function checkStatus() {
      if (!currentUser.id) return;
      try {
        const res = await fetch(
          `/api/whatsapp/pairing?userId=${encodeURIComponent(currentUser.id)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.connectedPhone) {
          setConnectedPhone(data.connectedPhone);
          setPhoneInput(data.connectedPhone);
        } else {
          setConnectedPhone(null);
        }
        if (data.waLink) {
          setWaLink(data.waLink);
        }
      } catch (err) {
        console.error(err);
      }
    }
    checkStatus();
  }, [currentUser.id, refreshTrigger]);

  // Scroll automático no chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Salvar ou atualizar número de WhatsApp
  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim() || !currentUser.id) return;
    setSavingPhone(true);
    try {
      const res = await fetch("/api/whatsapp/pairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          phone: phoneInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectedPhone(data.connectedPhone || phoneInput.trim());
        setPhoneInput(data.connectedPhone || phoneInput.trim());
        setToastMessage("✓ WhatsApp conectado à sua conta!");
        setTimeout(() => setToastMessage(null), 3500);
        triggerRefresh();
      } else {
        alert(data.error || "Não foi possível salvar o número.");
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setSavingPhone(false);
    }
  };

  // Desconectar WhatsApp
  const handleDisconnect = async () => {
    if (!confirm("Deseja realmente desconectar o WhatsApp desta conta?")) return;
    try {
      await fetch(`/api/whatsapp/pairing?userId=${encodeURIComponent(currentUser.id)}`, {
        method: "DELETE",
      });
      setConnectedPhone(null);
      setPhoneInput("");
      setToastMessage("WhatsApp desconectado.");
      setTimeout(() => setToastMessage(null), 3500);
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  // Enviar mensagem no simulador (texto e/ou mídia)
  const handleSendMessage = async (
    customText?: string,
    mediaOpts?: {
      mediaType: "audio" | "image";
      mediaBase64?: string;
      mediaMimeType?: string;
      mediaPreviewUrl?: string;
    }
  ) => {
    const textToSend = (customText ?? inputText).trim();
    if ((!textToSend && !mediaOpts?.mediaType) || isSending) return;

    const displayText =
      textToSend ||
      (mediaOpts?.mediaType === "audio" ? "🎙️ [Áudio enviado]" : "📸 [Imagem enviada]");

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: displayText,
      time: format(new Date(), "HH:mm"),
      mediaType: mediaOpts?.mediaType,
      mediaPreviewUrl: mediaOpts?.mediaPreviewUrl,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (customText === undefined) setInputText("");
    setIsSending(true);

    try {
      const res = await fetch("/api/whatsapp/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromPhone: connectedPhone || phoneInput || currentUser.whatsappPhoneNumber || "",
          messageText: textToSend,
          userId: currentUser.id,
          mediaType: mediaOpts?.mediaType,
          mediaBase64: mediaOpts?.mediaBase64,
          mediaMimeType: mediaOpts?.mediaMimeType,
        }),
      });

      const data = await res.json();

      let replyContent = data.replyText;
      if (!replyContent) {
        if (data.error) {
          replyContent = `⚠️ Não foi possível processar a mensagem: ${data.error}`;
        } else {
          replyContent = "Mensagem recebida.";
        }
      }

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: replyContent,
        time: format(new Date(), "HH:mm"),
      };

      setMessages((prev) => [...prev, botMsg]);
      if (data.actionTaken) {
        setToastMessage("✓ Informação atualizada no seu PetRec!");
        setTimeout(() => setToastMessage(null), 3500);
        triggerRefresh();
      }
    } catch (err: any) {
      console.error(err);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `⚠️ Erro de conexão: ${err.message || "Tente novamente."}`,
        time: format(new Date(), "HH:mm"),
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleMediaFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "image" | "audio"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
      const mimeType = file.type || (type === "image" ? "image/jpeg" : "audio/ogg");

      handleSendMessage(inputText.trim() || undefined, {
        mediaType: type,
        mediaBase64: base64 || undefined,
        mediaMimeType: mimeType,
        mediaPreviewUrl: type === "image" ? dataUrl : undefined,
      });

      if (inputText.trim()) setInputText("");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const naturalExamples =
    pets.length === 0
      ? [
          "Bidu, cão, 10kg",
          "Tenho uma gata chamada Luna 4kg",
          "Comprei 15kg de ração",
          "Bidu toma Sepurim 20mg e Retenic 5mg",
        ]
      : [
          `O ${petNameExample} deixou metade do pote hoje cedo`,
          "Não consegui dar o comprimido das 8h porque ele cuspiu",
          "Comprei um saco de 15kg de ração",
          "Pesei o balde e tem 4,2kg de ração",
          "Anota aí que ele teve diarreia hoje",
          "Quando a ração vai acabar?",
        ];

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
            <span>Assistente no WhatsApp</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Converse naturalmente pelo celular para registrar cuidados e consultar o estoque, ou teste aqui antes de usar.
          </p>
        </div>
        <div className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Assistente Ativo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Meu Número & Guia de Uso (5 colunas) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Card Meu WhatsApp Conectado */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                <span>Meu WhatsApp Conectado</span>
              </h2>
              <span className="text-xs text-slate-500">
                <strong>{currentUser.name.split(" ")[0]}</strong>
              </span>
            </div>

            {connectedPhone ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Número Ativo para Uso</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="text-[11px] text-rose-600 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Desconectar</span>
                  </button>
                </div>
                <div className="text-sm font-black text-emerald-950 font-mono">
                  {connectedPhone}
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Tudo o que você enviar desse número no WhatsApp será registrado diretamente na conta de{" "}
                  <strong>{currentUser.name}</strong>.
                </p>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition shadow-xs flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Abrir PetRec no Meu WhatsApp</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Nenhum número conectado ainda</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Informe seu celular com DDD abaixo para falar com o PetRec direto do seu WhatsApp.
                </p>
              </div>
            )}

            <form onSubmit={handleSavePhone} className="space-y-2.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 block">
                {connectedPhone ? "Atualizar meu número de WhatsApp:" : "Seu número de WhatsApp (com DDD):"}
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  required
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  placeholder="19999999999"
                />
                <button
                  type="submit"
                  disabled={savingPhone || !phoneInput.trim()}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {savingPhone ? "Salvando..." : connectedPhone ? "Atualizar" : "Conectar"}
                </button>
              </div>
            </form>
          </div>

          {/* Card Guia Rápido & Exemplos para Testar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>O que você pode enviar no WhatsApp</span>
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Fale com suas próprias palavras, mande um áudio de voz ou envie a foto de uma receita veterinária ou carteira de vacinação. Clique em qualquer exemplo abaixo para testar ao lado:
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Frases Naturais do Dia a Dia:
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {naturalExamples.map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => handleSendMessage(phrase)}
                    className="px-2.5 py-1.5 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 rounded-lg text-[11px] font-medium transition border border-emerald-200 text-left cursor-pointer"
                  >
                    &ldquo;{phrase}&rdquo;
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                Áudio e Fotos de Receitas / Vacinas:
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      `Hoje o ${petNameExample} deixou metade do pote e comprei 10kg de ração`,
                      { mediaType: "audio" }
                    )
                  }
                  className="px-2.5 py-1.5 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 rounded-lg text-[11px] font-medium transition border border-indigo-200 text-left cursor-pointer"
                >
                  🎙️ Áudio: &ldquo;Deixou metade do pote e comprei 10kg&rdquo;
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      "Receitou Apoquel 5,4mg de 12 em 12h (08:00 e 20:00), comprei 20 comprimidos",
                      { mediaType: "image" }
                    )
                  }
                  className="px-2.5 py-1.5 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 rounded-lg text-[11px] font-medium transition border border-indigo-200 text-left cursor-pointer"
                >
                  📸 Foto de Receita: Apoquel 12/12h
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      "Tomou vacina V10 hoje, lote BIO992, reforço em 1 ano",
                      { mediaType: "image" }
                    )
                  }
                  className="px-2.5 py-1.5 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 rounded-lg text-[11px] font-medium transition border border-indigo-200 text-left cursor-pointer"
                >
                  📸 Foto de Vacina: V10 lote BIO992
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Atalhos Numéricos do Menu:
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "0 - Menu", cmd: "0" },
                  { label: "1 - Hoje", cmd: "1" },
                  { label: "2 - Estoque", cmd: "2" },
                  { label: "3 - Remédio", cmd: "3" },
                  { label: "4 - Refeição", cmd: "4" },
                  { label: "5 - Vacinas", cmd: "5" },
                  { label: "6 - Compras", cmd: "6" },
                  { label: "7 - Peso", cmd: "7" },
                  { label: "8 - Prontuário", cmd: "8" },
                  { label: "9 - Trocar Pet", cmd: "9" },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => handleSendMessage(btn.cmd)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 rounded-lg text-xs font-medium transition border border-slate-200 cursor-pointer"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Simulador Interativo Estilo WhatsApp (7 colunas) */}
        <div className="lg:col-span-7 bg-[#efeae2] border border-slate-300 rounded-3xl shadow-lg flex flex-col h-[640px] overflow-hidden relative">
          {/* Header do Chat */}
          <div className="bg-[#075e54] text-white px-4 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-700 border-2 border-emerald-400 flex items-center justify-center font-bold text-white text-base">
                🐾
              </div>
              <div>
                <div className="font-bold text-sm leading-tight">PetRec Assistente</div>
                <div className="text-[11px] text-emerald-200">
                  online • conta de {currentUser.name.split(" ")[0]}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: "msg-welcome",
                    sender: "bot",
                    text: "👋 Olá! Sou o assistente PetRec no WhatsApp.\nEnvie *0* para ver o menu ou converse naturalmente sobre seus pets.",
                    time: format(new Date(), "HH:mm"),
                  },
                ])
              }
              className="p-1.5 hover:bg-emerald-800 rounded-lg text-emerald-200 hover:text-white transition cursor-pointer"
              title="Limpar conversa"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            <div className="text-center my-1">
              <span className="bg-white/80 backdrop-blur-xs text-slate-500 text-[10px] px-2.5 py-1 rounded-full shadow-2xs font-medium">
                Área de Testes Interativa • Sincronizada com seu Painel PetRec
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
                    {msg.mediaPreviewUrl && msg.mediaType === "image" && (
                      <img
                        src={msg.mediaPreviewUrl}
                        alt="Mídia enviada"
                        className="mb-1.5 rounded-lg max-h-40 w-auto object-cover border border-black/10"
                      />
                    )}
                    {msg.mediaType === "audio" && (
                      <div className="mb-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-900/10 text-[10px] font-semibold text-emerald-900">
                        <Mic className="w-3 h-3" />
                        <span>Mensagem de Voz</span>
                      </div>
                    )}
                    {msg.mediaType === "image" && !msg.mediaPreviewUrl && (
                      <div className="mb-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-900/10 text-[10px] font-semibold text-indigo-900">
                        <Camera className="w-3 h-3" />
                        <span>Foto / Documento</span>
                      </div>
                    )}
                    <p>{msg.text}</p>
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                      <span>{msg.time}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Barra de Digitação + Upload de Foto/Áudio */}
          <div className="bg-[#f0f2f5] p-3 border-t border-slate-200 flex items-center gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleMediaFileSelect(e, "image")}
            />
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => handleMediaFileSelect(e, "audio")}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isSending}
              className="w-9 h-9 rounded-full bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center transition shrink-0 cursor-pointer disabled:opacity-50"
              title="Enviar foto de receita, carteira de vacinação ou ração"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              disabled={isSending}
              className="w-9 h-9 rounded-full bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center transition shrink-0 cursor-pointer disabled:opacity-50"
              title="Enviar arquivo de áudio"
            >
              <Mic className="w-4 h-4" />
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Digite sua mensagem ou anexe uma foto/áudio..."
              className="flex-1 px-4 py-2.5 bg-white text-xs border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#075e54] shadow-2xs text-slate-900"
            />
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={isSending || !inputText.trim()}
              className="w-10 h-10 rounded-full bg-[#075e54] hover:bg-[#128c7e] text-white flex items-center justify-center transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
