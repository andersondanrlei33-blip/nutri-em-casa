"use client";

import Link from "next/link";
import { Clock, Users, Star, Pencil, Copy, Trash2, Flame } from "lucide-react";
import type { Receita } from "@/types/domain";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";

const CATEGORIA_LABEL: Record<string, string> = {
  cafe_da_manha: "Café da manhã",
  almoco: "Almoço",
  jantar: "Jantar",
  lanche: "Lanche",
  sobremesa: "Sobremesa",
  pre_treino: "Pré-treino",
  pos_treino: "Pós-treino",
};

interface RecipeCardProps {
  receita: Receita;
  ehPropria: boolean;
  aoAlternarFavorito: () => void;
  aoEditar?: () => void;
  aoExcluir?: () => void;
  aoDuplicar: () => void;
}

export function RecipeCard({ receita, ehPropria, aoAlternarFavorito, aoEditar, aoExcluir, aoDuplicar }: RecipeCardProps) {
  return (
    <div className="group rounded-2xl border border-border bg-white p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Badge tom="brand">{CATEGORIA_LABEL[receita.categoria] ?? receita.categoria}</Badge>
        <button
          onClick={aoAlternarFavorito}
          className={cn("shrink-0", receita.favorito ? "text-accent-500" : "text-muted hover:text-accent-500")}
          title="Favoritar"
        >
          <Star className="h-4.5 w-4.5" fill={receita.favorito ? "currentColor" : "none"} />
        </button>
      </div>

      <Link href={`/receitas/${receita.id}`}>
        <h3 className="mt-2.5 font-semibold text-foreground hover:text-brand-700">{receita.nome}</h3>
      </Link>
      {receita.descricao && <p className="mt-1 line-clamp-2 text-sm text-muted">{receita.descricao}</p>}

      <div className="mt-3 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {receita.tempo_preparo_min} min
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> {receita.porcoes} porção(ões)
        </span>
        <span className="flex items-center gap-1">
          <Flame className="h-3.5 w-3.5" /> {receita.calorias} kcal
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1 border-t border-border pt-3 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={aoDuplicar} className="rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-foreground" title="Duplicar">
          <Copy className="h-3.5 w-3.5" />
        </button>
        {ehPropria && aoEditar && (
          <button onClick={aoEditar} className="rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-foreground" title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {ehPropria && aoExcluir && (
          <button onClick={aoExcluir} className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-danger-500" title="Excluir">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
