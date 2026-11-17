"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import {
  PawPrint,
  UserPlus,
  LogIn,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ArrowRight,
  MessageCircle,
  Sparkles,
  ShieldCheck,
  Loader2,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  co_owner: "Coproprietário",
  caregiver: "Cuidador Familiar",
  viewer: "Visualizador",
  vet_limited: "Médico Veterinário",
  clinic_admin: "Clínica / Recepção",
  caregiver_pro: "Pet Sitter / Adestrador",
};

export default function ConvitePage() {
  const params = useParams();
  const router = useRouter();
  const rawCode = Array.isArray(params?.code) ? params.code[0] : (params?.code as string) || "";
  const code = decodeURIComponent(rawCode).trim();
  const isAccountInvite = code.toLowerCase() === "conta";

  const {
    currentUser,
    isAuthenticated,
    isAuthLoading,
    pets,
    openAuthModal,
    setActivePetId,
    setShowLandingPage,
    triggerRefresh,
  } = useApp();

  const [inviterFromQuery, setInviterFromQuery] = useState<string>("");
  const [lookupLoading, setLookupLoading] = useState<boolean>(!isAccountInvite);
  const [lookup, setLookup] = useState<any>(null);
  const [manualCode, setManualCode] = useState<string>("");
  const [joining, setJoining] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const startedUnauthRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search);
      const de = search.get("de") || "";
      if (de) setInviterFromQuery(de);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && startedUnauthRef.current === null) {
      startedUnauthRef.current = !isAuthenticated;
    }
  }, [isAuthLoading, isAuthenticated]);

  useEffect(() => {
    if (isAccountInvite || !code) {
      setLookupLoading(false);
      return;
    }

    let cancelled = false;
    async function loadCodeInfo() {
      setLookupLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/tutores?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (!cancelled) {
          setLookup(data);
        }
      } catch {
        if (!cancelled) {
          setErrorMsg("Não foi possível validar o código agora.");
        }
      } finally {
        if (!cancelled) {
          setLookupLoading(false);
        }
      }
    }
    loadCodeInfo();
    return () => {
      cancelled = true;
    };
  }, [code, isAccountInvite]);

  // Se entrou deslogado na página de convite de pet e acabou de se cadastrar/logar no AuthModal,
  // vincula se necessário e redireciona para o painel do pet.
  useEffect(() => {
    if (
      startedUnauthRef.current === true &&
      isAuthenticated &&
      currentUser?.id &&
      !isAccountInvite &&
      lookup?.found &&
      lookup?.pet?.id
    ) {
      const alreadyLinked = pets.some((p) => p.id === lookup.pet.id);
      if (alreadyLinked) {
        setActivePetId(lookup.pet.id);
        setShowLandingPage(false);
        router.push("/");
      }
    }
  }, [
    isAuthenticated,
    currentUser?.id,
    pets,
    isAccountInvite,
    lookup,
    router,
    setActivePetId,
    setShowLandingPage,
  ]);

  const handleJoinPet = async () => {
    if (!currentUser?.id || !code) return;
    setJoining(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/tutores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join_by_code",
          userId: currentUser.id,
          code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Erro ao se vincular ao pet.");
        return;
      }
      if (data.pet?.id) {
        setActivePetId(data.pet.id);
      }
      setShowLandingPage(false);
      triggerRefresh();
      setSuccessMsg(`Você foi vinculado(a) a ${data.pet?.name || "seu novo pet"}!`);
      setTimeout(() => {
        router.push("/");
      }, 700);
    } catch {
      setErrorMsg("Falha de conexão ao aceitar o convite.");
    } finally {
      setJoining(false);
    }
  };

  if (isAccountInvite) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-inner">
            <PawPrint className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Convite para o PetRec</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {inviterFromQuery
                ? `${inviterFromQuery} convidou você para o PetRec!`
                : "Você recebeu um convite para usar o PetRec!"}
            </h1>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              Crie sua conta gratuita para acompanhar ração, medicamentos, vacinas, histórico clínico e conversar com o assistente inteligente direto pelo WhatsApp.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <div className="font-bold text-slate-900">WhatsApp Integrado</div>
              <p className="text-slate-500 text-[11px]">
                Registre compras, doses e observações por texto, áudio ou foto assim que criar a conta.
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <div className="font-bold text-slate-900">Cuidado Colaborativo</div>
              <p className="text-slate-500 text-[11px]">
                Compartilhe seus pets com familiares ou veterinários usando um código rápido.
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <div className="font-bold text-slate-900">Vínculo por Código</div>
              <p className="text-slate-500 text-[11px]">
                Se já recebeu o código de um pet, informe no cadastro para entrar conectado.
              </p>
            </div>
          </div>

          {isAuthenticated ? (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-slate-500">
                Você já está conectado como <strong>{currentUser.name}</strong>.
              </p>
              <Link
                href="/"
                onClick={() => setShowLandingPage(false)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-2xl shadow-md transition"
              >
                <span>Ir para o Meu Painel</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => openAuthModal("register")}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-2xl shadow-md transition flex items-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Criar Minha Conta Grátis</span>
              </button>
              <button
                type="button"
                onClick={() => openAuthModal("login")}
                className="px-5 py-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-sm font-bold rounded-2xl transition flex items-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Já tenho conta</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-16">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5">
        {lookupLoading ? (
          <div className="py-10 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
            <p className="text-sm font-medium text-slate-500">
              Validando código de convite <span className="font-mono font-bold">{code}</span>...
            </p>
          </div>
        ) : !lookup?.found ? (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-black text-slate-900">
                Convite ou código não encontrado
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                O código <span className="font-mono font-bold text-slate-700">{code}</span> não corresponde a um convite ativo ou pet cadastrado.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!manualCode.trim()) return;
                router.push(`/convite/${encodeURIComponent(manualCode.trim())}`);
              }}
              className="flex gap-2 pt-2"
            >
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Tentar outro código (PET-... ou CONV-...)"
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Buscar
              </button>
            </form>

            <div className="pt-2">
              <Link href="/" className="text-xs font-bold text-emerald-700 hover:underline">
                Voltar à página inicial
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Código: {lookup.code}</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Convite para cuidar de {lookup.pet.name}
              </h1>
              <p className="text-xs text-slate-500">
                {lookup.kind === "invitation"
                  ? `${lookup.inviterName} compartilhou este pet com você.`
                  : "Use este vínculo rápido para acompanhar a rotina e saúde deste pet."}
              </p>
            </div>

            {/* Card do Pet */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-4">
              {lookup.pet.photo ? (
                <img
                  src={lookup.pet.photo}
                  alt={lookup.pet.name}
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-500/30 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <PawPrint className="w-8 h-8" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-base font-black text-slate-900 truncate">
                  {lookup.pet.name}
                </div>
                <div className="text-xs text-slate-500">
                  {lookup.pet.species}
                  {lookup.pet.breed ? ` • ${lookup.pet.breed}` : ""}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                    Papel: {ROLE_LABELS[lookup.role] || lookup.role}
                  </span>
                  <span className="text-[11px] font-mono bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                    {lookup.pet.shareCode}
                  </span>
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {isAuthenticated ? (
              pets.some((p) => p.id === lookup.pet.id) ? (
                <div className="space-y-3 text-center">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                    Você já está vinculado(a) a {lookup.pet.name}!
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePetId(lookup.pet.id);
                      setShowLandingPage(false);
                      router.push("/");
                    }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Abrir Painel de {lookup.pet.name}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={joining}
                  onClick={handleJoinPet}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {joining
                      ? "Vinculando..."
                      : `Aceitar e Vincular a ${lookup.pet.name} Agora`}
                  </span>
                </button>
              )
            ) : (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => openAuthModal("register", code)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Criar Conta e Vincular a {lookup.pet.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal("login", code)}
                  className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Já tenho conta (Entrar e Vincular)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
