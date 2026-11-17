"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { getRolePermissions, PermissionCheck } from "@/lib/permissions";
import { AuthModal } from "@/components/AuthModal";

export type AuthModalTab = "login" | "register" | "profile";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  roleDescription: string;
  whatsappPhoneNumber?: string;
  hasPassword?: boolean;
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
  isAuthenticated: boolean;
  authModalOpen: boolean;
  authModalTab: AuthModalTab;
  openAuthModal: (tab?: AuthModalTab) => void;
  closeAuthModal: () => void;
  syncUsers: (
    usersFromApi: any[],
    updatedCurrentUser?: any,
    authenticated?: boolean
  ) => void;
  logout: () => void;
}

export const DEMO_USERS: DemoUser[] = [
  {
    id: "ks7endyw8ycn8cnpdg1aywjrnd8fws99",
    name: "Denis Forigo",
    email: "denis@petrec.app",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Owner (Proprietário)",
  },
  {
    id: "ks7cmjwtpwt8xxgvq83erqtcbs8fwa34",
    name: "Ana Silva",
    email: "ana@petrec.app",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Co-owner (Coproprietária)",
  },
  {
    id: "ks7adge2fy5y4nezk2cg3tg1b58fxycz",
    name: "João Cuidador",
    email: "joao@petrec.app",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Caregiver (Cuidador)",
  },
  {
    id: "ks7drf6ytedpxjdqsfmdyfznhs8fxr7h",
    name: "Dra. Camila Ramos",
    email: "camila.vet@petrec.app",
    avatar: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Médica Veterinária (CRMV-SP 24890)",
  },
  {
    id: "ks76896mfy5m6ftvbg4xenyn2x8fxz6j",
    name: "Carlos Sitter",
    email: "carlos.sitter@petrec.app",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    roleDescription: "Pet Sitter / Cuidador Pro",
  },
];

function mapDbUserToDemoUser(u: any): DemoUser {
  const demoMatch = DEMO_USERS.find(
    (d) => d.email.toLowerCase() === String(u.email || "").toLowerCase()
  );
  const roleDesc =
    u.roleDescription && u.roleDescription !== "Tutor(a) no PetRec"
      ? u.roleDescription
      : demoMatch?.roleDescription || u.roleDescription || "Tutor(a) no PetRec";

  return {
    id: u._id || u.id || demoMatch?.id || "",
    name: u.name || demoMatch?.name || "Usuário",
    email: u.email || demoMatch?.email || "",
    avatar: u.avatar || demoMatch?.avatar || DEMO_USERS[0].avatar,
    roleDescription: roleDesc,
    whatsappPhoneNumber: u.whatsappPhoneNumber,
    hasPassword: Boolean(u.hasPassword),
  };
}

