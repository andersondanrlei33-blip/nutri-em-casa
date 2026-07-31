"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Stethoscope, TrendingDown, TrendingUp, ShieldAlert, CheckCircle2 } from "lucide-react";
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
  RelatorioConsulta,
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
/** Caminho inverso do mapa acima — usado só pra pré-preencher a pergunta de
 *  condições de saúde numa consulta de retorno (o banco guarda o slug, a
 *  pergunta usa o rótulo). */
const CONDICOES_SAUDE_LABELS: Record<CondicaoSaude, string> = {
  diabetes_tipo1: "Diabetes tipo 1",
  diabetes_tipo2: "Diabetes tipo 2",
  hipertensao: "Hipertensão",
  doenca_renal: "Doença renal",
  hipotireoidismo: "Hipotireoidismo",
  hipertireoidismo: "Hipertireoidismo",
  colesterol_alto: "Colesterol alto",
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
/** Opções de "situações especiais" que só fazem sentido pra quem pode
 *  engravidar/amamentar — não exibidas quando o paciente marcou gênero
 *  masculino na pergunta anterior. */
const OPCOES_SO_GESTACAO = ["Estou grávida", "Estou amamentando"];
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
  { id: 46, campo: "observacoes", texto: "Algo mais que sua nutricionista virtual deveria saber?", tipo: "text", obrigatoria: false, placeholder: "Ex: trabalho por turnos, viajo bastante a trabalho, cozinho pouco durante a semana..." },
  { id: 45, campo: "como_conheceu", texto: "Como você me conheceu?", tipo: "single", obrigatoria: false,
    opcoes: ["Indicação de familiar/amigo", "Instagram", "Facebook", "Site", "Google", "Indicação de profissional da saúde"] },
];
function paraLista(texto: string): string[] {
  return texto.split(",").map((s) => s.trim()).filter(Boolean);
}
function numeroDaFaixa(valor: string): number {
  return Number(valor.replace(/[^\d.]/g, ""));
}
/** Numa consulta de retorno, pré-preenche TODOS os campos que existem tanto
 *  na avaliação anterior quanto no formulário atual — não só os básicos
 *  (peso/altura/idade/gênero), mas a anamnese inteira, pra a pessoa não
 *  precisar responder de novo o que já respondeu da última vez. Só ficam de
 *  fora, de propósito:
 *   - situações especiais (grávida/amamentando/histórico de TA) e as duas
 *     perguntas de mudança de peso recente: são sobre "agora"/"desde a
 *     última consulta", então sempre perguntamos de novo em vez de assumir
 *     que continua igual;
 *   - observações livres: texto solto que faz mais sentido nascer em
 *     branco a cada consulta.
 *  Sono e estresse são guardados no banco só como número (qualidade_sono,
 *  nivel_estresse), não como o rótulo da pergunta — aqui reconstruímos o
 *  rótulo mais provável. Nível 4 de estresse e "fumante" têm duas frases
 *  diferentes que geram o mesmo valor salvo; nesses casos assumimos a
 *  primeira, e a pessoa corrige com um clique se não bater exatamente. */
