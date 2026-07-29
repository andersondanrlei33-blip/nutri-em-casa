"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Opcoes {
  ordenarPor?: string;
  ascendente?: boolean;
  filtro?: Record<string, string | number | boolean>;
}

/**
 * Hook genérico de CRUD sobre uma tabela do Supabase filtrada por
 * usuário. Usado pelos módulos de acompanhamento (peso, medidas, água,
 * sono, humor, exercícios) e metas, que compartilham o mesmo padrão de
 * "listar / criar / editar / excluir / duplicar" registros do usuário.
 */
export function useSupabaseTable<T extends { id: string }>(
  tabela: string,
  usuarioId: string | undefined,
  opcoes: Opcoes = {}
) {
  const [itens, setItens] = useState<T[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const supabase = createClient();

  const recarregar = useCallback(async () => {
    if (!usuarioId) return;
    setCarregando(true);
    setErro(null);

    let query = supabase.from(tabela).select("*").eq("usuario_id", usuarioId);
    if (opcoes.filtro) {
      for (const [chave, valor] of Object.entries(opcoes.filtro)) {
        query = query.eq(chave, valor);
      }
    }
    query = query.order(opcoes.ordenarPor ?? "data", { ascending: opcoes.ascendente ?? false });

    const { data, error } = await query;
    if (error) setErro(error.message);
    setItens((data ?? []) as T[]);
    setCarregando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId, tabela]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const criar = useCallback(
    async (registro: Partial<T>) => {
      if (!usuarioId) return { error: "Usuário não autenticado" };
      const { data, error } = await supabase
        .from(tabela)
        .insert({ ...registro, usuario_id: usuarioId } as never)
        .select()
        .single();
      if (!error) setItens((prev) => [data as T, ...prev]);
      return { data, error: error?.message ?? null };
    },
    [tabela, usuarioId, supabase]
  );

  const atualizar = useCallback(
    async (id: string, alteracoes: Partial<T>) => {
      const { data, error } = await supabase
        .from(tabela)
        .update(alteracoes as never)
        .eq("id", id)
        .select()
        .single();
      if (!error) setItens((prev) => prev.map((item) => (item.id === id ? (data as T) : item)));
      return { data, error: error?.message ?? null };
    },
    [tabela, supabase]
  );

  const excluir = useCallback(
    async (id: string) => {
      const { error } = await supabase.from(tabela).delete().eq("id", id);
      if (!error) setItens((prev) => prev.filter((item) => item.id !== id));
      return { error: error?.message ?? null };
    },
    [tabela, supabase]
  );

  const duplicar = useCallback(
    async (id: string) => {
      const original = itens.find((item) => item.id === id);
      if (!original) return { error: "Registro não encontrado" };
      const { id: _descartado, ...resto } = original as Record<string, unknown>;
      return criar(resto as Partial<T>);
    },
    [itens, criar]
  );

  return { itens, carregando, erro, criar, atualizar, excluir, duplicar, recarregar };
}
