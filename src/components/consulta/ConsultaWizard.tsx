"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Stethoscope, TrendingDown, TrendingUp, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { toast } from "@/components/ui/Toast";
import { gerarResultadoAvaliacao } from "@/lib/nutrition/calculations";
import type {
  AvaliacaoNutricional,
  CondicaoSaude,
  ConsumoAlcool,
  Genero,
  NivelAtividade,
  ObjetivoNutricional,
  StatusTabagismo,
} from "@/types/domain";

/**
 * Consulta Nutricional — anamnese completa (baseada no questionário real de
 * uma nutricionista de referência, 40 perguntas) + 6 perguntas que o app
 * precisa pra funcionar com segurança e que aquele questionário não cobria:
 * idade, gênero, situações especiais (grávida/amamentando/histórico de TA),
 * condições de saúde da PRÓPRIA pessoa (o questionário original só pergunta
 * histórico familiar), peso desejado e um campo final de observações livres.
 * Uma pergunta por vez, igual ao protótipo validado.
 */

function gerarFaixa(min: number, max: number, passo: number, sufixo: string): string[] {
  const lista: string[] = [];
  for (let v = min; v <= max; v += passo) lista.push(`${v}${sufixo}`);
  return lista;
}
const ALTURAS = gerarFaixa(140, 210, 1, " cm");
const PESOS = gerarFaixa(30, 200, 1, " kg");

const CONDICOES_SAUDE_OPCOES = [
  "Diabetes tipo 1",
  "Diabetes tipo 2",
  "Hipertensão",
  "Doença renal",
  "Hipotireoidismo",
  "Hipertireoidismo",
  "Colesterol alto",
  "Nenhuma dessas",
];
const CONDICOES_SAUDE_SLUGS: Record<string, CondicaoSaude> = {
  "Diabetes tipo 1": "diabetes_tipo1",
  "Diabetes tipo 2": "diabetes_tipo2",
  "Hipertensão": "hipertensao",
  "Doença renal": "doenca_renal",
  "Hipotireoidismo": "hipotireoidismo",
  "Hipertireoidismo": "hipertireoidismo",
  "Colesterol alto": "colesterol_alto",
};

const DOENCAS_FAMILIARES_OPCOES = [
  "Câncer", "Diabetes", "Doença cardiovascular", "Doenças autoimunes", "Doenças osteoarticulares",
  "Doenças hormonais", "Endometriose", "Hipertensão", "Hipotireoidismo", "Hipertireoidismo",
  "Obesidade", "Doença renal", "Depressão", "SOP", "Síndrome do pânico", "Transtornos alimentares",
  "Outros", "Nenhuma dessas",
];

const SITUACOES_ESPECIAIS_OPCOES = [
  "Estou grávida",
  "Estou amamentando",
  "Tenho ou já tive transtorno alimentar",
  "Nenhuma dessas situações",
];

/** Tipos de campo suportados pelo motor de perguntas. */
type TipoPergunta = "text" | "numero" | "single" | "single_detail" | "multi" | "dropdown";

interface Pergunta {
  id: number;
  campo: keyof RespostasConsulta;
  texto: string;
  hint?: string;
  tipo: TipoPergunta;
  obrigatoria: boolean;
  opcoes?: string[];
  /** Converte o rótulo exibido pro valor real salvo (ex: "Emagrecimento" -> "emagrecimento"). */
  mapa?: Record<string, string | boolean>;
  /** Pra perguntas single_detail: qual opção revela o campo de detalhe. */
  detalheObrigatorioSe?: string;
  detalhePlaceholder?: string;
  /** Placeholder pra perguntas de texto livre. */
  placeholder?: string;
}

