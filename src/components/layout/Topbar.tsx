"use client";

import { Menu, LogOut, User as UserIcon, HelpCircle } from "lucide-react";
import Link from "next/link";
import { sairComForca } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { diasRestantesTrial } from "@/lib/subscriptions/access";
import { Badge } from "@/components/ui/Badge";
import { useTourStore } from "@/lib/tour/store";

export function Topbar({ aoAbrirMenu }: { aoAbrirMenu: () => void }) {
  const { perfil, assinatura } = useUser();
  const iniciarTour = useTourStore((s) => s.iniciar);

  const diasTrial = assinatura ? diasRestantesTrial(assinatura) : 0;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-white/80 px-4 backdrop-blur sm:px-6">
      <button onClick={aoAbrirMenu} className="text-muted md:hidden">
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        {assinatura?.plano === "trial" && diasTrial > 0 && (
          <Badge tom="accent">{diasTrial} dia{diasTrial === 1 ? "" : "s"} de trial restantes</Badge>
        )}
        <Link
          href="/perfil"
          className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-black/[0.03]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <UserIcon className="h-4 w-4" />
          </div>
          <span className="hidden text-sm font-medium text-foreground sm:inline">
            {perfil?.nome || "Meu perfil"}
          </span>
        </Link>
        <button
          onClick={iniciarTour}
          data-tour="botao-ajuda"
          className="rounded-xl p-2 text-muted hover:bg-black/[0.03] hover:text-brand-600"
          title="Ver tutorial"
        >
          <HelpCircle className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={() => sairComForca()}
          className="rounded-xl p-2 text-muted hover:bg-black/[0.03] hover:text-danger-500"
          title="Sair"
        >
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </div>
    </header>
  );
}