function estadoInicialDe(anterior: AvaliacaoNutricional | null): RespostasConsulta {
  const base = { ...INICIAL };
  if (!anterior) return base;
  const qualidadeSonoLabel =
    anterior.qualidade_sono === 4 ? "Bom" : anterior.qualidade_sono === 3 ? "Regular" : anterior.qualidade_sono === 2 ? "Ruim" : "";
  const nivelEstresseLabel =
    anterior.nivel_estresse === 1
      ? "Não, nada me afeta."
      : anterior.nivel_estresse === 4
        ? "Sim, estressado e muito cansado"
        : anterior.nivel_estresse === 5
          ? "Sim, estressado e cansado pela manhã e agitado pela noite"
          : "";
  return {
    ...base,
    idade: String(anterior.idade),
    genero: anterior.genero,
    objetivo: anterior.objetivo,
    tipo_suporte_esperado: anterior.tipo_suporte_esperado ?? "",
    tabagismo: anterior.tabagismo ?? "",
    consumo_alcool: anterior.consumo_alcool ?? "",
    nivel_atividade: anterior.nivel_atividade,
    horas_sono: anterior.horas_sono ?? "",
    qualidade_sono_categoria: qualidadeSonoLabel,
    insonia: anterior.insonia,
    medicacao_sono: anterior.medicacao_sono ?? "",
    disposicao_manha: anterior.disposicao_manha ?? "",
    disposicao_tarde: anterior.disposicao_tarde ?? "",
    disposicao_noite: anterior.disposicao_noite ?? "",
    concentracao: anterior.concentracao ?? "",
    memoria_recente: anterior.memoria_recente ?? "",
    memoria_antiga: anterior.memoria_antiga ?? "",
    nivel_estresse_categoria: nivelEstresseLabel,
    rotina_trabalho: anterior.rotina_trabalho ?? "",
    doencas_familiares: anterior.doencas_familiares,
    condicoes_saude: anterior.condicoes_saude.map((slug) => CONDICOES_SAUDE_LABELS[slug]).filter(Boolean),
    restricoes_alimentares: anterior.restricoes_alimentares.join(", "),
    historico_cirurgias: anterior.historico_cirurgias ?? "",
    alergias: anterior.alergias.join(", "),
    medicamentos_em_uso: anterior.medicamentos_em_uso.join(", "),
    suplementos_em_uso: anterior.suplementos_em_uso ?? "",
    dieta_anterior: anterior.dieta_anterior ?? "",
    ingestao_agua_copos: anterior.ingestao_agua_copos ?? "",
    quem_prepara_comida: anterior.quem_prepara_comida ?? "",
    refeicao_sozinho_ou_acompanhado: anterior.refeicao_sozinho_ou_acompanhado ?? "",
    horario_mais_fome: anterior.horario_mais_fome,
    mastigacao: anterior.mastigacao ?? "",
    alimento_favorito: anterior.preferencias_alimentares[0] ?? "",
    alimento_rejeitado: anterior.alimentos_evitados[0] ?? "",
    preferencia_sabor: anterior.preferencia_sabor,
    frequencia_restaurante: anterior.frequencia_restaurante ?? "",
    historico_dietetico: anterior.historico_dietetico ?? "",
    altura_cm: `${anterior.altura_cm} cm`,
    peso_kg: `${anterior.peso_kg} kg`,
    peso_meta_kg: anterior.peso_meta_kg != null ? String(anterior.peso_meta_kg) : "",
    como_conheceu: anterior.como_conheceu ?? "",
    // Sinalizadores de segurança e mudanças recentes de peso não carregam
    // automaticamente — a situação pode ter mudado desde a última consulta,
    // então perguntamos de novo em vez de assumir que continua igual.
    situacoes_especiais: [],
    perda_peso_nao_intencional: "",
    ganho_peso_nao_intencional: "",
  };
}
/** A partir do estado de respostas já pré-preenchido (ver estadoInicialDe),
 *  monta o mapa id-da-pergunta -> rótulo exibido, pra que os botões de
 *  seleção única/dropdown/detalhe já apareçam marcados numa consulta de
 *  retorno — sem isso, o texto ficava pré-preenchido "por baixo" mas a tela
 *  não mostrava nenhuma opção destacada, dando a impressão de pergunta em
 *  branco. Perguntas do tipo "multi" não passam por aqui (usam o array de
 *  respostas direto). "Mudança de peso recente" fica de fora de propósito,
 *  pelo mesmo motivo do estadoInicialDe: não é uma resposta antiga, é uma
 *  pergunta sobre agora. */
