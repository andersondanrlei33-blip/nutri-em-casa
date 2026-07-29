/**
 * Motor de cálculo nutricional — Nutri em Casa
 *
 * Funções puras, sem dependências externas, cobrindo:
 *  - IMC (Índice de Massa Corporal)
 *  - TMB (Taxa Metabólica Basal) — Mifflin-St Jeor
 *  - TDEE (Gasto Energético Diário Total)
 *  - Metas calóricas por objetivo
 *  - Distribuição de macronutrientes (proteína, carboidrato, gordura, fibra)
 *  - Água recomendada
 *
 * Mantidas isoladas de I/O para serem 100% testáveis e reutilizáveis tanto
 * no cliente (preview instantâneo durante a consulta) quanto no servidor
 * (geração oficial do plano, salva no banco).
 */

import type { CondicaoSaude, ConsumoAlcool, Genero, NivelAtividade, ObjetivoNutricional, StatusTabagismo } from "../../types/domain.ts";
import { normalizar } from "./receitaMatching.ts";

export interface DadosAntropometricos {
  pesoKg: number;
  alturaCm: number;
  idade: number;
  genero: Genero;
}

const FATOR_ATIVIDADE: Record<NivelAtividade, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  atleta: 1.9,
};

/** IMC = peso (kg) / altura (m)^2 */
export function calcularIMC({ pesoKg, alturaCm }: DadosAntropometricos): number {
  if (pesoKg <= 0 || alturaCm <= 0) {
    throw new Error("Peso e altura devem ser maiores que zero.");
  }
  const alturaM = alturaCm / 100;
  return arredondar(pesoKg / (alturaM * alturaM), 1);
}

export function classificarIMC(imc: number): string {
  if (imc < 18.5) return "Abaixo do peso";
  if (imc < 25) return "Peso normal";
  if (imc < 30) return "Sobrepeso";
  if (imc < 35) return "Obesidade grau I";
  if (imc < 40) return "Obesidade grau II";
  return "Obesidade grau III";
}

/**
 * TMB pela equação de Mifflin-St Jeor (mais precisa que Harris-Benedict
 * para a população geral, segundo a Academy of Nutrition and Dietetics).
 */
export function calcularTMB({ pesoKg, alturaCm, idade, genero }: DadosAntropometricos): number {
  const base = 10 * pesoKg + 6.25 * alturaCm - 5 * idade;
  const ajuste = genero === "masculino" ? 5 : genero === "feminino" ? -161 : -78; // média para "outro"
  return arredondar(base + ajuste, 0);
}

export function calcularTDEE(tmb: number, nivelAtividade: NivelAtividade): number {
  return arredondar(tmb * FATOR_ATIVIDADE[nivelAtividade], 0);
}

/**
 * Piso calórico mínimo de segurança: um déficit nunca deve levar a meta
 * abaixo desses valores sem acompanhamento presencial (referência clínica
 * usual: ~1200 kcal/dia para mulheres, ~1500 kcal/dia para homens).
 */
const PISO_CALORICO: Record<Genero, number> = {
  feminino: 1200,
  masculino: 1500,
  outro: 1350,
};

export interface CondicaoEspecial {
  gestante?: boolean;
  lactante?: boolean;
  historicoTranstornoAlimentar?: boolean;
  /** Sinal indireto de possível transtorno alimentar não declarado: IMC já
   *  abaixo do peso (< 18.5) e objetivo escolhido é emagrecimento. Um
   *  nutricionista fica atento a essa combinação mesmo sem a pessoa marcar
   *  "histórico de transtorno alimentar" explicitamente. */
  imcAbaixoDoPesoComObjetivoEmagrecimento?: boolean;
  /** Rótulo de uma condição clínica complexa detectada no campo de texto
   *  livre "outra condição" (ex: cirurgia bariátrica, insuficiência cardíaca,
   *  tratamento oncológico) — ver identificarCondicaoClinicaComplexa. Null/
   *  undefined quando nada foi identificado. */
  condicaoClinicaComplexa?: string | null;
}

