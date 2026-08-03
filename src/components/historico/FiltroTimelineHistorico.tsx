"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ListFilter, Stethoscope, Scale, Dumbbell, Ruler, Moon, Smile } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatarData } from "@/lib/utils/date";

export type TipoEventoHistorico = "consulta" | "peso" | "medidas" | "exercicio" | "sono" | "humor";

/** Evento da linha do tempo do Histórico — montado em page.tsx (Server
 *  Component, tem acesso ao Supabase) e passado pra cá só com dados
 *  serializáveis. De propósito SEM o componente do ícone aqui dentro:
 *  função/componente não pode atravessar a fronteira Server -> Client
 *  Component como prop (só como children/JSX já renderizado) — o ícone é
 *  resolvido a partir de `tipo` via ICONE_TIPO, dentro deste componente
 *  client, que já é o lugar certo pra isso. */
export interface EventoHistorico {
  data: string;
  titulo: string;
  descricao: string;
  tipo: TipoEventoHistorico;
  href?: string;
}

const ICONE_TIPO: Record<TipoEventoHistorico, typeof Stethoscope> = {
  consulta: Stethoscope,
  peso: Scale,
  medidas: Ruler,
  exercicio: Dumbbell,
  sono: Moon,
  humor: Smile,
};

/** Rótulo curto de cada tipo de evento, usado nos chips de filtro — a lista
 *  de chips exibida é só a interseção com os tipos que realmente aparecem
 *  em `eventos` (ver `tiposPresentes` abaixo), pra nunca mostrar um filtro
 *  vazio, tipo "Sono" quando o paciente nunca registrou sono. */
const ROTULO_TIPO: Record<TipoEventoHistorico, string> = {
  consulta: "Consultas",
  peso: "Peso",
  medidas: "Medidas",
  exercicio: "Exercício",
  sono: "Sono",
  humor: "Humor",
};

/** Filtro por tipo de evento (múltipla escolha) sobre a linha do tempo do
 *  Histórico — os dados já vêm todos carregados do servidor (page.tsx), o
 *  filtro é só client-side em memória, então a troca é instantânea, sem
 *  ida ao servidor. Todos os tipos começam marcados (mostrando tudo, igual
 *  ao comportamento antigo da tela). */
export function FiltroTimelineHistorico({ eventos }: { eventos: EventoHistorico[] }) {
  const tiposPresentes = useMemo(() => {
    const vistos = new Set<TipoEventoHistorico>();
    for (const e of eventos) vistos.add(e.tipo);
    // Ordem fixa (não a ordem de aparição), pra os chips não pularem de
    // lugar toda vez que a lista de eventos muda.
    return (Object.keys(ROTULO_TIPO) as TipoEventoHistorico[]).filter((t) => vistos.has(t));
  }, [eventos]);

  const [tiposSelecionados, setTiposSelecionados] = useState<Set<TipoEventoHistorico>>(
    () => new Set(tiposPresentes)
  );

  function alternarTipo(tipo: TipoEventoHistorico) {
    setTiposSelecionados((prev) => {
      const jaMarcado = prev.has(tipo);
      // Nunca deixa zerar a seleção: clicar no último chip ainda marcado não
      // faz nada, em vez de desmarcar tudo e cair numa tela em branco sem
      // nenhum jeito óbvio de voltar (era isso que parecia "botão quebrado"
      // — clicar e a lista simplesmente sumir).
      if (jaMarcado && prev.size === 1) return prev;
      const novo = new Set(prev);
      if (jaMarcado) novo.delete(tipo);
      else novo.add(tipo);
      return novo;
    });
  }

  const todosMarcados = tiposSelecionados.size === tiposPresentes.length;
  const eventosFiltrados = eventos.filter((e) => tiposSelecionados.has(e.tipo));

  if (eventos.length === 0) {
    return (
      <EmptyState
        icone={ListFilter}
        titulo="Ainda não há histórico"
        descricao="À medida que você usa o app, seus eventos importantes aparecerão aqui."
      />
    );
  }

  return (
    <div>
      {tiposPresentes.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTiposSelecionados(new Set(tiposPresentes))}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              todosMarcados
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-border bg-white text-muted hover:bg-black/[0.02]"
            }`}
          >
            Todos
          </button>
          {tiposPresentes.map((tipo) => {
            const marcado = tiposSelecionados.has(tipo);
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => alternarTipo(tipo)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  marcado
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-border bg-white text-muted hover:bg-black/[0.02]"
                }`}
              >
                {ROTULO_TIPO[tipo]}
              </button>
            );
          })}
        </div>
      )}

      {eventosFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted">
            Nenhum evento desse tipo por aqui ainda.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border">
            {eventosFiltrados.map((evento, i) => {
              const Icone = ICONE_TIPO[evento.tipo];
              const conteudo = (
                <>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <Icone className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{evento.titulo}</p>
                    <p className="text-xs text-muted">{evento.descricao}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatarData(evento.data, "dd/MM/yyyy 'às' HH:mm")}</p>
                  </div>
                  {evento.href && <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted" />}
                </>
              );

              return evento.href ? (
                <Link
                  key={i}
                  href={evento.href}
                  className="-mx-1 flex gap-3 rounded-lg px-1 py-4 transition-colors first:pt-0 last:pb-0 hover:bg-black/[0.02]"
                >
                  {conteudo}
                </Link>
              ) : (
                <div key={i} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  {conteudo}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

