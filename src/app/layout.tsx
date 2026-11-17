import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";
import { AppShell } from "@/components/AppShell";

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
        <ConvexClientProvider>
          <AppProvider>
            <AppShell>{children}</AppShell>
          </AppProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