export interface MetaCaloricaResultado {
  valor: number;
  /** Explicação do ajuste de segurança aplicado, se houver (null = nenhum ajuste). */
  avisoSeguranca: string | null;
}

/**
 * Ajuste calórico por objetivo. Déficit/superávit conservadores e
 * seguros (evitando restrições agressivas), alinhados a diretrizes de
 * emagrecimento/ganho de massa saudáveis (~0.5-1% do peso corporal/semana).
 *
 * Duas travas de segurança, nessa ordem de prioridade:
 *  1) Gestação, amamentação ou histórico de transtorno alimentar: NUNCA
 *     aplica déficit/superávit automático, independente do objetivo
 *     escolhido — usa manutenção (TDEE) e recomenda acompanhamento.
 *  2) Piso calórico mínimo: mesmo sem condição especial, a meta nunca
 *     fica abaixo do piso seguro por gênero.
 */
export function calcularMetaCalorica(
  tdee: number,
  objetivo: ObjetivoNutricional,
  genero: Genero,
  condicaoEspecial: CondicaoEspecial = {}
): MetaCaloricaResultado {
  const {
    gestante,
    lactante,
    historicoTranstornoAlimentar,
    imcAbaixoDoPesoComObjetivoEmagrecimento,
    condicaoClinicaComplexa,
  } = condicaoEspecial;

  if (condicaoClinicaComplexa) {
    return {
      valor: tdee,
      avisoSeguranca:
        `Você mencionou "${condicaoClinicaComplexa}" — esse tipo de condição precisa de acompanhamento ` +
        "nutricional presencial, com cálculos individualizados que este app não tem como fazer com segurança " +
        "(ex: pós-bariátrica exige volumes de porção muito específicos; algumas condições exigem restrição de " +
        "líquidos, o oposto da meta de água calculada aqui). Por segurança, ajustamos sua meta para manutenção — " +
        "procure um nutricionista ou seu médico antes de seguir qualquer plano alimentar.",
    };
  }

  if (gestante || lactante || historicoTranstornoAlimentar) {
    const motivo = gestante ? "gravidez" : lactante ? "amamentação" : "histórico de transtorno alimentar";
    return {
      valor: tdee,
      avisoSeguranca:
        `Por segurança, sua meta foi ajustada para manutenção calórica (sem déficit ou superávit) devido a ${motivo} ` +
        "informado(a) na consulta. Recomendamos fortemente buscar acompanhamento com um nutricionista licenciado " +
        "para orientação individualizada nesta fase.",
    };
  }

  if (imcAbaixoDoPesoComObjetivoEmagrecimento) {
    return {
      valor: tdee,
      avisoSeguranca:
        "Seu IMC atual já está na faixa 'abaixo do peso', então não aplicamos o déficit calórico que o objetivo de " +
        "emagrecimento pediria — isso não seria seguro. Ajustamos sua meta para manutenção e recomendamos fortemente " +
        "conversar com um nutricionista ou médico antes de buscar perder mais peso.",
    };
  }

  let bruta: number;
  switch (objetivo) {
    case "emagrecimento":
      bruta = arredondar(tdee * 0.8, 0); // déficit de ~20%
      break;
    case "ganho_massa":
      bruta = arredondar(tdee * 1.12, 0); // superávit de ~12%
      break;
    case "performance_esportiva":
      bruta = arredondar(tdee * 1.08, 0);
      break;
    case "manutencao":
    case "saude_geral":
    default:
      bruta = tdee;
  }

  const piso = PISO_CALORICO[genero];
  if (bruta < piso) {
    return {
      valor: piso,
      avisoSeguranca:
        `Sua meta calórica calculada ficou abaixo do mínimo seguro recomendado (${piso} kcal/dia), então ajustamos ` +
        "para esse piso. Déficits mais agressivos que isso não devem ser feitos sem acompanhamento profissional presencial.",
    };
  }

  return { valor: bruta, avisoSeguranca: null };
}

export interface Macros {
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
  fibraG: number;
}