interface RespostasConsulta {
  idade: string;
  genero: Genero | "";
  objetivo: ObjetivoNutricional | "";
  tipo_suporte_esperado: string;
  tabagismo: StatusTabagismo | "";
  consumo_alcool: ConsumoAlcool | "";
  nivel_atividade: NivelAtividade | "";
  horas_sono: string;
  qualidade_sono_categoria: string;
  insonia: boolean | null;
  medicacao_sono: string;
  disposicao_manha: string;
  disposicao_tarde: string;
  disposicao_noite: string;
  concentracao: string;
  memoria_recente: string;
  memoria_antiga: string;
  nivel_estresse_categoria: string;
  rotina_trabalho: string;
  doencas_familiares: string[];
  condicoes_saude: string[];
  restricoes_alimentares: string;
  historico_cirurgias: string;
  alergias: string;
  medicamentos_em_uso: string;
  suplementos_em_uso: string;
  dieta_anterior: string;
  ingestao_agua_copos: string;
  quem_prepara_comida: string;
  refeicao_sozinho_ou_acompanhado: string;
  horario_mais_fome: string[];
  mastigacao: string;
  alimento_favorito: string;
  alimento_rejeitado: string;
  preferencia_sabor: string[];
  frequencia_restaurante: string;
  historico_dietetico: string;
  altura_cm: string;
  peso_kg: string;
  situacoes_especiais: string[];
  peso_meta_kg: string;
  perda_peso_nao_intencional: string;
  ganho_peso_nao_intencional: string;
  como_conheceu: string;
  observacoes: string;
}

const INICIAL: RespostasConsulta = {
  idade: "", genero: "", objetivo: "", tipo_suporte_esperado: "",
  tabagismo: "", consumo_alcool: "", nivel_atividade: "", horas_sono: "", qualidade_sono_categoria: "",
  insonia: null, medicacao_sono: "", disposicao_manha: "", disposicao_tarde: "", disposicao_noite: "",
  concentracao: "", memoria_recente: "", memoria_antiga: "", nivel_estresse_categoria: "",
  rotina_trabalho: "", doencas_familiares: [], condicoes_saude: [], restricoes_alimentares: "", historico_cirurgias: "",
  alergias: "", medicamentos_em_uso: "", suplementos_em_uso: "", dieta_anterior: "",
  ingestao_agua_copos: "", quem_prepara_comida: "", refeicao_sozinho_ou_acompanhado: "",
  horario_mais_fome: [], mastigacao: "", alimento_favorito: "", alimento_rejeitado: "",
  preferencia_sabor: [], frequencia_restaurante: "", historico_dietetico: "", altura_cm: "",
  peso_kg: "", situacoes_especiais: [], peso_meta_kg: "", perda_peso_nao_intencional: "",
  ganho_peso_nao_intencional: "", como_conheceu: "", observacoes: "",
};

