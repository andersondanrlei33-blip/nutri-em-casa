import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatarData } from "../utils/date.ts";
import type { RelatorioConsulta, EvolucaoMetrica } from "../../types/domain.ts";

/**
 * Documento PDF da consulta — espelha o visual dos cartões mostrados na tela
 * de resultado da consulta e no Histórico (ver components/RelatorioEmCartoes
 * .tsx), adaptado pros componentes próprios do @react-pdf/renderer (não são
 * elementos HTML/CSS de verdade, são primitivos próprios que geram o PDF
 * diretamente). Cores copiadas de src/app/globals.css — como o renderer do
 * PDF não lê CSS variables nem Tailwind, os valores hexadecimais precisam
 * estar escritos aqui.
 *
 * Uma única <Page> com `wrap` (padrão): o react-pdf quebra pra uma nova
 * página sozinho quando o conteúdo não cabe, então as seções abaixo ficam
 * como blocos irmãos em sequência, sem eu decidir manualmente onde cortar
 * cada página.
 */

const CORES = {
  foreground: "#16241f",
  muted: "#6b7a75",
  border: "#e3e9e6",
  fundoPagina: "#ffffff",
  fundoCard: "#f8faf9",
  brand50: "#eefbf3",
  brand600: "#178757",
  brand700: "#146c47",
  brand800: "#14563b",
  amber50: "#fffbeb",
  amber700: "#b45309",
  red50: "#fef2f2",
  red700: "#b91c1c",
  green50: "#f0fdf4",
  green700: "#15803d",
};

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 36,
    paddingVertical: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: CORES.foreground,
    backgroundColor: CORES.fundoPagina,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  titulo: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitulo: { fontSize: 9, color: CORES.muted, marginTop: 2 },
  secao: { marginTop: 12 },
  secaoTitulo: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  metricasGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  metricaCard: { width: "23%", backgroundColor: CORES.fundoCard, borderRadius: 8, padding: 8, marginRight: "2.6%", marginBottom: 8 },
  metricaLabel: { fontSize: 7.5, color: CORES.muted },
  metricaValor: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  paragrafo: { fontSize: 9.5, lineHeight: 1.42, color: CORES.foreground },
  cardBase: { borderRadius: 8, padding: 10, marginBottom: 5 },
  cardBranco: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: CORES.border },
  cardTitulo: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  listaItem: { flexDirection: "row", marginBottom: 5, alignItems: "flex-start" },
  bullet: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: CORES.amber700,
    color: "#ffffff",
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 3,
    marginRight: 8,
  },
});

// Mesma paleta e mesmas cores de barra usadas em CartaoEvolucaoMetrica no
// RelatorioEmCartoes.tsx (bg-green-500/amber-400/red-500) — hex copiados
// diretamente da paleta padrão do Tailwind, já que o PDF não lê classes CSS.
const CORES_TENDENCIA: Record<EvolucaoMetrica["tendencia"], { bg: string; texto: string; rotulo: string; barra: string }> = {
  favoravel: { bg: CORES.green50, texto: CORES.green700, rotulo: "melhora", barra: "#22c55e" },
  estavel: { bg: CORES.amber50, texto: CORES.amber700, rotulo: "estável", barra: "#fbbf24" },
  desfavoravel: { bg: CORES.red50, texto: CORES.red700, rotulo: "atenção", barra: "#ef4444" },
};

export interface RelatorioConsultaPDFProps {
  nomePaciente: string;
  dataConsulta: string;
  retorno: boolean;
  pesoKg: number;
  imc: number;
  classificacaoImc: string;
  tmb: number;
  tdee: number;
  metaCalorica: number;
  metaProteinaG: number;
  metaCarboidratoG: number;
  metaGorduraG: number;
  metaAguaMl: number;
  /** Consultas salvas antes da coluna `relatorio` existir não têm esse
   *  objeto — nesse caso o PDF cai pro conteúdo antigo (ver props abaixo),
   *  o mesmo fallback que a tela de detalhe do Histórico já usa. */
  relatorio: RelatorioConsulta | null;
  /** Texto corrido salvo antes do relatório em cartões existir
   *  (avaliacao.resumo ?? avaliacao.ajuste_seguranca). Só usado quando
   *  `relatorio` é null. */
  textoResumoAntigo?: string | null;
  /** Dados da avaliação física (laudo) já normalizados e salvos na própria
   *  consulta — também só usado no fallback, quando não há `relatorio`. */
  avaliacaoFisicaAntiga?: { percentualGordura: number; classificacaoAvaliador: string | null; resumoTexto: string | null } | null;
}