/**
 * Distribuição de macros baseada no objetivo e no peso corporal
 * (proteína/gordura por kg, restante em carboidrato), respeitando os
 * mínimos recomendados por diretrizes de nutrição esportiva/clínica.
 *
 * `limiteProteinaPorKg` permite capar a proteína por uma condição de saúde
 * (ex: doença renal) independente do que o objetivo pediria.
 */
export function calcularMacros(
  metaCalorica: number,
  pesoKg: number,
  objetivo: ObjetivoNutricional,
  limiteProteinaPorKg: number | null = null
): Macros {
  let proteinaPorKg: number;
  let gorduraPorKg: number;

  switch (objetivo) {
    case "emagrecimento":
      proteinaPorKg = 2.0; // preserva massa magra em déficit
      gorduraPorKg = 0.8;
      break;
    case "ganho_massa":
      proteinaPorKg = 1.8;
      gorduraPorKg = 1.0;
      break;
    case "performance_esportiva":
      proteinaPorKg = 1.8;
      gorduraPorKg = 0.9;
      break;
    default:
      proteinaPorKg = 1.4;
      gorduraPorKg = 0.9;
  }

  if (limiteProteinaPorKg != null) {
    proteinaPorKg = Math.min(proteinaPorKg, limiteProteinaPorKg);
  }

  const proteinaG = arredondar(pesoKg * proteinaPorKg, 0);
  const gorduraG = arredondar(pesoKg * gorduraPorKg, 0);

  const caloriasProteina = proteinaG * 4;
  const caloriasGordura = gorduraG * 9;
  const caloriasRestantes = Math.max(metaCalorica - caloriasProteina - caloriasGordura, 0);
  const carboidratoG = arredondar(caloriasRestantes / 4, 0);

  // Fibra: 14g por 1000 kcal (diretriz USDA/Institute of Medicine)
  const fibraG = arredondar((metaCalorica / 1000) * 14, 0);

  return { proteinaG, carboidratoG, gorduraG, fibraG };
}

/**
 * Água recomendada: 35ml/kg como base, +500ml se nível de atividade
 * moderado ou superior (perda extra por suor), +300ml se gestante e
 * +800ml se lactante (referência clínica usual: gestação aumenta a
 * necessidade hídrica moderadamente, e a produção de leite consome
 * bem mais água — lactante tem prioridade se os dois estiverem marcados,
 * o que não deveria acontecer na prática).
 */
export function calcularAguaRecomendada(
  pesoKg: number,
  nivelAtividade: NivelAtividade,
  condicaoEspecial: { gestante?: boolean; lactante?: boolean } = {}
): number {
  const base = pesoKg * 35;
  const extraAtividade = ["moderado", "intenso", "atleta"].includes(nivelAtividade) ? 500 : 0;
  const extraFase = condicaoEspecial.lactante ? 800 : condicaoEspecial.gestante ? 300 : 0;
  return arredondar(base + extraAtividade + extraFase, 0);
}

const CONDICOES_COMPLEXAS_NAO_COBERTAS: { termos: string[]; rotulo: string }[] = [
  {
    termos: ["bariatrica", "bypass gastrico", "sleeve gastrico", "gastrectomia"],
    rotulo: "cirurgia bariátrica",
  },
  {
    termos: ["insuficiencia cardiaca", "dialise", "hemodialise"],
    rotulo: "uma condição que exige restrição de líquidos e acompanhamento médico próximo",
  },
  {
    termos: ["quimioterapia", "radioterapia", "oncologico", "oncologica", "cancer"],
    rotulo: "tratamento oncológico",
  },
  {
    termos: ["crohn", "retocolite", "colite ulcerativa"],
    rotulo: "uma doença inflamatória intestinal",
  },
  {
    termos: ["transplante"],
    rotulo: "histórico de transplante",
  },
];

/**
 * Escaneia o campo de texto livre "outra condição não listada" atrás de
 * termos que indicam uma condição clínica complexa demais para este app
 * calcular com segurança (cirurgia bariátrica, insuficiência cardíaca,
 * tratamento oncológico, doença inflamatória intestinal, transplante...).
 * Mesma lógica de defesa em profundidade já usada pra alergia em
 * receitaMatching.ts::textoContemAlergiaDoUsuario: não confiar só na
 * pessoa saber que precisa buscar ajuda presencial — o app precisa
 * reconhecer isso sozinho e reagir (ver calcularMetaCalorica).
 */
