"use client";

import { Clock, Check, Pencil, Copy, Trash2 } from "lucide-react";
import type { RefeicaoPlano } from "@/types/domain";
import { cn } from "@/lib/utils/cn";

interface MealCardProps {
  refeicao: RefeicaoPlano;
  aoEditar: () => void;
  aoExcluir: () => void;
  aoDuplicar: () => void;
  aoAlternarConsumida: () => void;
}

export function MealCard({ refeicao, aoEditar, aoExcluir, aoDuplicar, aoAlternarConsumida }: MealCardProps) {
  return (
    <div
      className={cn(
        "group rounded-xl border p-3.5 transition-colors",
        refeicao.consumida ? "border-brand-200 bg-brand-50/60" : "border-border bg-white hover:border-brand-200"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Clock className="h-3.5 w-3.5" />
          {refeicao.horario.slice(0, 5)}
        </div>
        <button
          onClick={aoAlternarConsumida}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
            refeicao.consumida
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-border text-transparent hover:border-brand-400"
          )}
          title={refeicao.consumida ? "Marcar como não consumida" : "Marcar como consumida"}
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