export function RelatorioConsultaPDF({
  nomePaciente,
  dataConsulta,
  retorno,
  pesoKg,
  imc,
  classificacaoImc,
  tmb,
  tdee,
  metaCalorica,
  metaProteinaG,
  metaCarboidratoG,
  metaGorduraG,
  metaAguaMl,
  relatorio,
  textoResumoAntigo,
  avaliacaoFisicaAntiga,
}: RelatorioConsultaPDFProps) {
  return (
    <Document title={`Consulta - ${nomePaciente} - ${formatarData(dataConsulta, "dd-MM-yyyy")}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.titulo}>{retorno ? "Consulta de Retorno" : "Consulta Nutricional"}</Text>
            <Text style={styles.subtitulo}>{nomePaciente}</Text>
          </View>
          <Text style={styles.subtitulo}>{formatarData(dataConsulta, "dd/MM/yyyy")}</Text>
        </View>

        <View style={styles.metricasGrid}>
          <MetricaCard label="Peso" valor={`${pesoKg} kg`} />
          <MetricaCard label="IMC" valor={`${imc}`} sub={classificacaoImc} />
          <MetricaCard label="TMB" valor={`${tmb} kcal`} />
          <MetricaCard label="TDEE" valor={`${tdee} kcal`} />
          <MetricaCard label="Meta calórica" valor={`${metaCalorica} kcal`} />
          <MetricaCard label="Proteína" valor={`${metaProteinaG}g`} />
          <MetricaCard label="Carboidrato" valor={`${metaCarboidratoG}g`} />
          <MetricaCard label="Gordura" valor={`${metaGorduraG}g`} />
          <MetricaCard label="Água" valor={`${(metaAguaMl / 1000).toFixed(1)} L`} />
        </View>

        {!relatorio && (
          <>
            {avaliacaoFisicaAntiga && (
              <View style={styles.secao} wrap={false}>
                <Text style={styles.secaoTitulo}>Avaliação física</Text>
                <View style={[styles.cardBase, styles.cardBranco]}>
                  <Text style={styles.paragrafo}>
                    % de gordura: {avaliacaoFisicaAntiga.percentualGordura}%
                    {avaliacaoFisicaAntiga.classificacaoAvaliador ? ` (${avaliacaoFisicaAntiga.classificacaoAvaliador})` : ""}
                  </Text>
                  {avaliacaoFisicaAntiga.resumoTexto && (
                    <Text style={[styles.paragrafo, { color: CORES.muted, marginTop: 6 }]}>
                      {avaliacaoFisicaAntiga.resumoTexto}
                    </Text>
                  )}
                </View>
              </View>
            )}
            {textoResumoAntigo && (
              <View style={styles.secao} wrap={false}>
                <Text style={styles.secaoTitulo}>Resumo da consulta</Text>
                {textoResumoAntigo.split("\n\n").map((paragrafo, i) => (
                  <Text key={i} style={[styles.paragrafo, { marginBottom: 6 }]}>
                    {paragrafo}
                  </Text>
                ))}
              </View>
            )}
            {!avaliacaoFisicaAntiga && !textoResumoAntigo && (
              <View style={styles.secao} wrap={false}>
                <Text style={[styles.paragrafo, { color: CORES.muted }]}>
                  Essa consulta é de antes do relatório detalhado existir no app — só os números acima ficaram
                  registrados.
                </Text>
              </View>
            )}
          </>
        )}

        {relatorio && (
        <>
        {relatorio.resumoGeral && (
          <View style={styles.secao} wrap={false}>
            <Text style={styles.secaoTitulo}>Resumo geral</Text>
            <Text style={styles.paragrafo}>{relatorio.resumoGeral}</Text>
          </View>
        )}

        {/* Sem wrap={false} aqui de propósito — o texto comparativo do laudo
         *  pode ser longo (vários parágrafos), e travar o bloco inteiro
         *  numa página só deixava um vão enorme em branco no fim da página
         *  anterior sempre que ele não cabia inteiro. Deixando o React-PDF
         *  quebrar o texto no meio, o conteúdo flui contínuo, igual a
         *  rolagem da tela do Histórico. */}
        {relatorio.composicaoCorporal && (
          <View style={styles.secao}>
            <Text style={styles.secaoTitulo}>Composição corporal</Text>
            <View style={[styles.cardBase, styles.cardBranco]}>
              <Text style={styles.paragrafo}>
                % de gordura: {relatorio.composicaoCorporal.percentualGordura}% (
                {relatorio.composicaoCorporal.classificacaoPercentualGordura})
                {relatorio.composicaoCorporal.massaMagraKg != null &&
                  `   Massa magra: ${relatorio.composicaoCorporal.massaMagraKg} kg`}
                {relatorio.composicaoCorporal.massaGordaKg != null &&
                  `   Massa gorda: ${relatorio.composicaoCorporal.massaGordaKg} kg`}
              </Text>
              {relatorio.composicaoCorporal.textoComparativo && (
                <Text style={[styles.paragrafo, { color: CORES.muted, marginTop: 6 }]}>
                  {relatorio.composicaoCorporal.textoComparativo}
                </Text>
              )}
            </View>
          </View>
        )}

        {relatorio.evolucaoComposicaoCorporal && relatorio.evolucaoComposicaoCorporal.length > 0 && (
          <View style={styles.secao}>
            <Text style={styles.secaoTitulo}>Evolução desde a última avaliação</Text>
            {relatorio.evolucaoComposicaoCorporal.map((m) => (
              <CartaoEvolucao key={m.chave} metrica={m} />
            ))}
          </View>
        )}

        {relatorio.pontosFortes.length > 0 && (
          <View style={styles.secao}>
            <Text style={[styles.secaoTitulo, { color: CORES.brand700 }]}>O que você já faz muito bem</Text>
            {relatorio.pontosFortes.map((texto, i) => (
              <View key={i} style={[styles.cardBase, { backgroundColor: CORES.brand50 }]} wrap={false}>
                <Text style={styles.paragrafo}>{texto}</Text>
              </View>
            ))}
          </View>
        )}

        {relatorio.pontosAtencao.length > 0 && (
          <View style={styles.secao}>
            <Text style={[styles.secaoTitulo, { color: CORES.amber700 }]}>Pontos que merecem mais atenção</Text>
            {relatorio.pontosAtencao.map((ponto) => (
              <View key={ponto.chave} style={styles.listaItem} wrap={false}>
                <Text style={styles.bullet}>{ponto.prioridade}</Text>
                <Text style={[styles.paragrafo, { flex: 1 }]}>{ponto.titulo}</Text>
              </View>
            ))}
          </View>
        )}

        {relatorio.condicoesSaude.length > 0 && (
          <View style={styles.secao}>
            <Text style={styles.secaoTitulo}>Condições de saúde</Text>
            {relatorio.condicoesSaude.map((c) => (
              <BlocoTexto key={c.chave} titulo={c.titulo} texto={c.texto} corFundo={CORES.red50} />
            ))}
          </View>
        )}

        {relatorio.habitosVida.length > 0 && (
          <View style={styles.secao}>
            <Text style={styles.secaoTitulo}>Hábitos de vida</Text>
            {relatorio.habitosVida.map((h) => (
              <BlocoTexto key={h.chave} titulo={h.titulo} texto={h.texto} corFundo={CORES.amber50} />
            ))}
          </View>
        )}

        {relatorio.alimentacao && (
          <View style={styles.secao} wrap={false}>
            <Text style={styles.secaoTitulo}>Alimentação</Text>
            <Text style={styles.paragrafo}>{relatorio.alimentacao}</Text>
          </View>
        )}

        {relatorio.prioridades.length > 0 && (
          <View style={styles.secao} wrap={false}>
            <Text style={styles.secaoTitulo}>Próximas prioridades</Text>
            {relatorio.prioridades.map((p, i) => (
              <Text key={i} style={[styles.paragrafo, { marginBottom: 3 }]}>
                {i + 1}. {p}
              </Text>
            ))}
          </View>
        )}

        {relatorio.mensagemFinal && (
          <View style={[styles.cardBase, { backgroundColor: CORES.brand50, marginTop: 16 }]} wrap={false}>
            <Text style={[styles.paragrafo, { fontFamily: "Helvetica-Oblique", color: CORES.brand800 }]}>
              {relatorio.mensagemFinal}
            </Text>
          </View>
        )}
        </>
        )}
      </Page>
    </Document>
  );
}

function MetricaCard({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <View style={styles.metricaCard}>
      <Text style={styles.metricaLabel}>{label}</Text>
      <Text style={styles.metricaValor}>{valor}</Text>
      {sub && <Text style={styles.metricaLabel}>{sub}</Text>}
    </View>
  );
}

function CartaoEvolucao({ metrica }: { metrica: EvolucaoMetrica }) {
  const cor = CORES_TENDENCIA[metrica.tendencia];
  const sinal = metrica.deltaAbsoluto > 0 ? "+" : "";
  // Mesma conta de largura de barra do CartaoEvolucaoMetrica em
  // RelatorioEmCartoes.tsx: as duas barras (anterior e atual) são relativas
  // ao maior dos dois valores, pra dar a mesma leitura visual "antes vs.
  // depois" que a tela do Histórico mostra.
  const maiorValor = Math.max(metrica.valorAnterior, metrica.valorAtual, 0.0001);
  const larguraAnterior = `${(metrica.valorAnterior / maiorValor) * 100}%`;
  const larguraAtual = `${(metrica.valorAtual / maiorValor) * 100}%`;
  return (
    <View style={[styles.cardBase, styles.cardBranco]} wrap={false}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Text style={[styles.paragrafo, { color: CORES.muted, fontSize: 8 }]}>{metrica.rotulo}</Text>
        <Text
          style={{
            fontSize: 8,
            fontFamily: "Helvetica-Bold",
            color: cor.texto,
            backgroundColor: cor.bg,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 8,
          }}
        >
          {cor.rotulo}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 6 }}>
        <Text style={[styles.paragrafo, { fontSize: 8, color: CORES.muted }]}>
          {metrica.valorAnterior}
          {metrica.unidade}
        </Text>
        {/* A fonte padrão do PDF (Helvetica) não tem o glifo "→" — vira um
         *  caractere quebrado. ">" é ASCII puro, sempre renderiza certo. */}
        <Text style={[styles.paragrafo, { fontSize: 8, color: CORES.muted, marginHorizontal: 4 }]}>{">"}</Text>
        <Text style={[styles.paragrafo, { fontSize: 12, fontFamily: "Helvetica-Bold" }]}>
          {metrica.valorAtual}
          {metrica.unidade}
        </Text>
        <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: cor.texto, marginLeft: 5 }}>
          {sinal}
          {metrica.deltaAbsoluto}
          {metrica.unidade}
        </Text>
      </View>
      <View style={{ marginBottom: 6 }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: "#00000010", marginBottom: 3 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: "#00000033", width: larguraAnterior }} />
        </View>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: "#00000010" }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: cor.barra, width: larguraAtual }} />
        </View>
      </View>
      <Text style={[styles.paragrafo, { fontSize: 8.5, color: CORES.muted }]}>{metrica.interpretacao}</Text>
    </View>
  );
}

function BlocoTexto({ titulo, texto, corFundo }: { titulo: string; texto: string; corFundo: string }) {
  return (
    <View style={[styles.cardBase, { backgroundColor: corFundo }]} wrap={false}>
      <Text style={styles.cardTitulo}>{titulo}</Text>
      <Text style={styles.paragrafo}>{texto}</Text>
    </View>
  );
}

