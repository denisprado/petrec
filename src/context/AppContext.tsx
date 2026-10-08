"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { getRolePermissions, PermissionCheck } from "@/lib/permissions";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  roleDescription: string;
}

export interface PetSummary {
  id: string;
  name: string;
  photo: string | null;
  species: string;
  statusColor: "green" | "yellow" | "red";
  statusText: string;
}

interface AppContextType {
  currentUser: DemoUser;
  setCurrentUser: (user: DemoUser) => void;
  availableUsers: DemoUser[];
  activePetId: string;
  setActivePetId: (id: string) => void;
  pets: PetSummary[];
  setPets: (pets: PetSummary[]) => void;
  userRole: string;
  permissions: PermissionCheck;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const DEMO_USERS: DemoUser[] = [
  {
    id: "",
    name: "Denis Forigo",
    email: "denis@exemplo.com",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Owner (Proprietário)",
  },
  {
    id: "",
    name: "Ana Silva",
    email: "ana@exemplo.com",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Co-owner (Coproprietária)",
  },
  {
    id: "",
    name: "João Cuidador",
    email: "joao@exemplo.com",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Caregiver (Cuidador)",
  },
  {
    id: "",
    name: "Dra. Camila Ramos",
    email: "camila@veterinaria.com",
    avatar: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Médica Veterinária (CRMV-SP 24890)",
  },
  {
    id: "",
    name: "Carlos Sitter",
    email: "carlos@petsitter.com",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Pet Sitter / Cuidador Pro",
  },
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [availableUsers, setAvailableUsers] = useState<DemoUser[]>(DEMO_USERS);
  const [currentUser, setCurrentUserState] = useState<DemoUser>(DEMO_USERS[0]);
  const [activePetId, setActivePetIdState] = useState<string>("");
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [userRole, setUserRole] = useState<string>("owner");
  const [petMembers, setPetMembers] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const isInitializedRef = useRef(false);

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  // Troca de usuário persistida
  const setCurrentUser = (user: DemoUser) => {
    setCurrentUserState(user);
    if (typeof window !== "undefined") {
      localStorage.setItem("petrec_user_email", user.email);
    }
  };

  // Troca de pet ativo persistida
  const setActivePetId = (petId: string) => {
    setActivePetIdState(petId);
    if (typeof window !== "undefined") {
      localStorage.setItem("petrec_active_pet_id", petId);
    }
  };

  // 1. Inicialização ÚNICA ao montar o App
  useEffect(() => {
    async function init() {
      try {
        let initialPetId = "";
        let initialUserEmail = "";

        if (typeof window !== "undefined") {
          initialPetId = localStorage.getItem("petrec_active_pet_id") || "";
          initialUserEmail = localStorage.getItem("petrec_user_email") || "";
        }

        const [dashRes, tutoresRes] = await Promise.all([
          fetch(`/api/dashboard${initialPetId ? `?petId=${initialPetId}` : ""}`),
          fetch(`/api/tutores${initialPetId ? `?petId=${initialPetId}` : ""}`).catch(() => null),
        ]);

        const data = await dashRes.json();
        let allDbUsers: any[] = [];
        if (tutoresRes && tutoresRes.ok) {
          const tutoresData = await tutoresRes.json();
          allDbUsers = tutoresData.allUsers || [];
        }

        const fetchedPets: PetSummary[] = data.pets || [];
        setPets(fetchedPets);

        // Resolver pet ativo preservando o pet salvo ou primeiro disponível
        const resolvedPetId =
          initialPetId && fetchedPets.some((p) => p.id === initialPetId)
            ? initialPetId
            : data.activePet?.id || (fetchedPets[0]?.id ?? "");

        setActivePetIdState(resolvedPetId);
        if (typeof window !== "undefined" && resolvedPetId) {
          localStorage.setItem("petrec_active_pet_id", resolvedPetId);
        }

        const members = data.activePet?.members || [];
        setPetMembers(members);

        // Mapear IDs reais dos usuários cadastrados no banco
        const mappedUsers = DEMO_USERS.map((du) => {
          const memberFound = members.find((m: any) => m.user?.email === du.email);
          if (memberFound) return { ...du, id: memberFound.user.id };
          const userFound = allDbUsers.find((u: any) => u.email === du.email);
          if (userFound) return { ...du, id: userFound.id };
          return du;
        });

        setAvailableUsers(mappedUsers);

        // Resolver usuário ativo preservando o salvo ou padrão (Denis)
        const targetEmail = initialUserEmail || mappedUsers[0]?.email;
        const resolvedUser =
          mappedUsers.find((u) => u.email === targetEmail) || mappedUsers[0];

        if (resolvedUser) {
          setCurrentUserState(resolvedUser);
          if (typeof window !== "undefined") {
            localStorage.setItem("petrec_user_email", resolvedUser.email);
          }
        }

        isInitializedRef.current = true;
      } catch (err) {
        console.error("Falha ao inicializar contexto do PetRec:", err);
      }
    }

    init();
  }, []);

  // 2. Atualizar dados do pet ativo quando activePetId mudar ou refresh for acionado
  useEffect(() => {
    if (!isInitializedRef.current || !activePetId) return;

    async function updatePetMembers() {
      try {
        const res = await fetch(`/api/dashboard?petId=${activePetId}`);
        const data = await res.json();
        if (data.activePet?.members) {
          setPetMembers(data.activePet.members);
        }
        if (data.pets) {
          setPets(data.pets);
        }
      } catch (err) {
        console.error("Erro ao atualizar membros do pet:", err);
      }
    }

    updatePetMembers();
  }, [activePetId, refreshTrigger]);

  // 3. Determinar papel e permissões do usuário atual no pet ativo
  useEffect(() => {
    const member = petMembers.find((m: any) => m.user?.email === currentUser.email);
    if (member?.role) {
      setUserRole(member.role);
    } else {
      // Regras de fallback para demonstração
      if (currentUser.email === "denis@exemplo.com") {
        setUserRole("owner");
      } else if (currentUser.email === "ana@exemplo.com" && activePetId) {
        // Ana é co-owner do Rex e da Luna
        const isAnaMember = petMembers.some((m: any) => m.user?.email === "ana@exemplo.com");
        setUserRole(isAnaMember ? "co_owner" : "viewer");
      } else {
        setUserRole("viewer");
      }
    }
  }, [currentUser, petMembers, activePetId]);

  const permissions = getRolePermissions(userRole);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        availableUsers,
        activePetId,
        setActivePetId,
        pets,
        setPets,
        userRole,
        permissions,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
