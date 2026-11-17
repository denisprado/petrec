"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import {
  PawPrint,
  MessageCircle,
  Sparkles,
  Boxes,
  Pill,
  HeartPulse,
  ShoppingCart,
  Users,
  ShieldCheck,
  Mic,
  Camera,
  ArrowRight,
  UserPlus,
  LogIn,
  CheckCircle2,
  Clock,
  LayoutDashboard,
} from "lucide-react";

const FEATURES = [
  {
    icon: MessageCircle,
    badge: "Texto, Áudio e Foto",
    color: "bg-emerald-100 text-emerald-700",
    title: "Assistente no WhatsApp com IA",
    description:
      "Converse naturalmente pelo WhatsApp ou envie áudios e fotos de receitas e carteiras de vacina. O assistente identifica o pet, registra medicações, compras, pesagens e sintomas na hora.",
  },
  {
    icon: Sparkles,
    badge: "Zero Atrito Diário",
    color: "bg-indigo-100 text-indigo-700",
    title: "Modo por Exceção Automático",
    description:
      "Não precisa marcar todo dia que deu a ração ou o comprimido. O PetRec considera a rotina regular em dia e você só avisa quando houver exceção (jejum, sobra ou dose pulada).",
  },
  {
    icon: Boxes,
    badge: "Previsão Real",
    color: "bg-amber-100 text-amber-700",
    title: "Estoque Inteligente & Alertas",
    description:
      "Acompanhe o saldo real de ração e remédios com base no consumo diário e no prazo de entrega. Saiba exatamente até que dia o saco vai durar antes de acabar.",
  },
  {
    icon: HeartPulse,
    badge: "Saúde Completa",
    color: "bg-rose-100 text-rose-700",
    title: "Prontuário, Vacinas e Peso",
    description:
      "Centralize histórico de pesagens, agendamentos veterinários, datas de reforço vacinal e diário clínico compartilhado para levar tudo pronto às consultas.",
  },
  {
    icon: ShoppingCart,
    badge: "Reposição Ágil",
    color: "bg-sky-100 text-sky-700",
    title: "Lista de Compras & Histórico",
    description:
      "Itens em estado crítico entram no radar de compras. Ao registrar uma reposição pelo app ou WhatsApp, o saldo e a data prevista de término se recalculam na hora.",
  },
  {
    icon: Users,
    badge: "Multitutores & Vets",
    color: "bg-purple-100 text-purple-700",
    title: "Acesso Colaborativo (RBAC)",
    description:
      "Convide familiares, cuidadores, pet sitters e médicos veterinários para acompanhar o mesmo pet com permissões sob medida e privacidade financeira.",
  },
];

