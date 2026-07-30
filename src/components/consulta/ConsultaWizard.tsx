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
  { id: 11, campo:
