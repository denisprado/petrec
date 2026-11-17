"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { getRolePermissions, PermissionCheck } from "@/lib/permissions";
import { AuthModal } from "@/components/AuthModal";

export type AuthModalTab = "login" | "register" | "profile";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  roleDescription: string;
  whatsappPhoneNumber?: string;
  hasPassword?: boolean;
}

export type DemoUser = AppUser;

export interface PetSummary {
  id: string;
  name: string;
  photo: string | null;
  species: string;
  statusColor: "green" | "yellow" | "red";
  statusText: string;
}

interface AppContextType {
  currentUser: AppUser;
  setCurrentUser: (user: AppUser) => void;
  availableUsers: AppUser[];
  activePetId: string;
  setActivePetId: (id: string) => void;
  pets: PetSummary[];
  setPets: (pets: PetSummary[]) => void;
  userRole: string;
  permissions: PermissionCheck;
  refreshTrigger: number;
  triggerRefresh: () => void;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  showLandingPage: boolean;
  setShowLandingPage: (show: boolean | ((prev: boolean) => boolean)) => void;
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

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80";

const GUEST_USER: AppUser = {
  id: "",
  name: "",
  email: "",
  avatar: DEFAULT_AVATAR,
  roleDescription: "Visitante",
};

function mapDbUserToAppUser(u: any): AppUser {
  return {
    id: u._id || u.id || "",
    name: u.name || "Tutor(a)",
    email: u.email || "",
    avatar: u.avatar || DEFAULT_AVATAR,
    roleDescription: u.roleDescription || "Tutor(a) no PetRec",
    whatsappPhoneNumber: u.whatsappPhoneNumber,
    hasPassword: Boolean(u.hasPassword),
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [availableUsers, setAvailableUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUserState] = useState<AppUser>(GUEST_USER);
  const [activePetId, setActivePetIdState] = useState<string>("");
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [userRole, setUserRole] = useState<string>("viewer");
  const [petMembers, setPetMembers] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [showLandingPage, setShowLandingPage] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>("login");
  const isInitializedRef = useRef(false);

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  const openAuthModal = (tab: AuthModalTab = "login") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => setAuthModalOpen(false);

  const setCurrentUser = (user: AppUser) => {
    setCurrentUserState(user);
    if (typeof window !== "undefined" && user.id) {
      localStorage.setItem("petrec_user_email", user.email);
      localStorage.setItem("petrec_auth_user", JSON.stringify(user));
    }
  };

  const syncUsers = (
    usersFromApi: any[],
    updatedCurrentUser?: any,
    authenticated?: boolean
  ) => {
    if (updatedCurrentUser) {
      const mapped = mapDbUserToAppUser(updatedCurrentUser);
      setCurrentUserState(mapped);
      setAvailableUsers([mapped]);
      if (authenticated !== undefined) {
        setIsAuthenticated(authenticated);
        if (authenticated) {
          setShowLandingPage(false);
        }
      }
      if (typeof window !== "undefined" && mapped.id) {
        localStorage.setItem("petrec_user_email", mapped.email);
        localStorage.setItem("petrec_auth_user", JSON.stringify(mapped));
      }
    } else if (Array.isArray(usersFromApi) && usersFromApi.length > 0 && currentUser.id) {
      const selfFromApi = usersFromApi.find(
        (u) => (u._id || u.id) === currentUser.id
      );
      if (selfFromApi) {
        const mapped = mapDbUserToAppUser(selfFromApi);
        setCurrentUserState(mapped);
        setAvailableUsers([mapped]);
      }
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setShowLandingPage(true);
    setPets([]);
    setActivePetIdState("");
    setPetMembers([]);
    setAvailableUsers([]);
    setUserRole("viewer");
    setAuthModalOpen(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem("petrec_auth_user");
      localStorage.removeItem("petrec_user_email");
      localStorage.removeItem("petrec_active_pet_id");
    }
    setCurrentUserState(GUEST_USER);
  };

  const setActivePetId = (petId: string) => {
    setActivePetIdState(petId);
    if (typeof window !== "undefined") {
      if (petId) {
        localStorage.setItem("petrec_active_pet_id", petId);
      } else {
        localStorage.removeItem("petrec_active_pet_id");
      }
    }
  };

  // 1. Inicialização ao montar o App: valida sessão salva no servidor sem auto-login demo
  useEffect(() => {
    async function init() {
      try {
        let initialPetId = "";
        let savedAuthUser: AppUser | null = null;

        if (typeof window !== "undefined") {
          initialPetId = localStorage.getItem("petrec_active_pet_id") || "";
          const rawAuth = localStorage.getItem("petrec_auth_user");
          if (rawAuth) {
            try {
              const parsed = JSON.parse(rawAuth);
              if (parsed?.id && parsed?.email) {
                savedAuthUser = parsed;
              }
            } catch {
              savedAuthUser = null;
            }
          }
        }

        if (!savedAuthUser?.id) {
          setIsAuthenticated(false);
          setCurrentUserState(GUEST_USER);
          setPets([]);
          setActivePetIdState("");
          isInitializedRef.current = true;
          setIsAuthLoading(false);
          return;
        }

        // Verificar se o usuário salvo realmente existe no Convex
        const authRes = await fetch(
          `/api/auth?userId=${encodeURIComponent(savedAuthUser.id)}`
        ).catch(() => null);

        let verifiedUser: AppUser | null = null;
        if (authRes && authRes.ok) {
          try {
            const authData = await authRes.json();
            if (authData?.currentUser) {
              verifiedUser = mapDbUserToAppUser(authData.currentUser);
            }
          } catch {
            verifiedUser = null;
          }
        }

        if (!verifiedUser) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("petrec_auth_user");
            localStorage.removeItem("petrec_user_email");
            localStorage.removeItem("petrec_active_pet_id");
          }
          setIsAuthenticated(false);
          setCurrentUserState(GUEST_USER);
          setPets([]);
          setActivePetIdState("");
          isInitializedRef.current = true;
          setIsAuthLoading(false);
          return;
        }

        setCurrentUserState(verifiedUser);
        setAvailableUsers([verifiedUser]);
        setIsAuthenticated(true);
        if (typeof window !== "undefined") {
          localStorage.setItem("petrec_user_email", verifiedUser.email);
          localStorage.setItem("petrec_auth_user", JSON.stringify(verifiedUser));
        }

        const dashUrl = `/api/dashboard?userId=${encodeURIComponent(verifiedUser.id)}${
          initialPetId ? `&petId=${encodeURIComponent(initialPetId)}` : ""
        }`;
        const dashRes = await fetch(dashUrl).catch(() => null);

        let data: any = null;
        if (dashRes && dashRes.ok) {
          try {
            data = await dashRes.json();
          } catch {
            data = null;
          }
        }

        let fetchedPets: PetSummary[] = data?.pets || [];

        if (fetchedPets.length === 0) {
          try {
            const petsRes = await fetch(
              `/api/pets?userId=${encodeURIComponent(verifiedUser.id)}`
            );
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
            console.warn("Falha ao buscar pets do usuário no Convex:", e);
          }
        }

        setPets(fetchedPets);

        const resolvedPetId =
          initialPetId && fetchedPets.some((p) => p.id === initialPetId)
            ? initialPetId
            : data?.activePet?.id || (fetchedPets[0]?.id ?? "");

        setActivePetIdState(resolvedPetId);
        if (typeof window !== "undefined") {
          if (resolvedPetId) {
            localStorage.setItem("petrec_active_pet_id", resolvedPetId);
          } else {
            localStorage.removeItem("petrec_active_pet_id");
          }
        }

        setPetMembers(data?.activePet?.members || []);
        isInitializedRef.current = true;
      } catch (err) {
        console.error("Falha ao inicializar contexto do PetRec:", err);
        setIsAuthenticated(false);
      } finally {
        setIsAuthLoading(false);
      }
    }

    init();
  }, []);

  // 2. Atualizar dados do pet ativo e do usuário autenticado quando mudar activePetId, refresh ou login
  useEffect(() => {
    if (!isInitializedRef.current) return;
    if (!isAuthenticated || !currentUser.id) {
      setPets([]);
      setPetMembers([]);
      return;
    }

    async function updatePetMembers() {
      try {
        const dashUrl = `/api/dashboard?userId=${encodeURIComponent(currentUser.id)}${
          activePetId ? `&petId=${encodeURIComponent(activePetId)}` : ""
        }`;
        const res = await fetch(dashUrl).catch(() => null);

        if (res && res.ok) {
          const data = await res.json();
          setPetMembers(data.activePet?.members || []);
          const nextPets: PetSummary[] = data.pets || [];
          setPets(nextPets);
          if (
            (!activePetId && data.activePet?.id) ||
            (activePetId && nextPets.length > 0 && !nextPets.some((p) => p.id === activePetId))
          ) {
            const nextId = data.activePet?.id || nextPets[0]?.id || "";
            setActivePetIdState(nextId);
            if (typeof window !== "undefined" && nextId) {
              localStorage.setItem("petrec_active_pet_id", nextId);
            }
          }
        } else {
          const petsRes = await fetch(
            `/api/pets?userId=${encodeURIComponent(currentUser.id)}`
          ).catch(() => null);
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
      } catch (err) {
        console.error("Erro ao atualizar membros do pet:", err);
      }
    }

    updatePetMembers();
  }, [activePetId, refreshTrigger, currentUser.id, isAuthenticated]);

  // 3. Determinar papel e permissões reais do usuário atual no pet ativo
  useEffect(() => {
    if (!isAuthenticated || !currentUser.id) {
      setUserRole("viewer");
      return;
    }

    const member = petMembers.find(
      (m: any) =>
        m.user?.id === currentUser.id ||
        m.userId === currentUser.id ||
        m.user?.email?.toLowerCase() === currentUser.email?.toLowerCase()
    );
    if (member?.role) {
      setUserRole(member.role);
    } else if (pets.length === 0) {
      // Usuário recém-cadastrado sem pets ainda pode criar seu primeiro pet
      setUserRole("owner");
    } else {
      setUserRole("viewer");
    }
  }, [currentUser, petMembers, isAuthenticated, pets.length]);

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
        isAuthLoading,
        showLandingPage,
        setShowLandingPage,
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