export function identificarCondicaoClinicaComplexa(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const normalizado = normalizar(texto);
  for (const grupo of CONDICOES_COMPLEXAS_NAO_COBERTAS) {
    if (grupo.termos.some((termo) => normalizado.includes(termo))) {
      return grupo.rotulo;
    }
  }
  return null;
}

/**
 * Avalia as condições de saúde crônicas informadas (lista fechada — não
 * texto livre) e retorna: (a) um limite de proteína/kg quando a condição
 * exige isso por segurança, e (b) recomendações em texto. Deliberadamente
 * conservador: quando não temos como calcular um ajuste preciso (ex:
 * tireoide, diabetes), não fingimos precisão — recomendamos acompanhamento
 * em vez de adivinhar um número.
 */
export function avaliarCondicoesSaude(condicoes: CondicaoSaude[]): {
  avisos: string[];
  limiteProteinaPorKg: number | null;
} {
  const avisos: string[] = [];
  let limiteProteinaPorKg: number | null = null;

  if (condicoes.includes("doenca_renal")) {
    limiteProteinaPorKg = 1.0;
    avisos.push(
      "Como você informou uma condição renal, ajustamos sua proteína para um valor mais conservador. O ideal é " +
        "que a quantidade exata seja definida por um nutricionista ou nefrologista com base nos seus exames."
    );
  }
  if (condicoes.includes("diabetes_tipo1") || condicoes.includes("diabetes_tipo2")) {
    avisos.push(
      "Como você informou diabetes, é importante monitorar a distribuição de carboidratos ao longo do dia e sua " +
        "glicemia com acompanhamento profissional — os valores aqui são uma referência geral, não uma prescrição individualizada."
    );
  }
  if (condicoes.includes("hipertensao")) {
    avisos.push(
      "Como você informou hipertensão, modere o sódio (sal, industrializados, temperos prontos) e, se possível, " +
        "acompanhe sua pressão regularmente."
    );
  }
  if (condicoes.includes("hipotireoidismo") || condicoes.includes("hipertireoidismo")) {
    avisos.push(
      "Alterações de tireoide afetam seu metabolismo de um jeito que este cálculo não mede sozinho — o ideal é " +
        "ajustar sua meta calórica com acompanhamento profissional, principalmente se notar resultados muito diferentes do esperado."
    );
  }
  if (condicoes.includes("colesterol_alto")) {
    avisos.push(
      "Como você informou colesterol alto, priorize gorduras insaturadas (azeite, castanhas, peixes) e modere frituras e gorduras saturadas."
    );
  }

  return { avisos, limiteProteinaPorKg };
}

/** Recomendações a partir de sono/estresse informados na consulta — dado que
 *  antes era coletado e nunca usado. Não altera nenhum cálculo, só orienta. */
export function avaliarSonoEEstresse(qualidadeSono: number | null, nivelEstresse: number | null): string[] {
  const avisos: string[] = [];
  if (qualidadeSono != null && qualidadeSono <= 2) {
    avisos.push(
      "Sua qualidade de sono está baixa. Sono ruim está associado a mais fome ao longo do dia e mais dificuldade " +
        "para perder peso — melhorar isso pode ajudar tanto quanto ajustar a dieta."
    );
  }
  if (nivelEstresse != null && nivelEstresse >= 4) {
    avisos.push(
      "Seu nível de estresse está alto. Estresse crônico eleva o cortisol e pode dificultar tanto o emagrecimento " +
        "quanto o ganho de massa — vale cuidar disso junto com a alimentação."
    );
  }
  return avisos;
}

/**
 * Avisos nutricionais para dietas restritivas informadas em texto livre
 * (vegetariano/vegano) — nutrientes que exigem atenção extra nesses casos
 * e que um nutricionista sempre comenta na consulta. Reaproveita o mesmo
 * `normalizar` usado pra casar receitas por tag de dieta, então reconhece
 * "vegano", "vegana", "vegetariano", "vegetariana" com ou sem acento.
 */
