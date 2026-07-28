"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { RecipeCard } from "@/components/receitas/RecipeCard";
import { RecipeForm, type DadosFormularioReceita } from "@/components/receitas/RecipeForm";
import { toast } from "@/components/ui/Toast";
import type { Receita, CategoriaReceita } from "@/types/domain";

const CATEGORIAS: { valor: CategoriaReceita | "todas"; label: string }[] = [
  { valor: "todas", label: "Todas as categorias" },
  { valor: "cafe_da_manha", label: "Café da manhã" },
  { valor: "almoco", label: "Almoço" },
  { valor: "jantar", label: "Jantar" },
  { valor: "lanche", label: "Lanche" },
  { valor: "sobremesa", label: "Sobremesa" },
  { valor: "pre_treino", label: "Pré-treino" },
  { valor: "pos_treino", label: "Pós-treino" },
];

export default function ReceitasPage() {
  const { user } = useUser();
  const supabase = createClient();

  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<CategoriaReceita | "todas">("todas");
  const [somenteFavoritas, setSomenteFavoritas] = useState(false);
  const [modalAberto, setModalAberto] = useState<{ receita: Receita | null } | null>(null);

  useEffect(() => {
    carregarReceitas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function carregarReceitas() {
    setCarregando(true);
    const { data } = await supabase.from("receitas").select("*").order("nome", { ascending: true });
    setReceitas((data ?? []) as Receita[]);
    setCarregando(false);
  }

  const filtradas = useMemo(() => {
    return receitas.filter((r) => {
      if (categoria !== "todas" && r.categoria !== categoria) return false;
      if (somenteFavoritas && !r.favorito) return false;
      if (busca && !r.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [receitas, categoria, somenteFavoritas, busca]);

  async function alternarFavorito(receita: Receita) {
    // Receitas globais (usuario_id null) não podem ser alteradas — duplicamos
    // como receita própria já favoritada, preservando a biblioteca original.
    if (!receita.usuario_id) {
      await duplicar(receita, true);
      return;
    }
    const { data, error } = await supabase
      .from("receitas")
      .update({ favorito: !receita.favorito })
      .eq("id", receita.id)
      .select()
      .single();
    if (error) return toast.erro("Erro ao favoritar receita.");
    setReceitas((prev) => prev.map((r) => (r.id === receita.id ? (data as Receita) : r)));
  }

  async function duplicar(receita: Receita, favoritarNaCopia = false) {
    if (!user) return;
    const { id: _id, criado_em: _c, atualizado_em: _a, ...resto } = receita;
    const { data, error } = await supabase
      .from("receitas")
      .insert({ ...resto, usuario_id: user.id, nome: `${receita.nome} (cópia)`, favorito: favoritarNaCopia })
      .select()
      .single();
    if (error) return toast.erro("Erro ao duplicar receita.");
    setReceitas((prev) => [data as Receita, ...prev]);
    toast.sucesso("Receita duplicada para sua biblioteca.");
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("receitas").delete().eq("id", id);
    if (error) return toast.erro("Erro ao excluir receita.");
    setReceitas((prev) => prev.filter((r) => r.id !== id));
    toast.sucesso("Receita excluída.");
  }

  async function salvar(dados: DadosFormularioReceita) {
    if (!user || !modalAberto) return;

    if (modalAberto.receita) {
      const { data, error } = await supabase
        .from("receitas")
        .update(dados)
        .eq("id", modalAberto.receita.id)
        .select()
        .single();
      if (error) return toast.erro("Erro ao salvar receita.");
      setReceitas((prev) => prev.map((r) => (r.id === data.id ? (data as Receita) : r)));
      toast.sucesso("Receita atualizada.");
    } else {
      const { data, error } = await supabase
        .from("receitas")
        .insert({ ...dados, usuario_id: user.id })
        .select()
        .single();
      if (error) return toast.erro("Erro ao criar receita.");
      setReceitas((prev) => [data as Receita, ...prev]);
      toast.sucesso("Receita criada.");
    }
    setModalAberto(null);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Biblioteca de Receitas</h1>
          <p className="mt-1 text-sm text-muted">Pesquise, favorite, edite ou crie suas próprias receitas.</p>
        </div>
        <Button onClick={() => setModalAberto({ receita: null })}>
          <Plus className="h-4 w-4" /> Nova receita
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Buscar receita..." className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaReceita | "todas")} className="w-auto">
          {CATEGORIAS.map((c) => (
            <option key={c.valor} value={c.valor}>{c.label}</option>
          ))}
        </Select>
        <button
          onClick={() => setSomenteFavoritas((v) => !v)}
          className={`rounded-xl border px-4 py-2 text-sm font-medium ${
            somenteFavoritas ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border text-muted"
          }`}
        >
          ★ Favoritas
        </button>
      </div>

      {carregando ? (
        <div className="py-16 text-center text-sm text-muted">Carregando receitas...</div>
      ) : filtradas.length === 0 ? (
        <EmptyState
          icone={BookOpen}
          titulo="Nenhuma receita encontrada"
          descricao="Tente outra busca ou crie a sua própria receita."
          acao={
            <Button variante="secundaria" onClick={() => setModalAberto({ receita: null })}>
              Criar receita
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((receita) => (
            <RecipeCard
              key={receita.id}
              receita={receita}
              ehPropria={receita.usuario_id === user?.id}
              aoAlternarFavorito={() => alternarFavorito(receita)}
              aoDuplicar={() => duplicar(receita)}
              aoEditar={receita.usuario_id === user?.id ? () => setModalAberto({ receita }) : undefined}
              aoExcluir={receita.usuario_id === user?.id ? () => excluir(receita.id) : undefined}
            />
          ))}
        </div>
      )}

      {modalAberto && (
        <RecipeForm aberto aoFechar={() => setModalAberto(null)} aoSalvar={salvar} receitaExistente={modalAberto.receita} />
      )}
    </div>
  );
}
