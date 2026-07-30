"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, CalendarDays, Copy } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MealCard } from "@/components/plano/MealCard";
import { MealForm, type DadosFormularioRefeicao } from "@/components/plano/MealForm";
import { toast } from "@/components/ui/Toast";
import { montarRegistroConsumo } from "@/lib/nutrition/registrarConsumo";
import { DIAS_SEMANA, DIAS_SEMANA_LABEL, diaSemanaHoje, hojeISO } from "@/lib/utils/date";
import type { RefeicaoPlano, DiaSemana, Receita, RegistroConsumo } from "@/types/domain";

export default function PlanoPage() {
  const { user, carregando: carregandoUsuario } = useUser();
  const supabase = createClient();
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [refeicoes, setRefeicoes] = useState<RefeicaoPlano[]>([]);
  const [registrosHoje, setRegistrosHoje] = useState<RegistroConsumo[]>([]);
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [diaSelecionado, setDiaSelecionado] = useState<DiaSemana>(diaSemanaHoje);
  const [modalAberto, setModalAberto] = useState<{ dia: DiaSemana; refeicao: RefeicaoPlano | null } | null>(null);

  const diaHoje = diaSemanaHoje();

  useEffect(() => {
    if (!user) return;
    carregarPlano();
    supabase
      .from("receitas")
      .select("*")
      .order("nome", { ascending: true })
      .then(({ data }) => setReceitas((data ?? []) as Receita[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function carregarPlano() {
    if (!user) return;
    setCarregando(true);
    const { data: plano } = await supabase
      .from("planos_alimentares")
      .select("id")
      .eq("usuario_id", user.id)
      .eq("ativo", true)
      .maybeSingle();
    if (!plano) {
      setPlanoId(null);
      setRefeicoes([]);
      setRegistrosHoje([]);
      setCarregando(false);
      return;
    }
    setPlanoId(plano.id);
    const [{ data: refeicoesData }, { data: registrosData }] = await Promise.all([
      supabase
        .from("refeicoes_plano")
        .select("*")
        .eq("plano_id", plano.id)
        .order("dia_semana", { ascending: true })
        .order("ordem", { ascending: true }),
      supabase.from("registros_consumo").select("*").eq("usuario_id", user.id).eq("data", hojeISO()),
    ]);
    setRefeicoes((refeicoesData ?? []) as RefeicaoPlano[]);
    setRegistrosHoje((registrosData ?? []) as RegistroConsumo[]);
    setCarregando(false);
  }

  const refeicoesDoDia = useMemo(
    () => refeicoes.filter((r) => r.dia_semana === diaSelecionado),
    [refeicoes, diaSelecionado]
  );

  const registroPorRefeicaoId = useMemo(
    () => new Map(registrosHoje.map((r) => [r.refeicao_plano_id, r])),
    [registrosHoje]
  );

  async function salvarRefeicao(dados: DadosFormularioRefeicao) {
    if (!modalAberto || !planoId) return;
    if (modalAberto.refeicao) {
      const { data, error } = await supabase
        .from("refeicoes_plano")
        .update(dados)
        .eq("id", modalAberto.refeicao.id)
        .select()
        .single();
      if (error) return toast.erro("Erro ao salvar refeição.");
      setRefeicoes((prev) => prev.map((r) => (r.id === data.id ? (data as RefeicaoPlano) : r)));
      toast.sucesso("Refeição atualizada.");
    } else {
      const ordem = refeicoes.filter((r) => r.dia_semana === modalAberto.dia).length;
      const { data, error } = await supabase
        .from("refeicoes_plano")
        .insert({ ...dados, plano_id: planoId, dia_semana: modalAberto.dia, ordem })
        .select()
        .single();
      if (error) return toast.erro("Erro ao adicionar refeição.");
      setRefeicoes((prev) => [...prev, data as RefeicaoPlano]);
      toast.sucesso("Refeição adicionada.");
    }
    setModalAberto(null);
  }

  async function excluirRefeicao(id: string) {
    const { error } = await supabase.from("refeicoes_plano").delete().eq("id", id);
    if (error) return toast.erro("Erro ao excluir refeição.");
    setRefeicoes((prev) => prev.filter((r) => r.id !== id));
    toast.sucesso("Refeição removida.");
  }

  async function duplicarRefeicao(refeicao: RefeicaoPlano) {
    const { id: _id, criado_em: _criado, ...resto } = refeicao;
    const { data, error } = await supabase.from("refeicoes_plano").insert(resto).select().single();
    if (error) return toast.erro("Erro ao duplicar refeição.");
    setRefeicoes((prev) => [...prev, data as RefeicaoPlano]);
    toast.sucesso("Refeição duplicada.");
  }

  async function alternarConsumida(refeicao: RefeicaoPlano) {
    if (!user || diaSelecionado !== diaHoje) return;
    const hoje = hojeISO();
    const jaConsumida = registroPorRefeicaoId.has(refeicao.id);

    if (jaConsumida) {
      const { error } = await supabase
        .from("registros_consumo")
        .delete()
        .eq("usuario_id", user.id)
        .eq("data", hoje)
        .eq("refeicao_plano_id", refeicao.id);
      if (error) return toast.erro("Erro ao atualizar refeição.");
      setRegistrosHoje((prev) => prev.filter((r) => r.refeicao_plano_id !== refeicao.id));
      return;
    }

    const receita = refeicao.receita_id ? receitas.find((r) => r.id === refeicao.receita_id) : undefined;
    if (!receita) return toast.erro("Adicione uma receita a essa refeição antes de marcar como consumida.");

    const { data, error } = await supabase
      .from("registros_consumo")
      .upsert(
        {
          usuario_id: user.id,
          data: hoje,
          refeicao_plano_id: refeicao.id,
          ...montarRegistroConsumo(receita, refeicao.quantidade_porcoes || 1),
        },
        { onConflict: "usuario_id,data,refeicao_plano_id" }
      )
      .select()
      .single();
    if (error) return toast.erro("Erro ao atualizar refeição.");
    setRegistrosHoje((prev) => [...prev.filter((r) => r.refeicao_plano_id !== refeicao.id), data as RegistroConsumo]);
  }

  async function duplicarDia(diaOrigem: DiaSemana, diaDestino: DiaSemana) {
    const doDia = refeicoes.filter((r) => r.dia_semana === diaOrigem);
    if (doDia.length === 0) return toast.erro("Não há refeições para duplicar neste dia.");
    const novas = doDia.map(({ id: _id, criado_em: _criado, ...resto }) => ({
      ...resto,
      dia_semana: diaDestino,
    }));
    const { data, error } = await supabase.from("refeicoes_plano").insert(novas).select();
    if (error) return toast.erro("Erro ao duplicar o dia.");
    setRefeicoes((prev) => [...prev, ...((data ?? []) as RefeicaoPlano[])]);
    toast.sucesso(`Refeições copiadas para ${DIAS_SEMANA_LABEL[diaDestino]}.`);
  }

  async function duplicarSemanaInteira() {
    if (!planoId) return;
    const { data, error } = await supabase
      .from("planos_alimentares")
      .insert({ usuario_id: user!.id, nome: "Cópia do plano alimentar", ativo: false })
      .select()
      .single();
    if (error || !data) return toast.erro("Erro ao duplicar a semana.");
    const novasRefeicoes = refeicoes.map(({ id: _id, criado_em: _criado, ...resto }) => ({
      ...resto,
      plano_id: data.id,
    }));
    const { error: erroRefeicoes } = await supabase.from("refeicoes_plano").insert(novasRefeicoes);
    if (erroRefeicoes) return toast.erro("Plano duplicado, mas houve erro ao copiar as refeições.");
    toast.sucesso("Semana duplicada como um novo plano (inativo). Ative-o em Configurações.");
  }

  if (carregandoUsuario || carregando) {
    return <div className="py-20 text-center text-sm text-muted">Carregando seu plano...</div>;
  }

  if (!planoId) {
    return (
      <EmptyState
        icone={CalendarDays}
        titulo="Você ainda não tem um plano alimentar"
        descricao="Faça sua consulta nutricional para gerarmos um plano completo e personalizado para você."
        acao={
          <Link href="/consulta">
            <Button>Iniciar consulta nutricional</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plano Alimentar</h1>
          <p className="mt-1 text-sm text-muted">Edite, troque ou duplique qualquer refeição.</p>
        </div>
        <Button variante="secundaria" onClick={duplicarSemanaInteira}>
          <Copy className="h-4 w-4" /> Duplicar semana
        </Button>
      </div>
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-black/[0.03] p-1">
        {DIAS_SEMANA.map((dia) => (
          <button
            key={dia}
            onClick={() => setDiaSelecionado(dia)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              diaSelecionado === dia ? "bg-white text-brand-700 shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {DIAS_SEMANA_LABEL[dia]}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {refeicoesDoDia.length === 0 ? (
          <EmptyState
            icone={CalendarDays}
            titulo={`Nenhuma refeição em ${DIAS_SEMANA_LABEL[diaSelecionado]}`}
            descricao="Adicione uma refeição ou copie de outro dia da semana."
          />
        ) : (
          refeicoesDoDia.map((refeicao) => (
            <MealCard
              key={refeicao.id}
              refeicao={refeicao}
              consumida={registroPorRefeicaoId.has(refeicao.id)}
              podeAlternar={diaSelecionado === diaHoje}
              aoEditar={() => setModalAberto({ dia: diaSelecionado, refeicao })}
              aoExcluir={() => excluirRefeicao(refeicao.id)}
              aoDuplicar={() => duplicarRefeicao(refeicao)}
              aoAlternarConsumida={() => alternarConsumida(refeicao)}
            />
          ))
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variante="secundaria" onClick={() => setModalAberto({ dia: diaSelecionado, refeicao: null })}>
            <Plus className="h-4 w-4" /> Adicionar refeição
          </Button>
          {refeicoesDoDia.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value) duplicarDia(diaSelecionado, e.target.value as DiaSemana);
                e.target.value = "";
              }}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-muted"
              defaultValue=""
            >
              <option value="" disabled>
                Copiar dia para...
              </option>
              {DIAS_SEMANA.filter((d) => d !== diaSelecionado).map((dia) => (
                <option key={dia} value={dia}>
                  {DIAS_SEMANA_LABEL[dia]}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {modalAberto && (
        <MealForm
          aberto
          aoFechar={() => setModalAberto(null)}
          aoSalvar={salvarRefeicao}
          refeicaoExistente={modalAberto.refeicao}
          receitas={receitas}
        />
      )}
    </div>
  );
}
