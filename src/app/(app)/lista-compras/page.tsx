"use client";

import { useEffect, useMemo, useState } from "react";
import { ShoppingCart, Link2Off } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { RefeicaoPlano, Receita } from "@/types/domain";

interface ItemAgregado {
  nome: string;
  quantidade: number;
  unidade: string;
}

export default function ListaComprasPage() {
  const { user } = useUser();
  const supabase = createClient();

  const [itens, setItens] = useState<ItemAgregado[]>([]);
  const [semReceitaVinculada, setSemReceitaVinculada] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function carregar() {
    setCarregando(true);
    const { data: plano } = await supabase
      .from("planos_alimentares")
      .select("id")
      .eq("usuario_id", user!.id)
      .eq("ativo", true)
      .maybeSingle();

    if (!plano) {
      setCarregando(false);
      return;
    }

    const { data: refeicoes } = await supabase
      .from("refeicoes_plano")
      .select("*")
      .eq("plano_id", plano.id);

    const lista = (refeicoes ?? []) as RefeicaoPlano[];
    const idsReceitas = [...new Set(lista.map((r) => r.receita_id).filter(Boolean))] as string[];
    setSemReceitaVinculada(lista.filter((r) => !r.receita_id).length);

    if (idsReceitas.length === 0) {
      setItens([]);
      setCarregando(false);
      return;
    }

    const { data: receitasData } = await supabase.from("receitas").select("*").in("id", idsReceitas);
    const receitasPorId = new Map((receitasData as Receita[]).map((r) => [r.id, r]));

    const agregados = new Map<string, ItemAgregado>();
    for (const refeicao of lista) {
      if (!refeicao.receita_id) continue;
      const receita = receitasPorId.get(refeicao.receita_id);
      if (!receita) continue;

      const fator = (refeicao.quantidade_porcoes || 1) / (receita.porcoes || 1);
      for (const ing of receita.ingredientes) {
        const chave = `${ing.nome.toLowerCase()}__${ing.unidade}`;
        const existente = agregados.get(chave);
        const quantidade = ing.quantidade * fator;
        if (existente) {
          existente.quantidade += quantidade;
        } else {
          agregados.set(chave, { nome: ing.nome, quantidade, unidade: ing.unidade });
        }
      }
    }

    setItens(
      Array.from(agregados.values())
        .map((i) => ({ ...i, quantidade: Math.round(i.quantidade * 10) / 10 }))
        .sort((a, b) => a.nome.localeCompare(b.nome))
    );
    setCarregando(false);
  }

  const marcadosCount = useMemo(() => Object.values(marcados).filter(Boolean).length, [marcados]);

  if (carregando) {
    return <div className="py-20 text-center text-sm text-muted">Montando sua lista...</div>;
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Lista de Compras</h1>
        <p className="mt-1 text-sm text-muted">
          Gerada automaticamente a partir das receitas vinculadas ao seu plano alimentar da semana.
        </p>
      </div>

      {itens.length === 0 ? (
        <EmptyState
          icone={ShoppingCart}
          titulo="Sua lista de compras está vazia"
          descricao="Vincule receitas da biblioteca às refeições do seu plano alimentar para gerar a lista automaticamente."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {marcadosCount} de {itens.length} itens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {itens.map((item) => (
                <li key={item.nome} className="flex items-center gap-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={!!marcados[item.nome]}
                    onChange={(e) => setMarcados((prev) => ({ ...prev, [item.nome]: e.target.checked }))}
                    className="h-4.5 w-4.5 rounded border-border text-brand-500 focus:ring-brand-400"
                  />
                  <span className={`flex-1 text-sm ${marcados[item.nome] ? "text-muted line-through" : "text-foreground"}`}>
                    {item.nome}
                  </span>
                  <span className="text-xs text-muted">
                    {item.quantidade} {item.unidade}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {semReceitaVinculada > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-muted">
          <Link2Off className="h-3.5 w-3.5 shrink-0" />
          {semReceitaVinculada} refeição(ões) do seu plano ainda não estão vinculadas a uma receita e por
          isso não entram na lista. Edite-as em Plano Alimentar para vincular.
        </p>
      )}
    </div>
  );
}