function mergeDbUsers(allDbUsers: any[], members: any[] = []): DemoUser[] {
  const byEmail = new Map<string, DemoUser>();

  if (Array.isArray(allDbUsers) && allDbUsers.length > 0) {
    for (const u of allDbUsers) {
      if (!u?.email) continue;
      const mapped = mapDbUserToDemoUser(u);
      byEmail.set(mapped.email.toLowerCase(), mapped);
    }
  }

  for (const m of members) {
    const u = m?.user;
    if (!u?.email) continue;
    const key = String(u.email).toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, mapDbUserToDemoUser(u));
    }
  }

  if (byEmail.size === 0) {
    return DEMO_USERS;
  }

  return Array.from(byEmail.values());
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [availableUsers, setAvailableUsers] = useState<DemoUser[]>(DEMO_USERS);
  const [currentUser, setCurrentUserState] = useState<DemoUser>(DEMO_USERS[0]);
  const [activePetId, setActivePetIdState] = useState<string>("");
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [userRole, setUserRole] = useState<string>("owner");
  const [petMembers, setPetMembers] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>("login");
  const isInitializedRef = useRef(false);

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  const openAuthModal = (tab: AuthModalTab = "login") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => setAuthModalOpen(false);

  // Troca de usuário persistida
  const setCurrentUser = (user: DemoUser) => {
    setCurrentUserState(user);
    if (typeof window !== "undefined") {
      localStorage.setItem("petrec_user_email", user.email);
      localStorage.setItem("petrec_auth_user", JSON.stringify(user));
    }
  };

  const syncUsers = (
    usersFromApi: any[],
    updatedCurrentUser?: any,
    authenticated?: boolean
  ) => {
    const merged = mergeDbUsers(usersFromApi);
    if (merged.length > 0) {
      setAvailableUsers(merged);
    }
    if (updatedCurrentUser) {
      const mapped = mapDbUserToDemoUser(updatedCurrentUser);
      setCurrentUserState(mapped);
      if (authenticated !== undefined) {
        setIsAuthenticated(authenticated);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("petrec_user_email", mapped.email);
        localStorage.setItem("petrec_auth_user", JSON.stringify(mapped));
      }
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem("petrec_auth_user");
      localStorage.removeItem("petrec_user_email");
    }
    setCurrentUserState({
      id: "",
      name: "Visitante",
      email: "visitante@petrec.app",
      avatar: DEMO_USERS[0].avatar,
      roleDescription: "Desconectado — Entre ou Cadastre-se",
    });
    setAuthModalTab("login");
    setAuthModalOpen(true);
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
        let savedAuthUser: DemoUser | null = null;

        if (typeof window !== "undefined") {
          initialPetId = localStorage.getItem("petrec_active_pet_id") || "";
          initialUserEmail = localStorage.getItem("petrec_user_email") || "";
          const rawAuth = localStorage.getItem("petrec_auth_user");
          if (rawAuth) {
            try {
              savedAuthUser = JSON.parse(rawAuth);
              if (savedAuthUser?.id) {
                setIsAuthenticated(true);
              }
            } catch {
              savedAuthUser = null;
            }
          }
        }

        const [dashRes, authRes] = await Promise.all([
          fetch(`/api/dashboard${initialPetId ? `?petId=${initialPetId}` : ""}`),
          fetch("/api/auth").catch(() => null),
        ]);

        let data: any = null;
        if (dashRes && dashRes.ok) {
          try {
            data = await dashRes.json();
          } catch {
            data = null;
          }
        }

        let allDbUsers: any[] = [];
        if (authRes && authRes.ok) {
          try {
            const authData = await authRes.json();
            allDbUsers = authData.users || [];
          } catch {
            allDbUsers = [];
          }
        } else {
          const tutoresRes = await fetch(
            `/api/tutores${initialPetId ? `?petId=${initialPetId}` : ""}`
          ).catch(() => null);
          if (tutoresRes && tutoresRes.ok) {
            try {
              const tutoresData = await tutoresRes.json();
              allDbUsers = tutoresData.allUsers || [];
            } catch {
              allDbUsers = [];
            }
          }
        }

        let fetchedPets: PetSummary[] = data?.pets || [];

        if (fetchedPets.length === 0) {
          try {
            const petsRes = await fetch("/api/pets");
            if (petsRes.ok) {
              const petsData = await petsRes.json();
              if (petsData.pets && petsData.pets.length > 0) {
                fetchedPets = petsData.pets.map((p: any) => ({
                  id: p._id || p.id,
                  name: p.name,
                  photo: p.photo || null,
                  species: p.species || "Cão",
                  statusColor: "green",
                  statusText: "Tudo em dia",
                }));
              }
            }
          } catch (e) {
            console.warn("Falha no fallback de pets Convex:", e);
          }
        }

        setPets(fetchedPets);

        const resolvedPetId =
          initialPetId && fetchedPets.some((p) => p.id === initialPetId)
            ? initialPetId
            : data?.activePet?.id || (fetchedPets[0]?.id ?? "");

        setActivePetIdState(resolvedPetId);
        if (typeof window !== "undefined" && resolvedPetId) {
          localStorage.setItem("petrec_active_pet_id", resolvedPetId);
        }

        const members = data?.activePet?.members || [];
        setPetMembers(members);

        const mappedUsers = mergeDbUsers(allDbUsers, members);
        setAvailableUsers(mappedUsers);

        // Resolver usuário ativo preservando o salvo ou padrão (primeiro do banco)
        const targetEmail =
          savedAuthUser?.email || initialUserEmail || mappedUsers[0]?.email;
        const resolvedUser =
          mappedUsers.find(
            (u) => u.email.toLowerCase() === String(targetEmail).toLowerCase()
          ) || mappedUsers[0];

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

  // 2. Atualizar dados do pet ativo e usuários quando activePetId mudar ou refresh for acionado
  useEffect(() => {
    if (!isInitializedRef.current) return;

    async function updatePetMembers() {
      try {
        const [res, authRes] = await Promise.all([
          fetch(`/api/dashboard${activePetId ? `?petId=${activePetId}` : ""}`).catch(
            () => null
          ),
          fetch("/api/auth").catch(() => null),
        ]);

        let latestMembers: any[] = [];
        if (res && res.ok) {
          const data = await res.json();
          if (data.activePet?.members) {
            latestMembers = data.activePet.members;
            setPetMembers(data.activePet.members);
          }
          if (data.pets && data.pets.length > 0) {
            setPets(data.pets);
          }
          if (!activePetId && data.activePet?.id) {
            setActivePetIdState(data.activePet.id);
          }
        } else {
          const petsRes = await fetch("/api/pets").catch(() => null);
          if (petsRes && petsRes.ok) {
            const petsData = await petsRes.json();
            if (petsData.pets) {
              setPets(
                petsData.pets.map((p: any) => ({
                  id: p._id || p.id,
                  name: p.name,
                  photo: p.photo || null,
                  species: p.species || "Cão",
                  statusColor: "green",
                  statusText: "Tudo em dia",
                }))
              );
            }
          }
        }

        if (authRes && authRes.ok) {
          const authData = await authRes.json();
          if (Array.isArray(authData.users)) {
            const merged = mergeDbUsers(authData.users, latestMembers);
            setAvailableUsers(merged);
            setCurrentUserState((prev) => {
              if (!prev.email || prev.id === "") return prev;
              const updatedSelf = merged.find(
                (u) => u.email.toLowerCase() === prev.email.toLowerCase()
              );
              return updatedSelf || prev;
            });
          }
        }
      } catch (err) {
        console.error("Erro ao atualizar membros do pet:", err);
      }
    }

    updatePetMembers();
  }, [activePetId, refreshTrigger]);

  // 3. Determinar papel e permissões do usuário atual no pet ativo
  useEffect(() => {
    const member = petMembers.find(
      (m: any) =>
        m.user?.email?.toLowerCase() === currentUser.email?.toLowerCase()
    );
    if (member?.role) {
      setUserRole(member.role);
    } else if (!currentUser.id) {
      setUserRole("viewer");
    } else {
      // Regras de fallback para demonstração
      if (
        currentUser.email === "denis@petrec.app" ||
        currentUser.email === "denis@exemplo.com"
      ) {
        setUserRole("owner");
      } else if (
        (currentUser.email === "ana@petrec.app" ||
          currentUser.email === "ana@exemplo.com") &&
        activePetId
      ) {
        setUserRole("co_owner");
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
        isAuthenticated,
        authModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        syncUsers,
        logout,
      }}
    >
      {children}
      <AuthModal
        isOpen={authModalOpen}
        initialTab={authModalTab}
        onClose={closeAuthModal}
      />
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
