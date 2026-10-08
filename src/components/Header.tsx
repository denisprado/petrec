"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  PawPrint,
  ChevronDown,
  UserCheck,
  ShieldAlert,
  Bell,
  Sparkles,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { PetModal } from "@/components/PetModal";

export function Header() {
  const {
    currentUser,
    setCurrentUser,
    availableUsers,
    activePetId,
    setActivePetId,
    pets,
    userRole,
    triggerRefresh,
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
          {/* Logo & Pet Selector */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 font-black text-slate-900 tracking-tight hover:opacity-90 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <PawPrint className="w-5 h-5 fill-current" />
              </div>
              <span className="text-xl hidden sm:inline">
                Pet<span className="text-emerald-600">Rec</span>
              </span>
            </Link>

            {/* Multi-Pet Selector Button */}
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
                    {activePet ? activePet.name : (pets.length === 0 ? "Cadastrar pet" : "Carregando...")}
                  </span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {/* Pet Dropdown */}
              {petMenuOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    Meus Pets Cadastrados
                  </div>
                  {pets.map((pet) => (
                    <button
                      key={pet.id}
                      onClick={() => {
                        setActivePetId(pet.id);
                        setPetMenuOpen(false);
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
                  ))}
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
          </div>

          {/* User/Tutor Switcher (Denis, Ana, João) & Role Pill */}
          <div className="flex items-center gap-2">
            {/* Tutor Switcher */}
            <div className="relative">
              <button
                onClick={() => {
                  setUserMenuOpen(!userMenuOpen);
                  setPetMenuOpen(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 shadow-2xs transition"
                title="Trocar usuário ativo para testar permissões e registros compartilhados"
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
                  <div className="text-[10px] text-slate-500">{currentRoleInfo.label}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* User Dropdown */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    Simular Usuário Conectado
                  </div>
                  <p className="px-3 pb-2 text-[11px] text-slate-500 leading-tight">
                    Alterne para testar as perspectivas do <strong>Tutor</strong> (Denis/Ana),{" "}
                    <strong>Cuidador</strong> (João), <strong>Veterinária</strong> (Dra. Camila) ou{" "}
                    <strong>Pet Sitter</strong> (Carlos):
                  </p>
                  {availableUsers.map((user) => (
                    <button
                      key={user.email}
                      onClick={() => {
                        setCurrentUser(user);
                        setUserMenuOpen(false);
                        triggerRefresh();
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 transition text-left ${
                        user.email === currentUser.email ? "bg-emerald-50/80 font-bold" : ""
                      }`}
                    >
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-7 h-7 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-slate-900">{user.name}</div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          {user.roleDescription}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Role Badge */}
            <span
              className={`hidden sm:inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${currentRoleInfo.color}`}
            >
              {currentRoleInfo.label}
            </span>
          </div>
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
      <PetModal
        isOpen={showNewPetModal}
        onClose={() => setShowNewPetModal(false)}
        mode="create"
      />
    </header>
  );
}