export function LandingPage() {
  const { openAuthModal, isAuthenticated, setShowLandingPage, currentUser } =
    useApp();

  return (
    <div className="bg-slate-50 text-slate-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white">
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-400 via-transparent to-transparent" />

        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16 lg:py-20 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Coluna Esquerda: Proposta de Valor + CTAs */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
              <PawPrint className="w-3.5 h-3.5" />
              <span>Assistente Inteligente de Cuidados e Estoque do Pet</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.12]">
              Controle ração, remédios e saúde do seu pet{" "}
              <span className="text-emerald-400">conversando pelo WhatsApp.</span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
              O <strong>PetRec</strong> calcula automaticamente quando a ração ou os
              medicamentos vão acabar, controla doses por exceção, guarda o prontuário e
              conecta toda a família, cuidadores e veterinários em um único painel.
            </p>

            {/* CTAs */}
            {isAuthenticated ? (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowLandingPage(false)}
                  className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/25 transition flex items-center gap-2"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Abrir Painel de {currentUser.name.split(" ")[0]}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => openAuthModal("register")}
                  className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/25 transition flex items-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Criar Minha Conta Grátis</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal("login")}
                  className="px-5 py-3.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-sm rounded-2xl transition flex items-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Já tenho conta — Entrar</span>
                </button>
              </div>
            )}

            {/* Destaques rápidos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Cadastro rápido em 30s</span>
              </div>
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Entende áudios e fotos</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Multi-pet e multi-tutor</span>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Mockup Visual Realista do Fluxo WhatsApp + Estoque */}
          <div className="lg:col-span-5">
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3.5 backdrop-blur-xs">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      Assistente PetRec no WhatsApp
                    </div>
                    <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>IA conectada ao estoque e rotina</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-900/70 px-2.5 py-1 rounded-full">
                  <Camera className="w-3 h-3 text-emerald-400" />
                  <Mic className="w-3 h-3 text-emerald-400" />
                </div>
              </div>

              {/* Balões de exemplo */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-end">
                  <div className="bg-emerald-600 text-white px-3.5 py-2 rounded-2xl rounded-tr-xs max-w-[85%] shadow-xs">
                    “Gengibre toma Sepurim 20mg e Retenic 5mg”
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-slate-900 border border-slate-700 text-slate-100 px-3.5 py-2.5 rounded-2xl rounded-tl-xs max-w-[92%] space-y-1">
                    <div className="font-bold text-emerald-400 flex items-center gap-1">
                      <Pill className="w-3.5 h-3.5" />
                      <span>Medicamentos & Rotina Cadastrados!</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">
                      Sepurim (20mg) e Retenic (5mg) ativados na agenda diária com
                      controle automático de estoque.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="bg-emerald-600 text-white px-3.5 py-2 rounded-2xl rounded-tr-xs max-w-[85%] shadow-xs">
                    “Deixou metade do pote hoje cedo”
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-slate-900 border border-slate-700 text-slate-100 px-3.5 py-2.5 rounded-2xl rounded-tl-xs max-w-[92%] space-y-1">
                    <div className="font-bold text-amber-300 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Exceção de Refeição Registrada!</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">
                      Quantidade não consumida preservada no saldo e previsão de compra
                      recalculada automaticamente.
                    </p>
                  </div>
                </div>
              </div>

              {/* Mini indicador de previsão */}
              <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Previsão Automática
                  </div>
                  <div className="text-xs font-bold text-white">
                    Ração dura mais 32 dias
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                  Estoque OK
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seção de Funcionalidades */}
      <section id="funcionalidades" className="max-w-6xl mx-auto px-4 py-12 sm:py-16 space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
            Funcionalidades do PetRec
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Tudo o que você precisa para nunca mais perder um horário ou ficar sem ração
          </h2>
          <p className="text-sm text-slate-600">
            Projetado para a rotina real de tutores ocupados, famílias compartilhadas e
            acompanhamento veterinário contínuo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-md hover:border-emerald-200 transition space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${feat.color}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    {feat.badge}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {feat.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {feat.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Seção Como Funciona em 3 Passos */}
      <section id="como-funciona" className="bg-white border-y border-slate-200 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 space-y-8">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Comece em menos de 2 minutos
            </h2>
            <p className="text-sm text-slate-600">
              Sem planilhas complicadas. Configure uma vez e atualize falando como no dia a dia.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center">
                1
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                Crie sua conta gratuita
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Cadastre seu nome, e-mail, senha e opcionalmente seu número de WhatsApp
                para já conversar com o assistente inteligente.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center">
                2
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                Adicione seus pets e equipe
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Cadastre cada pet, defina o consumo diário ou receitas e convide familiares,
                cuidadores ou veterinários com perfis de permissão.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center">
                3
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                Use no painel web ou WhatsApp
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Avise compras, pesagens, exceções de alimentação e medicações em texto,
                áudio ou foto — tudo fica sincronizado em tempo real.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Banner CTA Final */}
      <section className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-3xl p-6 sm:p-10 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Pronto para organizar os cuidados e o estoque dos seus pets?
            </h2>
            <p className="text-xs sm:text-sm text-emerald-50 leading-relaxed">
              Crie sua conta agora mesmo e comece a usar o painel colaborativo e o
              assistente inteligente no WhatsApp.
            </p>
          </div>

          {!isAuthenticated ? (
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => openAuthModal("register")}
                className="px-5 py-3 bg-white text-emerald-800 hover:bg-emerald-50 font-black text-xs sm:text-sm rounded-2xl shadow-md transition flex items-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Cadastrar Agora</span>
              </button>
              <button
                type="button"
                onClick={() => openAuthModal("login")}
                className="px-4 py-3 bg-emerald-700/60 hover:bg-emerald-700 text-white border border-white/25 font-bold text-xs sm:text-sm rounded-2xl transition cursor-pointer"
              >
                Entrar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLandingPage(false)}
              className="px-5 py-3 bg-white text-emerald-800 hover:bg-emerald-50 font-black text-xs sm:text-sm rounded-2xl shadow-md transition flex items-center gap-2 cursor-pointer shrink-0"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Voltar ao Meu Painel</span>
            </button>
          )}
        </div>
      </section>

      {/* Rodapé */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2 font-bold text-slate-700">
            <PawPrint className="w-4 h-4 text-emerald-600" />
            <span>PetRec — Cuidado Inteligente e Colaborativo</span>
          </div>
          <span>Controle de rotina, estoque preditivo, saúde e WhatsApp IA.</span>
        </div>
      </footer>
    </div>
  );
}