export function avaliarDietaRestritiva(restricoesAlimentares: string[]): string[] {
  const normalizadas = restricoesAlimentares.map(normalizar);
  const eVegano = normalizadas.some((r) => r.includes("vegan"));
  const eVegetariano = !eVegano && normalizadas.some((r) => r.includes("vegetarian"));

  if (eVegano) {
    return [
      "Como sua dieta é vegana, fique atento à vitamina B12 (não existe em fontes vegetais — geralmente precisa de " +
        "suplementação), além de ferro, cálcio, zinco e ômega-3, que exigem mais planejamento nesse tipo de dieta. " +
        "Vale conversar com um nutricionista sobre suplementação.",
    ];
  }
  if (eVegetariano) {
    return [
      "Como sua dieta é vegetariana, dê atenção especial a ferro, cálcio e vitamina B12 (principalmente se não " +
        "consumir ovos e laticínios com regularidade) — combinar fontes vegetais de ferro com vitamina C ajuda na absorção.",
    ];
  }
  return [];
}

/**
 * Quando o paciente está com obesidade (IMC >= 30) e tem uma condição
 * cardiometabólica (hipertensão, colesterol alto ou diabetes), mas NÃO
 * escolheu "emagrecimento" como objetivo, um nutricionista normalmente
 * comentaria isso na consulta — mesmo pequenas perdas de peso (5-10%)
 * costumam melhorar bastante esses quadros. Isso é só uma sugestão em
 * texto: nunca força déficit calórico nem substitui o objetivo escolhido
 * pelo paciente (gestante/lactante/TA já são tratadas à parte e não entram aqui).
 */
export function avaliarObjetivoVsRiscoCardiometabolico(
  imc: number,
  objetivo: ObjetivoNutricional,
  condicoes: CondicaoSaude[],
  condicaoEspecial: CondicaoEspecial = {}
): string[] {
  const condicoesCardiometabolicas: CondicaoSaude[] = [
    "hipertensao",
    "colesterol_alto",
    "diabetes_tipo1",
    "diabetes_tipo2",
  ];
  const temCondicaoRelevante = condicoes.some((c) => condicoesCardiometabolicas.includes(c));
  const { gestante, lactante, historicoTranstornoAlimentar } = condicaoEspecial;

  if (
    imc >= 30 &&
    objetivo !== "emagrecimento" &&
    temCondicaoRelevante &&
    !gestante &&
    !lactante &&
    !historicoTranstornoAlimentar
  ) {
    return [
      "Seu IMC está na faixa de obesidade e você informou uma condição associada a isso (hipertensão, colesterol " +
        "alto ou diabetes). Mesmo que seu objetivo atual não seja emagrecimento, vale conversar com um nutricionista " +
        "sobre uma perda de peso moderada — costuma melhorar bastante esses quadros.",
    ];
  }
  return [];
}

/**
 * Consumo de álcool informado na consulta. Não existe nível seguro
 * estabelecido para gestação/amamentação (evitar completamente); fora
 * disso, só avisamos em consumo moderado/frequente, e reforçamos riscos
 * específicos quando há diabetes (hipoglicemia, principalmente com
 * insulina/hipoglicemiantes) ou hipertensão (eleva a pressão).
 */
export function avaliarConsumoAlcool(
  consumo: ConsumoAlcool,
  condicoes: CondicaoSaude[],
  gestante: boolean,
  lactante: boolean
): string[] {
  if (consumo === "nunca") return [];

  if (gestante || lactante) {
    return [
      "Não existe nível seguro de consumo de álcool comprovado durante a gravidez ou amamentação — o ideal é " +
        "evitar completamente. Se estiver difícil, vale conversar com seu médico sobre apoio para isso.",
    ];
  }

  const avisos: string[] = [];
  if (consumo === "moderado" || consumo === "frequente") {
    avisos.push(
      "Álcool tem calorias que não entram no cálculo do seu plano alimentar — quanto mais frequente o consumo, " +
        "mais isso pode atrapalhar seu objetivo."
    );
  }
  if (consumo === "frequente" && (condicoes.includes("diabetes_tipo1") || condicoes.includes("diabetes_tipo2"))) {
    avisos.push(
      "Álcool combinado com diabetes — principalmente se você usa insulina ou outros medicamentos que baixam a " +
        "glicemia — pode causar hipoglicemia. Vale conversar com seu médico sobre isso."
    );
  }
  if (consumo === "frequente" && condicoes.includes("hipertensao")) {
    avisos.push("Consumo frequente de álcool pode elevar sua pressão arterial — vale moderar e acompanhar.");
  }
  return avisos;
}

