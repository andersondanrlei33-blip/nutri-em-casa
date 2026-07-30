"use client";

import { useState } from "react";
import { Clock, Utensils, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { montarRegistroConsumo } from "@/lib/nutrition/registrarConsumo";
import type { RefeicaoPlano, RegistroConsumo, Receita } from "@/types/domain";

interface TodayMealsProps {
  refeicoes: RefeicaoPlano[];
  /** Registros reais de consumo de hoje (ver registros_consumo). */
  registros: RegistroConsumo[];
  receitasPorId: Map<string, Receita>;
  usuarioId: string;
  /** Data de hoje em "yyyy-MM-dd". */
  hoje: string;
}

/**
 * Lista de refeições de hoje com checkbox pra marcar como consumida. Marcar
 * grava um registro real em registros_consumo (data + receita + macros
 * calculados), não um booleano fixo no dia da semana — assim a marcação
 * reseta sozinha toda semana e fica coerente com a troca avulsa feita na
 * tela de Receitas (ver lib/nutrition/registrarConsumo.ts).
 */
export function TodayMeals({ refeicoes, registros, receitasPorId, usuarioId, hoje }: TodayMealsProps) {
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

  const registroPorRefeicaoId = new Map(registros.map((r) => [r.refeicao_plano_id, r]));

  async function alternarConsumida(refeicao: RefeicaoPlano) {
    setPendente(refeicao.id);
    const supabase = createClient();
    const jaConsumida = registroPorRefeicaoId.has(refeicao.id);

    if (jaConsumida) {
      const { error } = await supabase
        .from("registros_consumo")
        .delete()
        .eq("usuario_id", usuarioId)
        .eq("data", hoje)
        .eq("refeicao_plano_id", refeicao.id);
      setPendente(null);
      if (error) return toast.erro("Erro ao atualizar refeição.");
      return router.refresh();
    }

    const receita = refeicao.receita_id ? receitasPorId.get(refeicao.receita_id) : undefined;
    if (!receita) {
      setPendente(null);
      return toast.erro("Essa refeição ainda não tem uma receita definida.");
    }
    const { error } = await supabase.from("registros_consumo").upsert(
      {
        usuario_id: usuarioId,
        data: hoje,
        refeicao_plano_id: refeicao.id,
        ...montarRegistroConsumo(receita, refeicao.quantidade_porcoes || 1),
      },
      { onConflict: "usuario_id,data,refeicao_plano_id" }
    );
    setPendente(null);
    if (error) return toast.erro("Erro ao atualizar refeição.");
    router.refresh();
  }

  return (
    <ul className="divide-y divide-border">
      {refeicoes.map((refeicao) => {
        const registro = registroPorRefeicaoId.get(refeicao.id);
        const consumida = Boolean(registro);
        const receitaSubstituta =
          registro?.receita_id && registro.receita_id !== refeicao.receita_id
            ? receitasPorId.get(registro.receita_id)
            : null;
        return (
          <li key={refeicao.id} className="flex items-center gap-3 py-3">
            <button
              onClick={() => alternarConsumida(refeicao)}
              disabled={pendente === refeicao.id}
              aria-label={consumida ? "Desmarcar como consumida" : "Marcar como consumida"}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
                consumida ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-600 hover:bg-brand-100"
              )}
            >
              {consumida ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  consumida ? "text-muted line-through" : "text-foreground"
                )}
              >
                {refeicao.nome_refeicao}
              </p>
              <p className="text-xs text-muted">
                {refeicao.horario.slice(0, 5)}
                {receitaSubstituta && ` · substituída por ${receitaSubstituta.nome}`}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
