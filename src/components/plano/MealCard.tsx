"use client";
import { Clock, Check, Pencil, Copy, Trash2 } from "lucide-react";
import type { RefeicaoPlano } from "@/types/domain";
import { cn } from "@/lib/utils/cn";
import { CATEGORIA_LABEL, inferirCategoriaPorHorario } from "@/lib/utils/categoria";

interface MealCardProps {
  refeicao: RefeicaoPlano;
  /** Se essa refeição já tem um registro real de consumo hoje (ver
   *  registros_consumo) — substitui o antigo refeicao.consumida. */
  consumida: boolean;
  /** Só é possível marcar como consumida na aba do dia de hoje — as outras
   *  abas são o modelo recorrente do plano (sem data específica), então
   *  marcar "consumida" nelas não teria uma data coerente pra registrar. */
  podeAlternar: boolean;
  aoEditar: () => void;
  aoExcluir: () => void;
  aoDuplicar: () => void;
  aoAlternarConsumida: () => void;
}
export function MealCard({
  refeicao,
  consumida,
  podeAlternar,
  aoEditar,
  aoExcluir,
  aoDuplicar,
  aoAlternarConsumida,
}: MealCardProps) {
  const categoria = refeicao.categoria ?? inferirCategoriaPorHorario(refeicao.horario);
  return (
    <div
      className={cn(
        "group rounded-xl border p-3.5 transition-colors",
        consumida ? "border-brand-200 bg-brand-50/60" : "border-border bg-white hover:border-brand-200"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
            {CATEGORIA_LABEL[categoria]}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {refeicao.horario.slice(0, 5)}
          </span>
        </div>
        <button
          onClick={aoAlternarConsumida}
          disabled={!podeAlternar}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-30",
            consumida
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-border text-transparent hover:border-brand-400"
          )}
          title={
            !podeAlternar
              ? "Só é possível marcar como consumida no dia de hoje"
              : consumida
                ? "Marcar como não consumida"
                : "Marcar como consumida"
          }
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{refeicao.nome_refeicao}</p>
      <p className="text-xs text-muted">{refeicao.quantidade_porcoes}x porção</p>
      <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={aoEditar} className="rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-foreground" title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={aoDuplicar} className="rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-foreground" title="Duplicar">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button onClick={aoExcluir} className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-danger-500" title="Excluir">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
