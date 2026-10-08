"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Pill,
  ShoppingCart,
  HeartPulse,
  Users,
  MessageCircle,
} from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Hoje", icon: LayoutDashboard },
    { href: "/estoque", label: "Estoque", icon: Boxes },
    { href: "/medicamentos", label: "Remédios", icon: Pill },
    { href: "/compras", label: "Compras", icon: ShoppingCart },
    { href: "/saude", label: "Saúde", icon: HeartPulse },
    { href: "/tutores", label: "Tutores", icon: Users },
    { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  ];

  return (
    <>
      {/* Desktop Sub-navigation bar */}
      <nav className="hidden md:block bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 flex gap-6 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 py-3 text-sm font-semibold border-b-2 transition ${
                  isActive
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-2 py-1.5 safe-area-bottom">
        <div className="flex justify-around items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
                  isActive
                    ? "text-emerald-600 font-bold"
                    : "text-slate-500 hover:text-slate-800 font-medium"
                }`}
              >
                <div
                  className={`p-1 rounded-xl transition ${
                    isActive ? "bg-emerald-50 text-emerald-600" : ""
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