/**
 * Tabagismo atual aumenta o consumo de vitamina C pelo estresse oxidativo
 * do cigarro, e combinado com uma condição cardiometabólica (hipertensão,
 * colesterol alto, diabetes) multiplica bastante o risco cardiovascular —
 * geralmente mais do que qualquer ajuste isolado na dieta resolveria.
 * Ex-fumante e nunca fumou não geram aviso.
 */
export function avaliarTabagismo(status: StatusTabagismo, condicoes: CondicaoSaude[]): string[] {
  if (status !== "fumante") return [];

  const avisos: string[] = [
    "Fumar aumenta a necessidade de vitamina C pelo estresse oxidativo do cigarro — priorize frutas cítricas, " +
      "acerola, goiaba e vegetais crus no seu dia a dia.",
  ];

  const condicoesCardiometabolicas: CondicaoSaude[] = [
    "hipertensao",
    "colesterol_alto",
    "diabetes_tipo1",
    "diabetes_tipo2",
  ];
  if (condicoes.some((c) => condicoesCardiometabolicas.includes(c))) {
    avisos.push(
      "Fumar combinado com uma condição cardiometabólica (hipertensão, colesterol alto ou diabetes) multiplica " +
        "bastante o risco cardiovascular — buscar apoio pra parar de fumar teria mais impacto na sua saúde do que " +
        "qualquer ajuste na dieta."
    );
  }
  return avisos;
}

/**
 * Disclaimer genérico para medicamentos em uso. Deliberadamente NÃO
 * tentamos cruzar medicamento x alimento aqui (ex: varfarina e vitamina K,
 * IMAO e tiramina) — é uma área de alto risco pra acertar com uma lista de
 * texto livre, então preferimos reforçar que isso deve ser checado com um
 * profissional em vez de arriscar uma regra automática errada.
 */
export function avaliarMedicamentos(medicamentosEmUso: string[]): string[] {
  if (medicamentosEmUso.length === 0) return [];
  return [
    "Você informou medicamentos em uso. Alguns medicamentos interagem com alimentos ou nutrientes específicos " +
      "(ex: anticoagulantes e vitamina K) — confirme com seu médico ou farmacêutico se algum dos seus tem alguma " +
      "interação relevante com a alimentação.",
  ];
}

/**
 * Gestação/amamentação combinada com uma condição crônica (ex: diabetes,
 * hipertensão) pede acompanhamento mais próximo do que o normal — inclusive
 * porque algumas condições mudam de comportamento nessa fase (diabetes
 * gestacional, por exemplo, não está na nossa lista fechada de condições e
 * precisa de avaliação médica específica que este app não cobre).
 */
export function avaliarGestacaoComCondicao(
  gestante: boolean,
  lactante: boolean,
  condicoes: CondicaoSaude[]
): string[] {
  if ((!gestante && !lactante) || condicoes.length === 0) return [];
  const fase = gestante ? "gravidez" : "amamentação";
  return [
    `Ter uma condição de saúde crônica durante a ${fase} pede acompanhamento médico/nutricional mais próximo do ` +
      "que o normal — algumas condições (como diabetes) mudam de comportamento nessa fase e precisam de avaliação " +
      "específica que este app não substitui. Priorize consultas presenciais nesse período.",
  ];
}

/**
 * Relação cintura-quadril (RCQ) — indicador clássico de risco cardiovascular
 * quando as duas medidas estão disponíveis. Referências de corte (OMS):
 * mulher ≥0.85 e homem ≥0.90 já indicam risco aumentado.
 */