const PERGUNTAS: Pergunta[] = [
  { id: 3, campo: "idade", texto: "Idade", tipo: "numero", obrigatoria: true },
  { id: 4, campo: "genero", texto: "Gênero", tipo: "single", obrigatoria: true, opcoes: ["Feminino", "Masculino", "Outro"], mapa: { Feminino: "feminino", Masculino: "masculino", Outro: "outro" } },
  { id: 5, campo: "objetivo", texto: "Qual é o seu objetivo principal?", tipo: "single", obrigatoria: true,
    opcoes: ["Emagrecimento", "Manutenção do peso", "Ganho de massa muscular", "Saúde geral", "Performance esportiva"],
    mapa: { "Emagrecimento": "emagrecimento", "Manutenção do peso": "manutencao", "Ganho de massa muscular": "ganho_massa", "Saúde geral": "saude_geral", "Performance esportiva": "performance_esportiva" } },
  { id: 6, campo: "tipo_suporte_esperado", texto: "Como você acha que eu posso te auxiliar?", tipo: "single", obrigatoria: true,
    opcoes: ["Só quero um plano pra seguir sozinho(a)", "Quero acompanhamento mais de perto", "Quero entender melhor de nutrição", "Quero praticidade no dia a dia"] },
  { id: 7, campo: "tabagismo", texto: "Você é fumante?", tipo: "single", obrigatoria: true,
    opcoes: ["Não, nunca fumei.", "Atualmente não, mas um dia já fumei.", "Sim, mas estou tentando parar.", "Sim, ainda fumo."],
    mapa: { "Não, nunca fumei.": "nunca", "Atualmente não, mas um dia já fumei.": "ex_fumante", "Sim, mas estou tentando parar.": "fumante", "Sim, ainda fumo.": "fumante" } },
  { id: 8, campo: "consumo_alcool", texto: "Você consome bebida alcoólica?", tipo: "single", obrigatoria: true,
    opcoes: ["Não.", "Sim, somente aos finais de semana.", "Sim, mais de 3x por semana."],
    mapa: { "Não.": "nunca", "Sim, somente aos finais de semana.": "moderado", "Sim, mais de 3x por semana.": "frequente" } },
  { id: 9, campo: "nivel_atividade", texto: "Qual o seu nível de atividade física?", tipo: "dropdown", obrigatoria: true,
    opcoes: ["Sedentário (pouco ou nenhum exercício)", "Leve (exercício 1-3x/semana)", "Moderado (exercício 3-5x/semana)", "Intenso (exercício 6-7x/semana)", "Atleta (muito intenso)"],
    mapa: { "Sedentário (pouco ou nenhum exercício)": "sedentario", "Leve (exercício 1-3x/semana)": "leve", "Moderado (exercício 3-5x/semana)": "moderado", "Intenso (exercício 6-7x/semana)": "intenso", "Atleta (muito intenso)": "atleta" } },
  { id: 10, campo: "horas_sono", texto: "Costuma dormir quantas horas por noite?", tipo: "single", obrigatoria: true, opcoes: ["< 4 horas", "4 a 6 horas", "6 a 8 horas", "> 8 horas"] },
  { id: 11, campo: "qualidade_sono_categoria", texto: "Como você considera o seu sono?", tipo: "single", obrigatoria: true, opcoes: ["Bom", "Regular", "Ruim"] },
  { id: 12, campo: "insonia", texto: "Tem insônia?", tipo: "single", obrigatoria: true, opcoes: ["Sim", "Não"], mapa: { Sim: true, "Não": false } },
  { id: 13, campo: "medicacao_sono", texto: "Toma alguma medicação para dormir?", tipo: "single_detail", obrigatoria: true, opcoes: ["Não", "Sim"], detalheObrigatorioSe: "Sim", detalhePlaceholder: "Qual medicação?" },
  { id: 14, campo: "disposicao_manha", texto: "Como você classifica sua disposição física pela manhã?", tipo: "single", obrigatoria: true, opcoes: ["Boa", "Regular", "Ruim"] },
  { id: 15, campo: "disposicao_tarde", texto: "Como você classifica sua disposição física pela tarde?", tipo: "single", obrigatoria: true, opcoes: ["Boa", "Regular", "Ruim"] },
  { id: 16, campo: "disposicao_noite", texto: "Como você classifica sua disposição física pela noite?", tipo: "single", obrigatoria: true, opcoes: ["Boa", "Regular", "Ruim"] },
  { id: 17, campo: "concentracao", texto: "Como é a sua concentração para atividades intelectuais?", tipo: "single", obrigatoria: true, opcoes: ["Boa", "Regular", "Ruim"] },
  { id: 18, campo: "memoria_recente", texto: "Como você classifica a sua memória para fatos recentes?", tipo: "single", obrigatoria: true, opcoes: ["Boa", "Regular", "Ruim"] },
  { id: 19, campo: "memoria_antiga", texto: "Como você classifica a sua memória para fatos antigos?", tipo: "single", obrigatoria: true, opcoes: ["Boa", "Regular", "Ruim"] },
  { id: 20, campo: "nivel_estresse_categoria", texto: "Você se considera uma pessoa estressada?", tipo: "single", obrigatoria: true,
    opcoes: ["Não, nada me afeta.", "Sim, estressado e muito cansado", "Sim, estressado e muito agitado", "Sim, estressado e cansado pela manhã e agitado pela noite"] },
  { id: 21, campo: "rotina_trabalho", texto: "Como é a sua rotina de trabalho/estudos?", tipo: "text", obrigatoria: false, placeholder: "Sua resposta" },
  { id: 22, campo: "doencas_familiares", texto: "Seus familiares têm ou já tiveram algumas das doenças abaixo:", hint: "Seleção múltipla", tipo: "multi", obrigatoria: true, opcoes: DOENCAS_FAMILIARES_OPCOES },
  { id: 23, campo: "condicoes_saude", texto: "E você mesmo(a) — tem ou já teve alguma dessas condições de saúde?", hint: "Seleção múltipla", tipo: "multi", obrigatoria: true, opcoes: CONDICOES_SAUDE_OPCOES },
  { id: 100, campo: "restricoes_alimentares", texto: "Você segue alguma dieta ou restrição alimentar específica?", tipo: "single_detail", obrigatoria: true, opcoes: ["Não tenho nenhuma", "Sim, tenho"], detalheObrigatorioSe: "Sim, tenho", detalhePlaceholder: "Vegetariano, vegano, sem glúten, sem lactose..." },
  { id: 24, campo: "historico_cirurgias", texto: "Já passou por algum tipo de cirurgia?", tipo: "single_detail", obrigatoria: true, opcoes: ["Não", "Sim"], detalheObrigatorioSe: "Sim", detalhePlaceholder: "Qual cirurgia e quando?" },
  { id: 25, campo: "alergias", texto: "Tem alergia ou intolerância alimentar?", tipo: "single_detail", obrigatoria: true, opcoes: ["Não tenho nenhuma", "Sim, tenho"], detalheObrigatorioSe: "Sim, tenho", detalhePlaceholder: "Descreva qual(is) alimento(s) — ex: amendoim, lactose, frutos do mar..." },
  { id: 26, campo: "medicamentos_em_uso", texto: "Faz uso de algum medicamento atualmente?", tipo: "single_detail", obrigatoria: true, opcoes: ["Não", "Sim"], detalheObrigatorioSe: "Sim", detalhePlaceholder: "Quais medicamentos e em quais horários?" },
  { id: 27, campo: "suplementos_em_uso", texto: "Faz uso de algum suplemento alimentar atualmente?", tipo: "single_detail", obrigatoria: true, opcoes: ["Não", "Sim"], detalheObrigatorioSe: "Sim", detalhePlaceholder: "Quais suplementos?" },
  { id: 28, campo: "dieta_anterior", texto: "Você já seguiu alguma dieta antes?", tipo: "single_detail", obrigatoria: true, opcoes: ["Não", "Sim"], detalheObrigatorioSe: "Sim", detalhePlaceholder: "O que deu certo ou não deu certo?" },
  { id: 29, campo: "ingestao_agua_copos", texto: "Quantos copos de água (~250ml) você bebe por dia, em média?", hint: "Ex: se você toma 1 garrafa de 510ml, conte como 2 copos.", tipo: "numero", obrigatoria: true },
  { id: 30, campo: "quem_prepara_comida", texto: "Você costuma preparar a sua própria comida?", tipo: "single", obrigatoria: true, opcoes: ["Sim, eu mesmo(a) preparo", "Não, outra pessoa prepara"] },
  { id: 31, campo: "refeicao_sozinho_ou_acompanhado", texto: "Você costuma comer sozinho ou acompanhado?", tipo: "single", obrigatoria: true, opcoes: ["Sozinho", "Acompanhado"] },
  { id: 32, campo: "horario_mais_fome", texto: "Em qual horário você mais sente fome?", hint: "Seleção múltipla", tipo: "multi", obrigatoria: true, opcoes: ["Manhã", "Tarde", "Noite", "Madrugada"] },
  { id: 33, campo: "mastigacao", texto: "Sobre sua mastigação, você a considera:", tipo: "single", obrigatoria: true,
    opcoes: ["Lenta, sempre termino por último.", "Normal, aprecio a comida com atenção plena.", "Rápida demais, sempre termino primeiro."] },
  { id: 34, campo: "alimento_favorito", texto: "Qual alimento você considera indispensável, seu favorito?", tipo: "text", obrigatoria: false, placeholder: "Sua resposta" },
  { id: 35, campo: "alimento_rejeitado", texto: "Tem algum alimento que você não come de jeito nenhum?", tipo: "text", obrigatoria: false, placeholder: "Sua resposta" },
  { id: 36, campo: "preferencia_sabor", texto: "Qual é a sua preferência alimentar?", hint: "Seleção múltipla", tipo: "multi", obrigatoria: true, opcoes: ["Doce", "Salgado", "Azedo", "Amargo"] },
  { id: 37, campo: "frequencia_restaurante", texto: "Com que frequência você frequenta restaurantes / bares / delivery?", tipo: "single", obrigatoria: true,
    opcoes: ["Não tenho esse costume", "1 a 2 vezes por semana", "3 a 4 vezes por semana", "Sempre"] },
  { id: 38, campo: "historico_dietetico", texto: "Histórico dietético — conte sobre suas refeições por dia, o que costuma comer e as quantidades.", hint: "Ex: Almoço = 3 colheres de arroz + feijão + filé de tilápia + salada", tipo: "text", obrigatoria: true, placeholder: "Sua resposta" },
  { id: 39, campo: "altura_cm", texto: "Altura", hint: "Selecione na lista", tipo: "dropdown", obrigatoria: true, opcoes: ALTURAS },
  { id: 40, campo: "peso_kg", texto: "Peso atual", hint: "Selecione na lista", tipo: "dropdown", obrigatoria: true, opcoes: PESOS },
  { id: 41, campo: "situacoes_especiais", texto: "Alguma dessas situações se aplica a você agora?", hint: "Seleção múltipla", tipo: "multi", obrigatoria: true, opcoes: SITUACOES_ESPECIAIS_OPCOES },
  { id: 42, campo: "peso_meta_kg", texto: "Peso desejado (kg)", tipo: "numero", obrigatoria: false },
  { id: 43, campo: "perda_peso_nao_intencional", texto: "Teve perda de peso recente e não intencional?", tipo: "single_detail", obrigatoria: true, opcoes: ["Não", "Sim"], detalheObrigatorioSe: "Sim", detalhePlaceholder: "Quantos quilos e em quanto tempo?" },
  { id: 44, campo: "ganho_peso_nao_intencional", texto: "Teve ganho de peso recente e não intencional?", tipo: "single_detail", obrigatoria: true, opcoes: ["Não", "Sim"], detalheObrigatorioSe: "Sim", detalhePlaceholder: "Quantos quilos e em quanto tempo?" },
  { id: 45, campo: "como_conheceu", texto: "Como você me conheceu?", tipo: "single", obrigatoria: false,
    opcoes: ["Indicação de familiar/amigo", "Instagram", "Facebook", "Site", "Google", "Indicação de profissional da saúde"] },
  { id: 46, campo: "observacoes", texto: "Algo mais que sua nutricionista virtual deveria saber?", tipo: "text", obrigatoria: false, placeholder: "Ex: trabalho por turnos, viajo bastante a trabalho, cozinho pouco durante a semana..." },
];

function paraLista(texto: string): string[] {
  return texto.split(",").map((s) => s.trim()).filter(Boolean);
}
function numeroDaFaixa(valor: string): number {
  return Number(valor.replace(/[^\d.]/g, ""));
}

/** Numa consulta de retorno, pré-preenche os campos que existem tanto na
 *  avaliação anterior quanto no novo formulário — os campos novos (que o
 *  questionário de 40 perguntas trouxe) começam em branco mesmo assim. */
function estadoInicialDe(anterior: AvaliacaoNutricional | null): RespostasConsulta {
  const base = { ...INICIAL };
  if (!anterior) return base;
  return {
    ...base,
    idade: String(anterior.idade),
    genero: anterior.genero,
    objetivo: anterior.objetivo,
    tabagismo: anterior.tabagismo ?? "",
    consumo_alcool: anterior.consumo_alcool ?? "",
    nivel_atividade: anterior.nivel_atividade,
    condicoes_saude: anterior.condicoes_saude,
    restricoes_alimentares: anterior.restricoes_alimentares.join(", "),
    alergias: anterior.alergias.join(", "),
    medicamentos_em_uso: anterior.medicamentos_em_uso.join(", "),
    altura_cm: `${anterior.altura_cm} cm`,
    peso_kg: `${anterior.peso_kg} kg`,
    peso_meta_kg: anterior.peso_meta_kg != null ? String(anterior.peso_meta_kg) : "",
    // Sinalizadores de segurança não carregam automaticamente — a situação
    // pode ter mudado desde a última consulta, então perguntamos de novo.
    situacoes_especiais: [],
  };
}

