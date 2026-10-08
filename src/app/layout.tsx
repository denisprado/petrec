import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "PetRec — Assistente de Cuidados e Estoque Inteligente do Pet",
  description:
    "Gerenciamento colaborativo de cuidados, medicamentos, alimentação, estoque, saúde e compras de pets baseado em consumo real.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
        <AppProvider>
          <Header />
          <BottomNav />
          <main className="flex-1 pb-20 md:pb-12">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
