"use client";

import { Menu, LogOut, User as UserIcon, HelpCircle } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { diasRestantesTrial } from "@/lib/subscriptions/access";
import { Badge } from "@/components/ui/Badge";
import { useTourStore } from "@/lib/tour/store";

export function Topbar({ aoAbrirMenu }: { aoAbrirMenu: () => void }) {
  const { perfil, assinatura } = useUser();
  const iniciarTour = useTourStore((s) => s.iniciar);

  async function sair() {
    const supabase = createClient();
    // supabase.auth.signOut() pode ficar pendurado (ex: lock de auth travado
    // entre abas, extensão bloqueando a chamada de rede) e nunca resolver —
    // isso deixava o botão "sem fazer nada" pro usuário. Damos no máximo 3s
    // pra ele terminar; se não terminar, redirecionamos assim mesmo em vez de
    // travar a pessoa dentro do app.
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // Mesmo se signOut() der erro, ainda assim seguimos pro login.
    }
    // Navegação "dura" (recarrega a página) em vez de router.push: garante que
    // o middleware veja os cookies de sessão já limpos na próxima requisição,
    // evitando a corrida onde a navegação client-side chega antes da limpeza
    // do cookie terminar e o middleware manda o usuário de volta pro app.
    window.location.href = "/login";
  }

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
          onClick={sair}
          className="rounded-xl p-2 text-muted hover:bg-black/[0.03] hover:text-danger-500"
          title="Sair"
        >
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </div>
    </header>
  );
}