export function ConsultaWizard({
  avaliacaoAnterior,
}: {
  avaliacaoAnterior: AvaliacaoNutricional | null;
}) {
  const router = useRouter();
  const retorno = Boolean(avaliacaoAnterior);
  const [indice, setIndice] = useState(-1); // -1 = intro
  const [respostas, setRespostas] = useState<RespostasConsulta>(() => estadoInicialDe(avaliacaoAnterior));
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<null | {
    observacoes: string;
    avisos: string[];
    resumo: string;
    avisoMetaPeso: string | null;
  }>(null);

  const pergunta = indice >= 0 && indice < PERGUNTAS.length ? PERGUNTAS[indice] : null;

  function set<K extends keyof RespostasConsulta>(campo: K, valor: RespostasConsulta[K]) {
    setRespostas((prev) => ({ ...prev, [campo]: valor }));
  }

  const podeVerPreview =
    Number(respostas.peso_kg && numeroDaFaixa(respostas.peso_kg)) > 0 &&
    Number(respostas.altura_cm && numeroDaFaixa(respostas.altura_cm)) > 0 &&
    Number(respostas.idade) > 0 &&
    !!respostas.genero;

  const preview = useMemo(() => {
    if (!podeVerPreview) return null;
    try {
      return gerarResultadoAvaliacao({
        pesoKg: numeroDaFaixa(respostas.peso_kg),
        alturaCm: numeroDaFaixa(respostas.altura_cm),
        idade: Number(respostas.idade),
        genero: respostas.genero as Genero,
        nivelAtividade: (respostas.nivel_atividade || "leve") as NivelAtividade,
        objetivo: (respostas.objetivo || "manutencao") as ObjetivoNutricional,
        gestante: respostas.situacoes_especiais.includes("Estou grávida"),
        lactante: respostas.situacoes_especiais.includes("Estou amamentando"),
        historicoTranstornoAlimentar: respostas.situacoes_especiais.includes("Tenho ou já tive transtorno alimentar"),
        condicoesSaude: respostas.condicoes_saude.map((l) => CONDICOES_SAUDE_SLUGS[l]).filter(Boolean) as CondicaoSaude[],
        restricoesAlimentares: paraLista(respostas.restricoes_alimentares),
        pesoMetaKg: respostas.peso_meta_kg ? Number(respostas.peso_meta_kg) : null,
      });
    } catch {
      return null;
    }
  }, [respostas, podeVerPreview]);

  const diffPeso = useMemo(() => {
    if (!avaliacaoAnterior || !respostas.peso_kg) return null;
    const diferenca = numeroDaFaixa(respostas.peso_kg) - avaliacaoAnterior.peso_kg;
    return Math.round(diferenca * 10) / 10;
  }, [avaliacaoAnterior, respostas.peso_kg]);

  function respondida(p: Pergunta): boolean {
    const valor = respostas[p.campo];
    if (p.tipo === "single_detail") {
      const label = escolhas[p.id];
      if (!p.obrigatoria) return true;
      if (!label) return false;
      if (label === p.detalheObrigatorioSe) return typeof valor === "string" && valor.trim().length > 0;
      return true;
    }
    if (!p.obrigatoria) return true;
    if (p.tipo === "multi") return Array.isArray(valor) && valor.length > 0;
    if (p.tipo === "single" || p.tipo === "dropdown") return !!escolhas[p.id];
    if (p.tipo === "numero") return valor !== "" && valor !== null && Number(valor) > 0;
    return typeof valor === "string" && valor.trim().length > 0;
  }

  function validarPerguntaAtual(): string | null {
    if (!pergunta) return null;
    if (pergunta.campo === "idade" && respostas.idade && Number(respostas.idade) < 18) {
      return "O Nutri em Casa é destinado a maiores de 18 anos. Menores de idade devem buscar acompanhamento nutricional presencial com um profissional especializado.";
    }
    if (!respondida(pergunta)) {
      return pergunta.tipo === "multi" ? "Selecione ao menos uma opção pra continuar." : "Essa pergunta é obrigatória — responda pra continuar.";
    }
    return null;
  }

  function avancar() {
    const erro = validarPerguntaAtual();
    if (erro) {
      toast.erro(erro);
      return;
    }
    if (indice + 1 >= PERGUNTAS.length) {
      finalizarConsulta();
      return;
    }
    setIndice((i) => i + 1);
  }
  function voltar() {
    setIndice((i) => Math.max(-1, i - 1));
  }

  function escolherSingle(p: Pergunta, label: string) {
    setEscolhas((prev) => ({ ...prev, [p.id]: label }));
    const valorReal = p.mapa ? p.mapa[label] : label;
    set(p.campo, valorReal as never);
  }

  function escolherSingleDetail(p: Pergunta, label: string) {
    setEscolhas((prev) => ({ ...prev, [p.id]: label }));
    if (label !== p.detalheObrigatorioSe) set(p.campo, "" as never);
  }

  function escolherMulti(p: Pergunta, label: string, marcado: boolean) {
    const opcaoNenhuma = p.opcoes?.find((o) => o.toLowerCase().startsWith("nenhuma"));
    setRespostas((prev) => {
      const atual = (prev[p.campo] as string[]) ?? [];
      let novo: string[];
      if (marcado) {
        if (opcaoNenhuma && label === opcaoNenhuma) {
          novo = [label];
        } else {
          novo = [...atual.filter((v) => v !== opcaoNenhuma), label];
        }
      } else {
