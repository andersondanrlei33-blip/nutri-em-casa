"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ToastViewport } from "@/components/ui/Toast";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { useTourStore, tourJaFoiVisto } from "@/lib/tour/store";
import { PASSOS_TOUR } from "@/lib/tour/steps";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const ativo = useTourStore((s) => s.ativo);
  const passoIndex = useTourStore((s) => s.passoIndex);
  const iniciarTour = useTourStore((s) => s.iniciar);

  // Primeira visita: dispara o tour automaticamente após o dashboard montar.
  useEffect(() => {
    if (!tourJaFoiVisto()) {
      const t = setTimeout(() => iniciarTour(), 600);
      return () => clearTimeout(t);
    }
  }, [iniciarTour]);

  // Enquanto o tour está ativo e o passo atual aponta pra um item do menu,
  // garante que o menu (off-canvas no mobile) esteja aberto para medir a posição real.
  useEffect(() => {
    if (!ativo) return;
    const alvo = PASSOS_TOUR[passoIndex]?.alvo;
    if (alvo?.startsWith("nav-")) {
      setMenuAberto(true);
    }
  }, [ativo, passoIndex]);

  return (
    <div className="flex min-h-screen">
      <Sidebar aberta={menuAberto} aoFechar={() => setMenuAberto(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar aoAbrirMenu={() => setMenuAberto(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <ToastViewport />
      <TourOverlay />
    </div>
  );
}
