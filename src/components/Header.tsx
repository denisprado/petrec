"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  PawPrint,
  ChevronDown,
  LogIn,
  UserPlus,
  UserCog,
  LogOut,
  ShieldCheck,
  Sparkles,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { PetModal } from "@/components/PetModal";

export function Header() {
  const {
    currentUser,
    activePetId,
    setActivePetId,
    pets,
    userRole,
    triggerRefresh,
    isAuthenticated,
    isAuthLoading,
    showLandingPage,
    setShowLandingPage,
    openAuthModal,
    logout,
  } = useApp();

  const [petMenuOpen, setPetMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showNewPetModal, setShowNewPetModal] = useState(false);

  const activePet = pets.find((p) => p.id === activePetId) || pets[0];

  const roleLabels: Record<string, { label: string; color: string }> = {
    owner: { label: "Proprietário", color: "bg-purple-100 text-purple-800 border-purple-200" },
    co_owner: { label: "Coproprietária", color: "bg-blue-100 text-blue-800 border-blue-200" },
    caregiver: { label: "Cuidador", color: "bg-amber-100 text-amber-800 border-amber-200" },
    viewer: { label: "Visitante", color: "bg-slate-100 text-slate-800 border-slate-200" },
    vet_limited: { label: "Veterinária (CRMV)", color: "bg-indigo-100 text-indigo-900 border-indigo-300" },
    clinic_admin: { label: "Clínica / Recepção", color: "bg-teal-100 text-teal-900 border-teal-300" },
    caregiver_pro: { label: "Pet Sitter / Cuidador", color: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  };

  const currentRoleInfo = roleLabels[userRole] || roleLabels.viewer;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 py-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Logo & Pet Selector (apenas autenticado) */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              onClick={() => {
                if (isAuthenticated) {
                  setShowLandingPage(false);
                }
              }}
              className="flex items-center gap-2 font-black text-slate-900 tracking-tight hover:opacity-90 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <PawPrint className="w-5 h-5 fill-current" />
              </div>
              <span className="text-xl">
                Pet<span className="text-emerald-600">Rec</span>
              </span>
            </Link>

            {isAuthenticated && (
              <div className="relative">
                <button
                  onClick={() => {
                    setPetMenuOpen(!petMenuOpen);
                    setUserMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition text-left text-xs sm:text-sm font-semibold text-slate-800 border border-slate-200"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        activePet?.statusColor === "red"
                          ? "bg-red-500 animate-pulse"
                          : activePet?.statusColor === "yellow"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                    />
                    <span className="font-bold text-slate-900">
                      {activePet ? activePet.name : "Cadastrar pet"}
                    </span>
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {petMenuOpen && (
                  <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                      Meus Pets Cadastrados
                    </div>
                    {pets.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">
                        Nenhum pet cadastrado ainda.
                      </div>
                    ) : (
                      pets.map((pet) => (
                        <button
                          key={pet.id}
                          onClick={() => {
                            setActivePetId(pet.id);
                            setPetMenuOpen(false);
                            setShowLandingPage(false);
                            triggerRefresh();
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition text-left ${
                            pet.id === activePet?.id ? "bg-emerald-50/60 font-semibold" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                pet.statusColor === "red"
                                  ? "bg-red-500"
                                  : pet.statusColor === "yellow"
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                            />
                            <div>
                              <div className="font-bold text-slate-800">{pet.name}</div>
                              <div className="text-[10px] text-slate-400">{pet.species}</div>
                            </div>
                          </div>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {pet.statusText}
                          </span>
                        </button>
                      ))
                    )}
                    <div className="border-t border-slate-100 mt-1 pt-1 px-3 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPetMenuOpen(false);
                          setShowNewPetModal(true);
                        }}
                        className="w-full text-left text-[11px] text-emerald-600 font-semibold hover:underline flex items-center gap-1 py-1"
                      >
                        + Cadastrar novo pet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Direita: Visitante (CTAs) ou Usuário Autenticado */}
          {!isAuthLoading && !isAuthenticated ? (
            <div className="flex items-center gap-2 sm:gap-4">
              <nav className="hidden md:flex items-center gap-5 text-xs font-bold text-slate-600">
                <a href="#funcionalidades" className="hover:text-emerald-700 transition">
                  Funcionalidades
                </a>
                <a href="#como-funciona" className="hover:text-emerald-700 transition">
                  Como Funciona
                </a>
              </nav>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAuthModal("login")}
                  className="px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Entrar</span>
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal("register")}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Criar Conta</span>
                </button>
              </div>
            </div>
          ) : isAuthenticated ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => {
                    setUserMenuOpen(!userMenuOpen);
                    setPetMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer"
                  title="Gerenciar conta e perfil"
                >
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-300"
                  />
                  <div className="text-left hidden md:block">
                    <div className="text-xs font-bold text-slate-800 leading-tight">
                      {currentUser.name.split(" ")[0]}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {pets.length > 0 ? currentRoleInfo.label : "Minha Conta"}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={currentUser.avatar}
                          alt={currentUser.name}
                          className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-500/30"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-slate-900 truncate flex items-center gap-1">
                            <span>{currentUser.name}</span>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {currentUser.email}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-1.5 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          openAuthModal("profile");
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition text-left"
                      >
                        <UserCog className="w-4 h-4 text-slate-500" />
                        <span>Meu Perfil / Editar Conta</span>
                      </button>

                      <Link
                        href="/"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setShowLandingPage(!showLandingPage);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition text-left"
                      >
                        {showLandingPage ? (
                          <>
                            <LayoutDashboard className="w-4 h-4 text-emerald-600" />
                            <span>Voltar ao Meu Painel</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-emerald-600" />
                            <span>Sobre o PetRec (Início)</span>
                          </>
                        )}
                      </Link>
                    </div>

                    <div className="border-t border-slate-100 mt-1 pt-1 px-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sair da Conta</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {pets.length > 0 && (
                <span
                  className={`hidden sm:inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${currentRoleInfo.color}`}
                >
                  {currentRoleInfo.label}
                </span>
              )}
            </div>
          ) : (
            <div className="w-24 h-8 bg-slate-100 rounded-xl animate-pulse" />
          )}
        </div>
      </div>

      {/* Backdrop transparente para fechar dropdowns ao clicar fora */}
      {(petMenuOpen || userMenuOpen) && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => {
            setPetMenuOpen(false);
            setUserMenuOpen(false);
          }}
        />
      )}

      {/* Modal de Cadastrar Novo Pet */}
      {isAuthenticated && (
        <PetModal
          isOpen={showNewPetModal}
          onClose={() => setShowNewPetModal(false)}
          mode="create"
        />
      )}
    </header>
  );
}
