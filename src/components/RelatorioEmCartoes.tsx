import { CheckCircle2, ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import type { EvolucaoMetrica, RelatorioConsulta } from "@/types/domain";

/**
 * Renderiza o relatório de consulta em cartões (resumo geral, composição
 * corporal, pontos fortes, pontos de atenção, condições de saúde, hábitos de
 * vida, alimentação, prioridades e mensagem final — ver RelatorioConsulta em
 * types/domain.ts e montarRelatorioConsulta em lib/nutrition/calculations.ts).
 *
 * Componente único, usado tanto na tela de resultado logo após finalizar a
 * consulta (ConsultaWizard.tsx) quanto na tela de detalhe de uma consulta
 * antiga (app/historico/[id]/page.tsx) — as duas telas mostram o mesmo dado
 * (avaliacao.relatorio), então usam o mesmo componente, pra nunca ficarem
 * divergentes uma da outra de novo.
 */
export function RelatorioEmCartoes({ relatorio }: { relatorio: RelatorioConsulta }) {
  return (
    <div className="mt-4 space-y-4 text-left">
      {relatorio.resumoGeral && (
        <div className="rounded-xl bg-black/[0.02] px-4 py-4 text-sm leading-relaxed text-foreground">
          <p>{relatorio.resumoGeral}</p>
        </div>
      )}

      {relatorio.composicaoCorporal && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Composição Corporal</h3>
          <div className="rounded-xl border border-border bg-white px-4 py-3.5 text-sm text-foreground">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                <strong>% de gordura:</strong> {relatorio.composicaoCorporal.percentualGordura}%
                {" "}({relatorio.composicaoCorporal.classificacaoPercentualGordura})
              </span>
              {relatorio.composicaoCorporal.massaMagraKg != null && (
                <span><strong>Massa magra:</strong> {relatorio.composicaoCorporal.massaMagraKg} kg</span>
              )}
              {relatorio.composicaoCorporal.massaGordaKg != null && (
                <span><strong>Massa gorda:</strong> {relatorio.composicaoCorporal.massaGordaKg} kg</span>
              )}
            </div>
            {relatorio.composicaoCorporal.textoComparativo && (
              <p className="mt-2.5 leading-relaxed text-muted">{relatorio.composicaoCorporal.textoComparativo}</p>
            )}
          </div>
        </div>
      )}

      {relatorio.evolucaoComposicaoCorporal && relatorio.evolucaoComposicaoCorporal.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
            Evolução desde a última avaliação
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {relatorio.evolucaoComposicaoCorporal.map((metrica) => (
              <CartaoEvolucaoMetrica key={metrica.chave} metrica={metrica} />
            ))}
          </div>
        </div>
      )}

      {relatorio.pontosFortes.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
            O que você já faz muito bem
          </h3>
          <ul className="space-y-2">
            {relatorio.pontosFortes.map((texto, i) => (
              <li key={i} className="flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>{texto}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {relatorio.pontosAtencao.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Pontos que merecem mais atenção
          </h3>
          <ul className="space-y-1.5">
            {relatorio.pontosAtencao.map((ponto) => (
              <li key={ponto.chave} className="flex items-center gap-2.5 rounded-lg bg-amber-50 px-3.5 py-2 text-sm text-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-white">
                  {ponto.prioridade}
                </span>
                {ponto.titulo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {relatorio.condicoesSaude.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Condições de Saúde</h3>
          <div className="space-y-2">
            {relatorio.condicoesSaude.map((c) => (
              <BlocoTexto key={c.chave} titulo={c.titulo} texto={c.texto} corBorda="border-red-300" bg="bg-red-50/60" />
            ))}
          </div>
        </div>
      )}

      {relatorio.habitosVida.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Hábitos de Vida</h3>
          <div className="space-y-2">
            {relatorio.habitosVida.map((h) => (
              <BlocoTexto key={h.chave} titulo={h.titulo} texto={h.texto} corBorda="border-amber-300" bg="bg-amber-50/60" />
            ))}
          </div>
        </div>
      )}

      {relatorio.alimentacao && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Alimentação</h3>
          <div className="rounded-xl bg-black/[0.02] px-4 py-4 text-sm leading-relaxed text-foreground">
            <p>{relatorio.alimentacao}</p>
          </div>
        </div>
      )}

      {relatorio.prioridades.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Próximas Prioridades</h3>
          <div className="rounded-xl bg-black/[0.02] px-4 py-4">
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-foreground">
              {relatorio.prioridades.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {relatorio.mensagemFinal && (
        <div className="rounded-xl bg-brand-50 px-4 py-4 text-sm italic leading-relaxed text-brand-800">
          {relatorio.mensagemFinal}
        </div>
      )}
    </div>
  );
}

/** Cores por tendência — mesma paleta semântica usada no resto do relatório
 *  (verde = pontos fortes, âmbar = atenção), com vermelho adicionado só
 *  aqui pra "desfavoravel" (nenhum outro cartão do relatório usa vermelho,
 *  então isso automaticamente chama mais atenção quando aparece). */
const CORES_TENDENCIA_EVOLUCAO: Record<
  EvolucaoMetrica["tendencia"],
  { badgeBg: string; badgeText: string; barra: string; rotulo: string }
> = {
  favoravel: { badgeBg: "bg-green-50", badgeText: "text-green-700", barra: "bg-green-500", rotulo: "melhora" },
  estavel: { badgeBg: "bg-amber-50", badgeText: "text-amber-700", barra: "bg-amber-400", rotulo: "estável" },
  desfavoravel: { badgeBg: "bg-red-50", badgeText: "text-red-700", barra: "bg-red-500", rotulo: "atenção" },
};

function IconeSetaVariacao({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUp className="h-3 w-3" />;
  if (delta < 0) return <ArrowDown className="h-3 w-3" />;
  return <ArrowRight className="h-3 w-3" />;
}

/** Um cartão comparativo de uma métrica (peso, % de gordura, massa magra ou
 *  massa gorda) entre a consulta anterior e a atual — barra horizontal
 *  simples (sem biblioteca externa) mostrando os dois valores lado a lado,
 *  seta de tendência, variação absoluta e a interpretação clínica em texto.
 *  Ver EvolucaoMetrica em types/domain.ts e montarEvolucaoComposicaoCorporal
 *  em lib/nutrition/calculations.ts. */
function CartaoEvolucaoMetrica({ metrica }: { metrica: EvolucaoMetrica }) {
  const cor = CORES_TENDENCIA_EVOLUCAO[metrica.tendencia];
  const maiorValor = Math.max(metrica.valorAnterior, metrica.valorAtual, 0.0001);
  const larguraAnterior = (metrica.valorAnterior / maiorValor) * 100;
  const larguraAtual = (metrica.valorAtual / maiorValor) * 100;
  const sinalDelta = metrica.deltaAbsoluto > 0 ? "+" : "";

  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3.5 text-sm text-foreground">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs text-muted">{metrica.rotulo}</span>
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cor.badgeBg} ${cor.badgeText}`}
        >
          <IconeSetaVariacao delta={metrica.deltaAbsoluto} />
          {cor.rotulo}
        </span>
      </div>

      <div className="mb-2.5 flex flex-wrap items-baseline gap-1.5">
        <span className="text-xs text-muted">
          {metrica.valorAnterior}
          {metrica.unidade}
        </span>
        <ArrowRight className="h-3 w-3 text-muted" />
        <span className="text-lg font-bold">
          {metrica.valorAtual}
          {metrica.unidade}
        </span>
        <span className={`ml-1 text-xs font-medium ${cor.badgeText}`}>
          {sinalDelta}
          {metrica.deltaAbsoluto}
          {metrica.unidade}
        </span>
      </div>

      <div className="mb-2.5 flex flex-col gap-1" aria-hidden="true">
        <div className="h-1.5 rounded-full bg-black/[0.04]">
          <div className="h-1.5 rounded-full bg-black/20" style={{ width: `${larguraAnterior}%` }} />
        </div>
        <div className="h-1.5 rounded-full bg-black/[0.04]">
          <div className={`h-1.5 rounded-full ${cor.barra}`} style={{ width: `${larguraAtual}%` }} />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted">{metrica.interpretacao}</p>
    </div>
  );
}

function BlocoTexto({
  titulo,
  texto,
  corBorda,
  bg,
}: {
  titulo: string;
  texto: string;
  corBorda: string;
  bg: string;
}) {
  return (
    <div className={`rounded-r-xl border-l-4 ${corBorda} ${bg} px-4 py-3`}>
      <p className="mb-1 text-sm font-semibold text-foreground">{titulo}</p>
      <p className="text-sm leading-relaxed text-foreground">{texto}</p>
    </div>
  );
}