export function calcularRCQ(
  cinturaCm: number,
  quadrilCm: number,
  genero: Genero
): { valor: number; classificacao: string } {
  const valor = arredondar(cinturaCm / quadrilCm, 2);

  if (genero === "masculino") {
    return { valor, classificacao: valor >= 0.9 ? "Risco aumentado" : "Risco baixo" };
  }
  if (genero === "feminino") {
    return { valor, classificacao: valor >= 0.85 ? "Risco aumentado" : "Risco baixo" };
  }
  // Sem um corte padronizado para "outro" — mostramos o número com um corte
  // conservador (média dos dois) em vez de inventar uma referência específica.
  return { valor, classificacao: valor >= 0.875 ? "Risco possivelmente aumentado" : "Risco baixo" };
}

export interface ResultadoAvaliacao {
  imc: number;
  classificacaoImc: string;
  tmb: number;
  tdee: number;
  metaCalorica: number;
  macros: Macros;
  aguaMl: number;
  /** Todos os avisos/recomendações da consulta: segurança calórica, condições
   *  de saúde informadas, sono/estresse e dieta restritiva — nessa ordem de prioridade. */
  avisos: string[];
  /** Os mesmos avisos acima, reorganizados em texto corrido por tema (visão
   *  geral, condições de saúde, hábitos, alimentação) — pra soar como um
   *  nutricionista fechando a consulta, não uma lista de alertas de sistema.
   *  100% determinístico: reaproveita as mesmas frases já testadas, sem IA. */
  resumo: string;
}

const OBJETIVO_TEXTO: Record<ObjetivoNutricional, string> = {
  emagrecimento: "emagrecer",
  manutencao: "manter seu peso atual",
  ganho_massa: "ganhar massa muscular",
  saude_geral: "cuidar da sua saúde de forma geral",
  performance_esportiva: "melhorar sua performance esportiva",
};

/**
 * Monta o resumo em texto corrido descrito acima. Determinístico: junta as
 * mesmas frases já geradas pelas funções avaliar... e identificar... (já cobertas
 * por teste individualmente) em blocos por tema, em vez de reescrever tudo
 * do zero — assim nunca perde nem distorce um dado de segurança.
 */
function montarResumoConsulta(params: {
  imc: number;
  classificacaoImc: string;
  metaCalorica: number;
  objetivo: ObjetivoNutricional;
  avisoSeguranca: string | null;
  avisosCondicoes: string[];
  avisosGestacaoCondicao: string[];
  avisosObjetivoRisco: string[];
  avisosAlcool: string[];
  avisosTabagismo: string[];
  avisosSono: string[];
  avisosDieta: string[];
  avisosMedicamentos: string[];
}): string {
  const paragrafos: string[] = [];

  const objetivoTexto = OBJETIVO_TEXTO[params.objetivo];
  const abertura =
    `Com base no que você me contou, seu IMC está em ${params.imc} (${params.classificacaoImc.toLowerCase()}) ` +
    `e vamos trabalhar com foco em ${objetivoTexto}.`;
  paragrafos.push(
    params.avisoSeguranca
      ? `${abertura} ${params.avisoSeguranca}`
      : `${abertura} Sua meta calórica diária ficou em ${params.metaCalorica} kcal.`
  );

  const blocoCondicoes = [
    ...params.avisosGestacaoCondicao,
    ...params.avisosCondicoes,
    ...params.avisosObjetivoRisco,
  ];
  if (blocoCondicoes.length > 0) {
    paragrafos.push(`Sobre suas condições de saúde: ${blocoCondicoes.join(" ")}`);
  }

  const blocoHabitos = [...params.avisosAlcool, ...params.avisosTabagismo, ...params.avisosSono];
  if (blocoHabitos.length > 0) {
    paragrafos.push(`Sobre seus hábitos: ${blocoHabitos.join(" ")}`);
  }

  const blocoAlimentacao = [...params.avisosDieta, ...params.avisosMedicamentos];
  if (blocoAlimentacao.length > 0) {
    paragrafos.push(blocoAlimentacao.join(" "));
  }

  paragrafos.push(
    "O plano alimentar já foi montado em cima dessas metas — qualquer dúvida ou mudança, é só voltar numa consulta de retorno."
  );

  return paragrafos.join("\n\n");
}

