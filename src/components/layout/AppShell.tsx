"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ToastViewport } from "@/components/ui/Toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar aberta={menuAberto} aoFechar={() => setMenuAberto(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar aoAbrirMenu={() => setMenuAberto(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <ToastViewport />
    </div>
  );
}
