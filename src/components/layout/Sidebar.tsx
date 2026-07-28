"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Stethoscope,
  CalendarDays,
  BookOpen,
  ShoppingCart,
  LineChart,
  Target,
  History,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITENS_NAV = [
  { href: "/dashboard", label: "Dashboard", icone: LayoutDashboard },
  { href: "/consulta", label: "Consulta Nutricional", icone: Stethoscope },
  { href: "/plano", label: "Plano Alimentar", icone: CalendarDays },
  { href: "/receitas", label: "Receitas", icone: BookOpen },
  { href: "/lista-compras", label: "Lista de Compras", icone: ShoppingCart },
  { href: "/acompanhamento", label: "Acompanhamento", icone: LineChart },
  { href: "/metas", label: "Metas", icone: Target },
  { href: "/historico", label: "Histórico", icone: History },
  { href: "/assinatura", label: "Assinatura", icone: Sparkles },
  { href: "/configuracoes", label: "Configurações", icone: Settings },
];

export function Sidebar({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {aberta && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={aoFechar} />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-border bg-white transition-transform md:static md:translate-x-0",
          aberta ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white font-bold">
              N
            </div>
            <span className="font-semibold text-foreground">Nutri em Casa</span>
          </Link>
          <button onClick={aoFechar} className="text-muted md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 py-2">
          {ITENS_NAV.map(({ href, label, icone: Icone }) => {
            const ativo = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={aoFechar}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  ativo
                    ? "bg-brand-50 text-brand-700"
                    : "text-muted hover:bg-black/[0.03] hover:text-foreground"
                )}
              >
                <Icone className="h-4.5 w-4.5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
