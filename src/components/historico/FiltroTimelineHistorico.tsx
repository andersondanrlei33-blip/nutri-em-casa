"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ListFilter, Stethoscope, Scale, Dumbbell, Ruler, Moon, Smile } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";
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

/** Rótulo curto de cada tipo de evento, usado no dropdown de filtro — a
 *  lista de opções exibida é só a interseção com os tipos que realmente
 *  aparecem em `eventos` (ver `tiposPresentes` abaixo), pra nunca mostrar
 *  um filtro vazio, tipo "Sono" quando o paciente nunca registrou sono. */
const ROTULO_TIPO: Record<TipoEventoHistorico, string> = {
  consulta: "Consultas",
  peso: "Peso",
  medidas: "Medidas",
  exercicio: "Exercício",
  sono: "Sono",
  humor: "Humor",
};

/** Filtro por tipo de evento sobre a linha do tempo do Histórico — dropdown
 *  de escolha única, no mesmo padrão do filtro de categoria da tela de
 *  Receitas (que já funciona bem). Antes era um grupo de chips de múltipla
 *  escolha; trocado porque dava pra desmarcar tudo e cair numa lista vazia
 *  sem indicação clara de como voltar — um <select> nativo sempre tem
 *  exatamente uma opção marcada, então esse estado nunca acontece. Os
 *  dados já vêm todos carregados do servidor (page.tsx), o filtro é só
 *  client-side em memória, então a troca é instantânea, sem ida ao
 *  servidor. */
export function FiltroTimelineHistorico({ eventos }: { eventos: EventoHistorico[] }) {
  const tiposPresentes = useMemo(() => {
    const vistos = new Set<TipoEventoHistorico>();
    for (const e of eventos) vistos.add(e.tipo);
    // Ordem fixa (não a ordem de aparição), pra as opções não pularem de
    // lugar toda vez que a lista de eventos muda.
    return (Object.keys(ROTULO_TIPO) as TipoEventoHistorico[]).filter((t) => vistos.has(t));
  }, [eventos]);

  const [tipoSelecionado, setTipoSelecionado] = useState<TipoEventoHistorico | "todos">("todos");

  const eventosFiltrados =
    tipoSelecionado === "todos" ? eventos : eventos.filter((e) => e.tipo === tipoSelecionado);

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
        <div className="mb-4">
          <Select
            value={tipoSelecionado}
            onChange={(e) => setTipoSelecionado(e.target.value as TipoEventoHistorico | "todos")}
            className="w-auto"
          >
            <option value="todos">Todos os eventos</option>
            {tiposPresentes.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULO_TIPO[tipo]}
              </option>
            ))}
          </Select>
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