function escolhasIniciaisDe(respostas: RespostasConsulta): Record<number, string> {
  const escolhas: Record<number, string> = {};
  for (const pergunta of PERGUNTAS) {
    if (pergunta.tipo === "multi" || pergunta.tipo === "text" || pergunta.tipo === "numero") continue;
    if (pergunta.campo === "perda_peso_nao_intencional" || pergunta.campo === "ganho_peso_nao_intencional") continue;
    const valor = respostas[pergunta.campo];
    if (pergunta.tipo === "single_detail") {
      if (!pergunta.detalheObrigatorioSe || !pergunta.opcoes) continue;
      const temDetalhe = typeof valor === "string" && valor.trim().length > 0;
      escolhas[pergunta.id] = temDetalhe
        ? pergunta.detalheObrigatorioSe
        : (pergunta.opcoes.find((o) => o !== pergunta.detalheObrigatorioSe) ?? pergunta.opcoes[0]);
      continue;
    }
    // single / dropdown
    if (pergunta.mapa) {
      const label = Object.entries(pergunta.mapa).find(([, v]) => v === valor)?.[0];
      if (label) escolhas[pergunta.id] = label;
    } else if (typeof valor === "string" && valor && pergunta.opcoes?.includes(valor)) {
      escolhas[pergunta.id] = valor;
    }
  }
  return escolhas;
}
export function ConsultaWizard({
  avaliacaoAnterior,
  nomePaciente,
}: {
  avaliacaoAnterior: AvaliacaoNutricional | null;
  /** Nome completo do paciente — usado só pra identificar de quem é a
   *  condição de saúde na lista de "Pontos que merecem mais atenção",
   *  já que o app às vezes é revisado por outra pessoa (ex: nutricionista
   *  acompanhando vários pacientes) e o nome evita qualquer ambiguidade
   *  em algo tão sensível quanto diabetes/hipertensão/etc. */
  nomePaciente?: string | null;
}) {
  const router = useRouter();
  const retorno = Boolean(avaliacaoAnterior);
  const [indice, setIndice] = useState(-1); // -1 = intro
  const [respostas, setRespostas] = useState<RespostasConsulta>(() => estadoInicialDe(avaliacaoAnterior));
  const [escolhas, setEscolhas] = useState<Record<number, string>>(() => escolhasIniciaisDe(estadoInicialDe(avaliacaoAnterior)));
  const [enviando, setEnviando] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<null | {
    observacoes: string;
    avisos: string[];
    resumo: string;
    avisoMetaPeso: string | null;
    relatorio: RelatorioConsulta | null;
  }>(null);
  const pergunta = indice >= 0 && indice < PERGUNTAS.length ? PERGUNTAS[indice] : null;
  function set<K extends keyof RespostasConsulta>(campo: K, valor: RespostasConsulta[K]) {
    setRespostas((prev) => ({ ...prev, [campo]: valor }));
  }
  // Opções da pergunta atual, já filtradas pro contexto do paciente — hoje
  // só usada pra tirar "Estou grávida"/"Estou amamentando" de quem marcou
  // gênero masculino, mas serve de ponto único caso surjam outros casos
  // parecidos no futuro.
  const opcoesPergunta = useMemo(() => {
    if (!pergunta?.opcoes) return pergunta?.opcoes;
    if (pergunta.campo === "situacoes_especiais" && respostas.genero === "masculino") {
      return pergunta.opcoes.filter((o) => !OPCOES_SO_GESTACAO.includes(o));
    }
    return pergunta.opcoes;
  }, [pergunta, respostas.genero]);
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
    // Gênero masculino não deveria carregar respostas de gravidez/amamentação
    // de uma tentativa anterior — limpa junto, sem esperar o paciente voltar
    // na pergunta de situações especiais pra corrigir manualmente.
    if (p.campo === "genero" && valorReal === "masculino") {
      setRespostas((prev) => ({
        ...prev,
        genero: valorReal as Genero,
        situacoes_especiais: prev.situacoes_especiais.filter((s) => !OPCOES_SO_GESTACAO.includes(s)),
      }));
      return;
    }
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
        novo = atual.filter((v) => v !== label);
      }
      return { ...prev, [p.campo]: novo };
    });
  }
  /** Monta o payload pra API a partir do estado de respostas — traduz rótulos
   *  em valores reais, mescla campos correlatos (ex: alimento favorito entra
   *  na mesma lista de preferências usada pelo gerador de plano) e converte
   *  os campos "single_detail" (Não/Sim + detalhe) em texto simples. */
  function montarPayload() {
    const preferenciasAlimentares = [respostas.alimento_favorito].filter((s) => s.trim());
    const alimentosEvitados = [respostas.alimento_rejeitado].filter((s) => s.trim());
    const medicamentos = paraLista(respostas.medicamentos_em_uso);
    if (respostas.medicacao_sono.trim()) medicamentos.push(respostas.medicacao_sono.trim());
    return {
      peso_kg: numeroDaFaixa(respostas.peso_kg),
      altura_cm: numeroDaFaixa(respostas.altura_cm),
      idade: Number(respostas.idade),
      genero: respostas.genero as Genero,
      nivel_atividade: respostas.nivel_atividade as NivelAtividade,
      objetivo: respostas.objetivo as ObjetivoNutricional,
      peso_meta_kg: respostas.peso_meta_kg ? Number(respostas.peso_meta_kg) : null,
      restricoes_alimentares: paraLista(respostas.restricoes_alimentares),
      alergias: paraLista(respostas.alergias),
      condicoes_saude: respostas.condicoes_saude.map((l) => CONDICOES_SAUDE_SLUGS[l]).filter(Boolean),
      condicoes_saude_outras: null as string | null,
      medicamentos_em_uso: medicamentos,
      consumo_alcool: respostas.consumo_alcool as ConsumoAlcool,
      tabagismo: respostas.tabagismo as StatusTabagismo,
      refeicoes_por_dia: 4,
      preferencias_alimentares: preferenciasAlimentares,
      alimentos_evitados: alimentosEvitados,
      qualidade_sono: respostas.qualidade_sono_categoria === "Bom" ? 4 : respostas.qualidade_sono_categoria === "Regular" ? 3 : respostas.qualidade_sono_categoria === "Ruim" ? 2 : null,
      nivel_estresse:
        respostas.nivel_estresse_categoria === "Não, nada me afeta." ? 1 :
        respostas.nivel_estresse_categoria === "Sim, estressado e cansado pela manhã e agitado pela noite" ? 5 :
        respostas.nivel_estresse_categoria ? 4 : null,
      observacoes: respostas.observacoes || null,
      gestante: respostas.situacoes_especiais.includes("Estou grávida"),
      lactante: respostas.situacoes_especiais.includes("Estou amamentando"),
      historico_transtorno_alimentar: respostas.situacoes_especiais.includes("Tenho ou já tive transtorno alimentar"),
      profissao: null,
      tipo_suporte_esperado: respostas.tipo_suporte_esperado || null,
      horas_sono: respostas.horas_sono || null,
      insonia: respostas.insonia,
      medicacao_sono: respostas.medicacao_sono || null,
      disposicao_manha: respostas.disposicao_manha || null,
      disposicao_tarde: respostas.disposicao_tarde || null,
      disposicao_noite: respostas.disposicao_noite || null,
      concentracao: respostas.concentracao || null,
      memoria_recente: respostas.memoria_recente || null,
      memoria_antiga: respostas.memoria_antiga || null,
      rotina_trabalho: respostas.rotina_trabalho || null,
      doencas_familiares: respostas.doencas_familiares,
      historico_cirurgias: respostas.historico_cirurgias || null,
      suplementos_em_uso: respostas.suplementos_em_uso || null,
      dieta_anterior: respostas.dieta_anterior || null,
      ingestao_agua_copos: respostas.ingestao_agua_copos || null,
      quem_prepara_comida: respostas.quem_prepara_comida || null,
      refeicao_sozinho_ou_acompanhado: respostas.refeicao_sozinho_ou_acompanhado || null,
      horario_mais_fome: respostas.horario_mais_fome,
      mastigacao: respostas.mastigacao || null,
      preferencia_sabor: respostas.preferencia_sabor,
      frequencia_restaurante: respostas.frequencia_restaurante || null,
      historico_dietetico: respostas.historico_dietetico || null,
      perda_peso_nao_intencional: respostas.perda_peso_nao_intencional || null,
      ganho_peso_nao_intencional: respostas.ganho_peso_nao_intencional || null,
      como_conheceu: respostas.como_conheceu || null,
    };
  }
  async function finalizarConsulta() {
    setEnviando(true);
    try {
      const resposta = await fetch("/api/gerar-plano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(montarPayload()),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao gerar o plano.");
      setResultadoFinal({
        observacoes: dados.observacoesNutricionista,
        avisos: dados.avisos ?? [],
        resumo: dados.resumoConsulta ?? "",
        avisoMetaPeso: dados.avisoMetaPeso ?? null,
        relatorio: dados.relatorio ?? null,
      });
      toast.sucesso("Sua consulta foi concluída com sucesso!");
    } catch (erro) {
      toast.erro(erro instanceof Error ? erro.message : "Erro inesperado.");
    } finally {
      setEnviando(false);
    }
  }
  if (resultadoFinal) {
    return (
      <Card className="mx-auto max-w-xl animate-fade-in-up">
        <CardContent className="text-center py-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
            <Stethoscope className="h-6 w-6 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {retorno ? "Consulta de retorno concluída!" : "Consulta concluída!"}
          </h2>
          {retorno && diffPeso !== null && diffPeso !== 0 && (
            <p
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
                diffPeso < 0 ? "bg-success-500/10 text-success-500" : "bg-brand-50 text-brand-700"
              }`}
            >
              {diffPeso < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              {diffPeso < 0
                ? `Você perdeu ${Math.abs(diffPeso)} kg desde a última consulta`
                : `Você ganhou ${diffPeso} kg desde a última consulta`}
            </p>
          )}
          {resultadoFinal.avisoMetaPeso && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-left text-sm text-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-500" />
              <p>{resultadoFinal.avisoMetaPeso}</p>
            </div>
          )}
          {preview && (
            <div className="mt-4 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
              <Metrica label="IMC" valor={preview.imc.toString()} sub={preview.classificacaoImc} />
              <Metrica label="TMB" valor={`${preview.tmb} kcal`} />
              <Metrica label="TDEE" valor={`${preview.tdee} kcal`} />
              <Metrica label="Meta calórica" valor={`${preview.metaCalorica} kcal`} />
            </div>
          )}
          {resultadoFinal.relatorio ? (
            <RelatorioEmCartoes relatorio={resultadoFinal.relatorio} nomePaciente={nomePaciente} />
          ) : (
            resultadoFinal.resumo && (
              <div className="mt-4 space-y-3 rounded-xl bg-black/[0.02] px-4 py-4 text-left text-sm leading-relaxed text-foreground">
                {resultadoFinal.resumo.split("\n\n").map((paragrafo, i) => (
                  <p key={i}>{paragrafo}</p>
                ))}
              </div>
            )
          )}
          <p className="mt-5 text-sm text-muted">{resultadoFinal.observacoes}</p>
          {retorno && (
            <p className="mt-2 text-xs text-muted">
              Seu plano alimentar anterior foi substituído por um novo, ajustado a esses dados.
            </p>
          )}
          <Button className="mt-6" onClick={() => router.push("/plano")}>
            Ver meu plano alimentar
          </Button>
        </CardContent>
      </Card>
    );
  }
  // ---- Tela de intro ----
  if (indice === -1) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardContent className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
              <Stethoscope className="h-6 w-6 text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {retorno ? "Consulta de Retorno" : "Consulta Nutricional"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              Uma pergunta por vez, baseada na anamnese completa de uma nutricionista. As com{" "}
              <span className="text-danger-500 font-medium">*</span> são obrigatórias — o resto você pode deixar em branco.
            </p>
            <Button className="mt-6" onClick={() => setIndice(0)}>
              Começar consulta
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!pergunta) return null;
  const progresso = Math.round(((indice + 1) / PERGUNTAS.length) * 100);
  const opcaoAtual = escolhas[pergunta.id];
  const mostrarDetalhe = pergunta.tipo === "single_detail" && opcaoAtual === pergunta.detalheObrigatorioSe;
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5 h-1.5 rounded-full bg-black/10">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progresso}%` }} />
      </div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
        Pergunta {indice + 1} de {PERGUNTAS.length}
      </p>
      <Card>
        <CardContent className="py-8 animate-fade-in-up">
          <h2 className="text-base font-semibold leading-snug text-foreground">
            {pergunta.texto} {pergunta.obrigatoria && <span className="text-danger-500">*</span>}
            {!pergunta.obrigatoria && <span className="ml-1 text-xs font-normal text-muted">(opcional)</span>}
          </h2>
          {pergunta.hint && <p className="mt-1 text-xs text-muted">{pergunta.hint}</p>}
          <div className="mt-5">
            {pergunta.tipo === "text" && (
              <Textarea
                placeholder={pergunta.placeholder}
                value={(respostas[pergunta.campo] as string) ?? ""}
                onChange={(e) => set(pergunta.campo, e.target.value as never)}
              />
            )}
            {pergunta.tipo === "numero" && (
              <Input
                type="number"
                min={pergunta.campo === "idade" ? 18 : 1}
                step={pergunta.campo === "peso_meta_kg" ? "0.1" : "1"}
                value={(respostas[pergunta.campo] as string) ?? ""}
                onChange={(e) => set(pergunta.campo, e.target.value as never)}
              />
            )}
            {pergunta.tipo === "dropdown" && (
              <Select
                value={opcaoAtual ?? ""}
                onChange={(e) => escolherSingle(pergunta, e.target.value)}
              >
                <option value="" disabled>Selecione...</option>
                {opcoesPergunta?.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </Select>
            )}
            {pergunta.tipo === "single" && (
              <div className="flex flex-col gap-2">
                {opcoesPergunta?.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => escolherSingle(pergunta, o)}
                    className={`rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${
                      opcaoAtual === o
                        ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                        : "border-border bg-white text-foreground hover:bg-black/[0.02]"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            {pergunta.tipo === "single_detail" && (
              <>
                <div className="flex flex-col gap-2">
                  {opcoesPergunta?.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => escolherSingleDetail(pergunta, o)}
                      className={`rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${
                        opcaoAtual === o
                          ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                          : "border-border bg-white text-foreground hover:bg-black/[0.02]"
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                {mostrarDetalhe && (
                  <div className="mt-3">
                    <Textarea
                      placeholder={pergunta.detalhePlaceholder ?? "Descreva..."}
                      value={(respostas[pergunta.campo] as string) ?? ""}
                      onChange={(e) => set(pergunta.campo, e.target.value as never)}
                    />
                  </div>
                )}
              </>
            )}
            {pergunta.tipo === "multi" && (
              <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-white p-3 sm:grid-cols-2 max-h-72 overflow-y-auto">
                {opcoesPergunta?.map((o) => (
                  <label key={o} htmlFor={`q${pergunta.id}-${o}`} className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                    <input
                      id={`q${pergunta.id}-${o}`}
                      type="checkbox"
                      checked={((respostas[pergunta.campo] as string[]) ?? []).includes(o)}
                      onChange={(e) => escolherMulti(pergunta, o, e.target.checked)}
                      className="h-4 w-4 rounded border-border text-brand-500 focus:ring-2 focus:ring-brand-400"
                    />
                    {o}
                  </label>
                ))}
              </div>
            )}
            {pergunta.campo === "peso_meta_kg" && preview?.avisoMetaPeso && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-danger-500/30 bg-danger-500/10 px-3 py-2.5 text-xs text-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-500" />
                {preview.avisoMetaPeso}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="mt-5 flex items-center justify-between">
        <Button variante="secundaria" onClick={voltar}>
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button onClick={avancar} carregando={enviando}>
          {indice + 1 >= PERGUNTAS.length ? (enviando ? "Gerando seu plano..." : "Finalizar consulta") : (
            <>Próxima <ChevronRight className="h-4 w-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}
function RelatorioEmCartoes({
  relatorio,
  nomePaciente,
}: {
  relatorio: RelatorioConsulta;
  nomePaciente?: string | null;
}) {
  return (
    <div className="mt-4 space-y-4 text-left">
      {relatorio.resumoGeral && (
        <div className="rounded-xl bg-black/[0.02] px-4 py-4 text-sm leading-relaxed text-foreground">
          <p>{relatorio.resumoGeral}</p>
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
                {ponto.categoria === "condicao_saude" && nomePaciente && (
                  <span className="text-muted"> — {nomePaciente}</span>
                )}
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

function Metrica({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-black/[0.02] px-3 py-2.5 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-base font-semibold text-foreground">{valor}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
