"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { LandingPage } from "@/components/LandingPage";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isAuthLoading, showLandingPage } = useApp();

  const showingPublicLanding =
    !isAuthLoading && (!isAuthenticated || (pathname === "/" && showLandingPage));

  return (
    <>
      <Header />
      <BottomNav />
      <main className={showingPublicLanding ? "flex-1" : "flex-1 pb-20 md:pb-12"}>
        {isAuthLoading ? (
          <div className="max-w-6xl mx-auto px-4 py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-3" />
            <p className="text-slate-500 font-medium text-sm">Carregando PetRec...</p>
          </div>
        ) : showingPublicLanding ? (
          <LandingPage />
        ) : (
          children
        )}
      </main>
    </>
  );
}