/** Executa a bateria completa de cálculos a partir dos dados da consulta. */
export function gerarResultadoAvaliacao(
  dados: DadosAntropometricos & {
    nivelAtividade: NivelAtividade;
    objetivo: ObjetivoNutricional;
    condicoesSaude?: CondicaoSaude[];
    qualidadeSono?: number | null;
    nivelEstresse?: number | null;
    restricoesAlimentares?: string[];
    consumoAlcool?: ConsumoAlcool;
    medicamentosEmUso?: string[];
    condicoesSaudeOutras?: string | null;
    tabagismo?: StatusTabagismo;
  } & CondicaoEspecial
): ResultadoAvaliacao {
  const imc = calcularIMC(dados);
  const classificacaoImc = classificarIMC(imc);
  const tmb = calcularTMB(dados);
  const tdee = calcularTDEE(tmb, dados.nivelAtividade);
  const { valor: metaCalorica, avisoSeguranca } = calcularMetaCalorica(tdee, dados.objetivo, dados.genero, {
    gestante: dados.gestante,
    lactante: dados.lactante,
    historicoTranstornoAlimentar: dados.historicoTranstornoAlimentar,
    imcAbaixoDoPesoComObjetivoEmagrecimento: imc < 18.5 && dados.objetivo === "emagrecimento",
    condicaoClinicaComplexa: identificarCondicaoClinicaComplexa(dados.condicoesSaudeOutras),
  });

  const { avisos: avisosCondicoes, limiteProteinaPorKg } = avaliarCondicoesSaude(dados.condicoesSaude ?? []);
  const macros = calcularMacros(metaCalorica, dados.pesoKg, dados.objetivo, limiteProteinaPorKg);
  const aguaMl = calcularAguaRecomendada(dados.pesoKg, dados.nivelAtividade, {
    gestante: dados.gestante,
    lactante: dados.lactante,
  });
  const avisosSono = avaliarSonoEEstresse(dados.qualidadeSono ?? null, dados.nivelEstresse ?? null);
  const avisosDieta = avaliarDietaRestritiva(dados.restricoesAlimentares ?? []);
  const avisosObjetivoRisco = avaliarObjetivoVsRiscoCardiometabolico(imc, dados.objetivo, dados.condicoesSaude ?? [], {
    gestante: dados.gestante,
    lactante: dados.lactante,
    historicoTranstornoAlimentar: dados.historicoTranstornoAlimentar,
  });
  const avisosAlcool = avaliarConsumoAlcool(
    dados.consumoAlcool ?? "nunca",
    dados.condicoesSaude ?? [],
    dados.gestante ?? false,
    dados.lactante ?? false
  );
  const avisosGestacaoCondicao = avaliarGestacaoComCondicao(
    dados.gestante ?? false,
    dados.lactante ?? false,
    dados.condicoesSaude ?? []
  );
  const avisosMedicamentos = avaliarMedicamentos(dados.medicamentosEmUso ?? []);
  const avisosTabagismo = avaliarTabagismo(dados.tabagismo ?? "nunca", dados.condicoesSaude ?? []);

  const avisos = [
    avisoSeguranca,
    ...avisosGestacaoCondicao,
    ...avisosCondicoes,
    ...avisosAlcool,
    ...avisosTabagismo,
    ...avisosSono,
    ...avisosDieta,
    ...avisosObjetivoRisco,
    ...avisosMedicamentos,
  ].filter((a): a is string => Boolean(a));

  const resumo = montarResumoConsulta({
    imc,
    classificacaoImc,
    metaCalorica,
    objetivo: dados.objetivo,
    avisoSeguranca,
    avisosCondicoes,
    avisosGestacaoCondicao,
    avisosObjetivoRisco,
    avisosAlcool,
    avisosTabagismo,
    avisosSono,
    avisosDieta,
    avisosMedicamentos,
  });

  return { imc, classificacaoImc, tmb, tdee, metaCalorica, macros, aguaMl, avisos, resumo };
}

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}
