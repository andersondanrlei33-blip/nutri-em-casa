import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Clock, Users, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import type { Receita } from "@/types/domain";

export default async function DetalheReceitaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("receitas").select("*").eq("id", id).maybeSingle();

  if (!data) notFound();
  const receita = data as Receita;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/receitas" className="mb-5 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar para receitas
      </Link>

      <Badge tom="brand">{receita.categoria.replace(/_/g, " ")}</Badge>
      <h1 className="mt-2 text-2xl font-bold text-foreground">{receita.nome}</h1>
      {receita.descricao && <p className="mt-1 text-muted">{receita.descricao}</p>}

      <div className="mt-4 flex items-center gap-5 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" /> {receita.tempo_preparo_min} min
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-4 w-4" /> {receita.porcoes} porção(ões)
        </span>
        <span className="flex items-center gap-1.5">
          <Flame className="h-4 w-4" /> {receita.calorias} kcal
        </span>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-3 rounded-xl bg-black/[0.02] p-4 text-center">
        <div>
          <p className="text-xs text-muted">Proteína</p>
          <p className="font-semibold text-foreground">{receita.proteina_g}g</p>
        </div>
        <div>
          <p className="text-xs text-muted">Carboidrato</p>
          <p className="font-semibold text-foreground">{receita.carboidrato_g}g</p>
        </div>
        <div>
          <p className="text-xs text-muted">Gordura</p>
          <p className="font-semibold text-foreground">{receita.gordura_g}g</p>
        </div>
        <div>
          <p className="text-xs text-muted">Fibra</p>
          <p className="font-semibold text-foreground">{receita.fibra_g}g</p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-semibold text-foreground">Ingredientes</h2>
        <ul className="mt-3 space-y-1.5">
          {receita.ingredientes.map((ing, i) => (
            <li key={i} className="flex justify-between text-sm text-foreground">
              <span>{ing.nome}</span>
              <span className="text-muted">
                {ing.quantidade} {ing.unidade}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-foreground">Modo de preparo</h2>
        <ol className="mt-3 space-y-3">
          {receita.modo_preparo.map((passo, i) => (
            <li key={i} className="flex gap-3 text-sm text-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {i + 1}
              </span>
              {passo}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
