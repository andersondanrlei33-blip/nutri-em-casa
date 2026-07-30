"use client";

import { useState } from "react";
import { Clock, Utensils, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type { RefeicaoPlano } from "@/types/domain";

/**
 * Lista de refeições de hoje com checkbox pra marcar como consumida — antes
 * só mostrava um selo "Consumida" sem nenhuma forma de marcar pela própria
 * tela (o campo `consumida` já existia no banco, só não tinha interação).
 * Marcar/desmarcar atualiza o banco e recarrega a página (router.refresh())
 * pra que a barra de macros (calculada a partir das refeições consumidas)
 * fique sempre em sincronia, sem duplicar essa conta aqui.
 */
export function TodayMeals({ refeicoes }: { refeicoes: RefeicaoPlano[] }) {
  const router = useRouter();
  const [pendente, setPendente] = useState<string | null>(null);

  if (refeicoes.length === 0) {
    return (
      <EmptyState
        icone={Utensils}
        titulo="Nenhuma refeição para hoje"
        descricao="Faça sua consulta nutricional para gerar um plano alimentar personalizado."
      />
    );
  }

  async function alternarConsumida(refeicao: RefeicaoPlano) {
    setPendente(refeicao.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("refeicoes_plano")
      .update({ consumida: !refeicao.consumida })
      .eq("id", refeicao.id);
    setPendente(null);
    if (error) return toast.erro("Erro ao atualizar refeição.");
    router.refresh();
  }

  return (
    <ul className="divide-y divide-border">
      {refeicoes.map((refeicao) => (
        <li key={refeicao.id} className="flex items-center gap-3 py-3">
          <button
            onClick={() => alternarConsumida(refeicao)}
            disabled={pendente === refeicao.id}
            aria-label={refeicao.consumida ? "Desmarcar como consumida" : "Marcar como consumida"}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
              refeicao.consumida ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-600 hover:bg-brand-100"
            )}
          >
            {refeicao.consumida ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-sm font-medium",
                refeicao.consumida ? "text-muted line-through" : "text-foreground"
              )}
            >
              {refeicao.nome_refeicao}
            </p>
            <p className="text-xs text-muted">{refeicao.horario.slice(0, 5)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
