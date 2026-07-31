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

import type { CondicaoSaude, ConsumoAlcool, Genero, NivelAtividade, ObjetivoNutricional, StatusTabagismo, PontoAtencao, RelatorioConsulta } from "../../types/domain.ts";
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
export function avaliarSonoEEstresse(
  qualidadeSono: number | null,
  nivelEstresse: number | null,
  insonia: boolean = false
): string[] {
  const avisos: string[] = [];
  if (qualidadeSono != null && qualidadeSono <= 2) {
    avisos.push(
      "Sua qualidade de sono está baixa. Sono ruim está associado a mais fome ao longo do dia e mais dificuldade " +
        "para perder peso — melhorar isso pode ajudar tanto quanto ajustar a dieta."
    );
  }
  if (insonia) {
    avisos.push(
      "Você relatou insônia. Sono insuficiente ou fragmentado interfere bastante no apetite e na composição " +
        "corporal — vale investigar isso com um profissional se persistir."
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
 * Cruzamento objetivo x nível de atividade física (pergunta antes coletada
 * e nunca usada). Referência: diretriz OMS 2020 de atividade física —
 * 150-300 min/semana de intensidade moderada (ou 75-150 min intensa) +
 * fortalecimento muscular 2x/semana ou mais.
 *
 * Regra deliberadamente diferente conforme o nível atual, seguindo o
 * raciocínio de um nutricionista real: se a pessoa já está ativa (moderado
 * ou mais) e o objetivo é emagrecimento, o problema raramente é "fazer mais
 * exercício" — é mais produtivo olhar pra outros fatores (álcool, sono,
 * adesão alimentar), que já são avaliados em outras funções deste arquivo.
 */
export function avaliarAtividadeVsObjetivo(
  nivelAtividade: NivelAtividade,
  objetivo: ObjetivoNutricional
): string[] {
  if (objetivo !== "emagrecimento") return [];

  if (nivelAtividade === "sedentario" || nivelAtividade === "leve") {
    return [
      "Seu objetivo é emagrecimento e seu nível de atividade física atual é baixo. A recomendação da OMS é de " +
        "150 a 300 minutos por semana de atividade moderada (ou 75-150 minutos de atividade intensa), mais " +
        "fortalecimento muscular 2x ou mais por semana — aumentar isso de forma gradual tende a acelerar bastante " +
        "o resultado, além da alimentação.",
    ];
  }

  return [
    "Seu objetivo é emagrecimento e você já tem um nível de atividade física bom. Se o peso não estiver descendo " +
      "mesmo assim, o mais produtivo geralmente não é adicionar ainda mais exercício — vale olhar com mais atenção " +
      "para consumo de álcool, qualidade do sono e adesão real à alimentação, que costumam pesar mais nesse cenário.",
  ];
}

/**
 * Duração do sono informada (horas_sono) — referência National Sleep
 * Foundation: 7 a 9 horas por noite para adultos. Avisa mesmo que a pessoa
 * tenha respondido que considera a própria qualidade de sono boa em outro
 * campo, porque duração curta já é um fator de risco isolado para apetite e
 * controle de peso, independente de "qualidade" percebida.
 */
export function avaliarSonoDuracao(horasSono: string | null | undefined): string[] {
  if (horasSono === "< 4 horas" || horasSono === "4 a 6 horas") {
    return [
      "Você relatou dormir menos que o recomendado (a referência para adultos é de 7 a 9 horas por noite). Sono " +
        "curto está associado a mais fome ao longo do dia e mais dificuldade de controlar o peso, mesmo quando a " +
        "pessoa sente que a qualidade do sono é boa.",
    ];
  }
  return [];
}

/**
 * Compara a ingestão de água relatada (ingestao_agua_copos, em copos de
 * ~250ml) com a meta já calculada por calcularAguaRecomendada — campo que
 * antes era coletado e nunca comparado com nada. Só avisa se a ingestão
 * relatada estiver visivelmente abaixo da meta (>20% abaixo), pra não gerar
 * aviso por uma diferença pequena que pode só ser imprecisão na resposta.
 */
export function avaliarHidratacaoReal(
  ingestaoAguaCopos: string | null | undefined,
  metaAguaMl: number
): string[] {
  const copos = ingestaoAguaCopos != null ? parseInt(ingestaoAguaCopos, 10) : NaN;
  if (Number.isNaN(copos)) return [];

  const aguaRelatadaMl = copos * 250;
  if (aguaRelatadaMl < metaAguaMl * 0.8) {
    const coposFaltando = Math.max(1, Math.ceil((metaAguaMl - aguaRelatadaMl) / 250));
    return [
      `Pelo que você relatou, sua ingestão de água está abaixo da sua meta calculada (${metaAguaMl}ml/dia) — ` +
        `tente incluir mais ${coposFaltando} copo(s) de ~250ml por dia.`,
    ];
  }
  return [];
}

/**
 * Histórico de dietas anteriores (dieta_anterior). Deliberadamente NÃO
 * tentamos interpretar o texto livre pra adivinhar se deu certo ou não —
 * mesma lógica de avaliarMedicamentos: texto livre é território arriscado
 * pra afirmação clínica específica. Só usamos a presença de uma resposta
 * (diferente de "Não") como sinal de que a pessoa já tentou antes, pra
 * incentivar uma abordagem mais gradual/sustentável desta vez.
 */
export function avaliarHistoricoDietas(dietaAnterior: string | null | undefined): string[] {
  if (!dietaAnterior || normalizar(dietaAnterior) === "nao") return [];
  return [
    "Você já tentou seguir alguma dieta antes. Tentativas anteriores que não se sustentaram no longo prazo " +
      "geralmente pedem um ritmo mais gradual desta vez (metas menores, mudanças que cabem na sua rotina) em vez " +
      "de um déficit mais agressivo — isso tende a durar mais.",
  ];
}

/**
 * Histórico FAMILIAR de doenças (doencas_familiares) x condições que a
 * PRÓPRIA pessoa já tem. Referência: histórico familiar de diabetes,
 * hipertensão ou doença cardiovascular aumenta o risco de 1.1 a 5.6x de
 * desenvolver uma condição relacionada. Só avisa quando a pessoa tem o
 * histórico familiar mas AINDA NÃO relatou a condição em si — nunca
 * diagnostica, só sugere rastreio.
 */
export function avaliarRiscoFamiliar(
  doencasFamiliares: string[],
  condicoesSaude: CondicaoSaude[],
  classificacaoImc: string
): string[] {
  const avisos: string[] = [];
  const familia = new Set(doencasFamiliares);
  const temDiabetesPropria = condicoesSaude.includes("diabetes_tipo1") || condicoesSaude.includes("diabetes_tipo2");
  const temHipertensaoPropria = condicoesSaude.includes("hipertensao");

  if (familia.has("Diabetes") && !temDiabetesPropria) {
    avisos.push(
      "Você tem histórico familiar de diabetes. Isso aumenta seu risco pessoal, mesmo sem diagnóstico hoje — vale " +
        "considerar um rastreio de glicemia com seu médico, principalmente se tiver outros fatores de risco."
    );
  }
  if (familia.has("Hipertensão") && !temHipertensaoPropria) {
    avisos.push(
      "Você tem histórico familiar de hipertensão. Vale acompanhar sua pressão arterial periodicamente, mesmo sem " +
        "diagnóstico hoje."
    );
  }
  if (familia.has("Doença cardiovascular") && !temDiabetesPropria && !temHipertensaoPropria) {
    avisos.push(
      "Você tem histórico familiar de doença cardiovascular. Vale manter atenção a fatores de risco modificáveis " +
        "(alimentação, atividade física, tabagismo) e conversar sobre isso na sua próxima consulta médica."
    );
  }
  if (familia.has("Obesidade") && !["Sobrepeso", "Obesidade grau I", "Obesidade grau II", "Obesidade grau III"].includes(classificacaoImc)) {
    avisos.push(
      "Você tem histórico familiar de obesidade. Seu IMC atual está numa faixa saudável — manter os hábitos que já " +
        "vêm funcionando é a melhor forma de prevenção nesse caso."
    );
  }

  return avisos;
}

/**
 * Rotina de trabalho/estudos em texto livre (rotina_trabalho). Escaneia por
 * termos que indicam turno noturno/irregular — associado a maior risco de
 * síndrome metabólica e a comer fora de um padrão regular. Mesma técnica de
 * varredura de texto livre já usada em identificarCondicaoClinicaComplexa.
 */
const TERMOS_TURNO_IRREGULAR = ["noturno", "turno", "madrugada", "plantao", "escala", "revezamento"];

export function avaliarRotinaTrabalho(rotinaTrabalho: string | null | undefined): string[] {
  if (!rotinaTrabalho) return [];
  const normalizado = normalizar(rotinaTrabalho);
  if (TERMOS_TURNO_IRREGULAR.some((termo) => normalizado.includes(termo))) {
    return [
      "Sua rotina de trabalho parece incluir turno noturno ou horários irregulares. Isso está associado a maior " +
        "risco metabólico e a comer fora de um padrão regular — tente manter horários de refeição o mais fixos " +
        "possível dentro da sua escala, mesmo que não sejam os horários 'convencionais'.",
    ];
  }
  return [];
}

/**
 * Velocidade de mastigação (mastigacao). Comer rápido está associado a
 * praticamente o dobro do risco de obesidade em estudos populacionais;
 * mastigar mais reduz o tamanho da refeição de forma natural.
 */
export function avaliarMastigacao(mastigacao: string | null | undefined): string[] {
  if (mastigacao === "Rápida demais, sempre termino primeiro.") {
    return [
      "Você relatou que come rápido. Comer mais devagar e mastigar mais está associado a comer menos naturalmente " +
        "(o cérebro leva de 15 a 20 minutos para registrar saciedade) — tentar pausar entre garfadas pode ajudar " +
        "sem precisar mudar o que você come.",
    ];
  }
  return [];
}

/**
 * Frequência de restaurante/bar/delivery (frequencia_restaurante). Comer
 * fora com frequência está associado a mais sódio, gordura saturada e
 * calorias, e menos fibra/micronutrientes — mesmo sem mudar o que a pessoa
 * escolhe pedir.
 */
export function avaliarFrequenciaRestaurante(frequenciaRestaurante: string | null | undefined): string[] {
  if (frequenciaRestaurante === "3 a 4 vezes por semana" || frequenciaRestaurante === "Sempre") {
    return [
      "Você relatou comer fora (restaurante/bar/delivery) com bastante frequência. Refeições fora de casa tendem a " +
        "ter mais sódio, gordura e calorias, e menos fibra — não precisa cortar totalmente, mas escolher com mais " +
        "atenção nesses dias (ex: priorizar grelhados, salada, evitar refrigerante) já ajuda bastante.",
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
 * Redução de danos para quem bebe com frequência e tem objetivo de
 * emagrecimento, mas não sinaliza intenção de parar/reduzir. Deliberadamente
 * NÃO recomenda "trocar para destilado" — álcool puro tem 7kcal/g não
 * importa a bebida, destilado só concentra mais calorias por volume (as
 * pessoas bebem menos volume, não é a bebida em si que é "mais leve"). As
 * dicas abaixo miram no que a literatura de redução de danos realmente
 * aponta como evitável sem exigir parar de beber: açúcar de misturadores/
 * coquetéis doces, e o hábito de combinar álcool com petisco salgado. O
 * aviso principal (reduzir ajuda mais) sempre vem junto, nunca sozinho.
 */
export function avaliarAlcoolReducaoDeDanos(
  consumo: ConsumoAlcool,
  objetivo: ObjetivoNutricional
): string[] {
  if (objetivo !== "emagrecimento") return [];
  if (consumo !== "moderado" && consumo !== "frequente") return [];

  return [
    "Reduzir a frequência do álcool é o que mais ajuda no emagrecimento — o álcool pausa a queima de gordura do " +
      "corpo por várias horas depois de beber. Se for continuar bebendo, algumas escolhas reduzem o impacto: " +
      "evite misturadores açucarados e coquetéis doces (aí sim entra bastante caloria extra), prefira vinho seco ou " +
      "destilado com água com gás/tônica zero, e evite combinar com petiscos salgados. O que mais pesa continua " +
      "sendo a quantidade total, não o tipo de bebida.",
  ];
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

export interface MetaPesoResultado {
  /** Meta de peso final, já validada — null se a meta informada foi
   *  bloqueada por segurança ou se nenhuma meta foi informada. */
  pesoMetaKg: number | null;
  /** Aviso proeminente de segurança quando a meta é bloqueada — deve ser
   *  mostrado com destaque (não como nota de rodapé), tanto no preview ao
   *  vivo da consulta quanto no resultado final. Null quando não há bloqueio. */
  avisoMetaPeso: string | null;
}

/**
 * Trava de segurança pra meta de peso (peso_meta_kg). Quando o IMC atual já
 * está classificado como "Abaixo do peso" OU a pessoa informou histórico de
 * transtorno alimentar, uma meta que implica perder ainda mais peso
 * (peso_meta_kg < peso_kg) nunca é aceita — zeramos a meta antes de gerar
 * qualquer resultado e mostramos um aviso proeminente recomendando avaliação
 * presencial. Uma meta de ganho de peso (>= peso atual) nessas mesmas
 * condições não é bloqueada, já que não representa o mesmo risco.
 */
export function avaliarSegurancaMetaPeso(
  pesoMetaKg: number | null | undefined,
  pesoKg: number,
  classificacaoImc: string,
  historicoTranstornoAlimentar: boolean
): MetaPesoResultado {
  if (pesoMetaKg == null) return { pesoMetaKg: null, avisoMetaPeso: null };

  const imcAbaixoDoPeso = classificacaoImc === "Abaixo do peso";
  const emRisco = imcAbaixoDoPeso || historicoTranstornoAlimentar;
  const metaImplicaPerderMais = pesoMetaKg < pesoKg;

  if (emRisco && metaImplicaPerderMais) {
    const motivo =
      imcAbaixoDoPeso && historicoTranstornoAlimentar
        ? "seu IMC atual já está abaixo do peso e você informou histórico de transtorno alimentar"
        : imcAbaixoDoPeso
          ? "seu IMC atual já está abaixo do peso"
          : "você informou histórico de transtorno alimentar";
    return {
      pesoMetaKg: null,
      avisoMetaPeso:
        `Não aplicamos a meta de ${pesoMetaKg}kg que você informou porque ${motivo} — perder ainda mais peso não ` +
        "seria seguro. Essa não é uma decisão que este app deveria tomar sozinho: por favor, converse com um " +
        "nutricionista ou médico presencialmente antes de buscar perder peso. Seguimos sem meta de peso definida " +
        "até você reavaliar isso com um profissional.",
    };
  }

  return { pesoMetaKg, avisoMetaPeso: null };
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
  /** Meta de peso final, já validada pela trava de segurança — null se
   *  nenhuma meta foi informada ou se a meta foi bloqueada (ver avisoMetaPeso). */
  pesoMetaKg: number | null;
  /** Aviso proeminente quando a meta de peso informada foi bloqueada por
   *  segurança — null quando não há bloqueio. Ver avaliarSegurancaMetaPeso. */
  avisoMetaPeso: string | null;
  /** Relatório estruturado em blocos (resumo geral, pontos fortes, pontos
   *  de atenção priorizados, condições de saúde, hábitos de vida, alimentação,
   *  próximas prioridades e mensagem final) — usado pela tela de resultado da
   *  consulta e pelo Histórico. Montado inteiramente em cima dos mesmos
   *  cálculos e regras já existentes acima; não introduz nenhuma fórmula,
   *  trava de segurança ou decisão clínica nova — só reorganiza e reescreve
   *  como isso é apresentado ao paciente. */
  relatorio: RelatorioConsulta;
}

/**
 * ---------------------------------------------------------------------
 * Relatório da consulta em cartões (camada de apresentação)
 * ---------------------------------------------------------------------
 * Tudo abaixo é NOVO, mas não recalcula nem revalida nada — só reorganiza
 * o que as funções avaliarX/calcularX acima já decidem, em blocos separados
 * (condição de saúde, hábito de vida, etc.) e com texto mais caloroso, além
 * de adicionar o reconhecimento de hábitos positivos (que antes não existia:
 * as funções avaliar* só geram aviso quando algo precisa de atenção, nunca
 * elogio). Nenhuma fórmula, trava de segurança ou regra clínica é tocada
 * aqui — as mesmas condições/limiares já usados nas funções avaliar* acima
 * são reaproveitados (às vezes reconferidos, já que a saída delas hoje é só
 * texto solto, sem uma "chave" que dê pra reaproveitar estruturalmente).
 */

// PontoAtencao e RelatorioConsulta agora vêm de "../../types/domain.ts" (import
// no topo do arquivo) — moveram pra lá pra avaliacoes_nutricionais.relatorio
// (coluna jsonb) e o restante do app conseguirem tipar esse dado sem
// depender de um import deste arquivo de cálculo.

function elogiarSono(qualidadeSono: number | null, horasSono: string | null | undefined, insonia: boolean): string | null {
  const duracaoBoa = horasSono === "6 a 8 horas" || horasSono === "> 8 horas";
  const qualidadeBoa = qualidadeSono != null && qualidadeSono >= 4;
  if (!duracaoBoa || !qualidadeBoa || insonia) return null;
  return "Seu sono é um dos seus maiores aliados agora: dormir bem favorece a recuperação do organismo, melhora o controle do apetite e contribui tanto para o emagrecimento quanto para o ganho de massa muscular.";
}

function elogiarHidratacao(ingestaoAguaCopos: string | null | undefined, metaAguaMl: number): string | null {
  const copos = ingestaoAguaCopos != null ? parseInt(ingestaoAguaCopos, 10) : NaN;
  if (Number.isNaN(copos)) return null;
  if (copos * 250 < metaAguaMl) return null;
  return "Sua hidratação está muito boa — beber água na quantidade certa ajuda até no controle do apetite e no desempenho físico, então vale muito continuar assim.";
}

function elogiarAtividadeFisica(nivelAtividade: NivelAtividade): string | null {
  if (nivelAtividade === "sedentario" || nivelAtividade === "leve") return null;
  return "Seu nível de atividade física já é um excelente ponto de partida — agora o foco é potencializar esse esforço através da alimentação certa.";
}

function elogiarAlcool(consumo: ConsumoAlcool): string | null {
  if (consumo !== "nunca") return null;
  return "O fato de você não consumir bebidas alcoólicas também é uma vantagem importante: além de evitar calorias extras, isso favorece a recuperação do organismo e melhora a qualidade do sono.";
}

function elogiarTabagismo(status: StatusTabagismo): string | null {
  if (status === "nunca") {
    return "Não fumar é extremamente positivo para sua saúde cardiovascular e metabólica — um dos hábitos que mais protege seu coração a longo prazo.";
  }
  if (status === "ex_fumante") {
    return "Ter parado de fumar já é uma conquista enorme para sua saúde cardiovascular — seu corpo agradece esse esforço todos os dias.";
  }
  return null;
}

function elogiarEstresse(nivelEstresse: number | null): string | null {
  if (nivelEstresse == null || nivelEstresse > 2) return null;
  return "Seu nível de estresse está bem controlado, e isso é uma vantagem real: estresse crônico costuma dificultar tanto o emagrecimento quanto o ganho de massa, então esse equilíbrio já está jogando a seu favor.";
}

function elogiarMastigacao(mastigacao: string | null | undefined): string | null {
  if (mastigacao !== "Normal, aprecio a comida com atenção plena.") return null;
  return "Você já mastiga com calma e atenção — isso ajuda bastante o cérebro a reconhecer o sinal de saciedade na hora certa, um detalhe pequeno que faz diferença.";
}

function elogiarDisposicao(
  manha: string | null | undefined,
  tarde: string | null | undefined,
  noite: string | null | undefined
): string | null {
  if (manha !== "Boa" || tarde !== "Boa" || noite !== "Boa") return null;
  return "Sua disposição física está boa ao longo de todo o dia — um bom sinal de que seu corpo está respondendo bem à sua rotina atual.";
}

function elogiarRotinaAlimentar(frequenciaRestaurante: string | null | undefined): string | null {
  if (frequenciaRestaurante !== "Não tenho esse costume") return null;
  return "Você raramente depende de restaurante ou delivery, o que facilita bastante manter o controle da sua alimentação no dia a dia.";
}

/** Prioridade numérica por tipo de ponto de atenção (menor = mais
 *  importante) — segue a ordem clínica combinada: condições/situações de
 *  risco alto primeiro, depois hábitos de vida, do que mais impacta a saúde
 *  para o que menos impacta. */
const TEXTOS_CONDICAO: Partial<Record<CondicaoSaude, { titulo: string; texto: string; prioridade: number }>> = {
  diabetes_tipo1: {
    titulo: "Diabetes",
    prioridade: 2,
    texto:
      "Um dos pontos que pede atenção especial é o controle da diabetes. Vamos cuidar da distribuição dos " +
      "carboidratos ao longo do dia para ajudar a manter sua glicemia mais estável — o acompanhamento com seu " +
      "médico continua sendo essencial junto com a alimentação.",
  },
  diabetes_tipo2: {
    titulo: "Diabetes",
    prioridade: 2,
    texto:
      "Um dos pontos que pede atenção especial é o controle da diabetes. Vamos cuidar da distribuição dos " +
      "carboidratos ao longo do dia para ajudar a manter sua glicemia mais estável — o acompanhamento com seu " +
      "médico continua sendo essencial junto com a alimentação.",
  },
  hipertensao: {
    titulo: "Pressão arterial",
    prioridade: 3,
    texto:
      "Um dos pontos que merece atenção é sua pressão arterial. Como você tem hipertensão, pequenos ajustes — " +
      "como moderar o sal e os industrializados — podem contribuir bastante para um melhor controle ao longo do tempo.",
  },
  doenca_renal: {
    titulo: "Saúde renal",
    prioridade: 4,
    texto:
      "Sua condição renal pede um cuidado extra com a quantidade de proteína e sódio na alimentação. Vamos " +
      "trabalhar com valores mais conservadores, e o ideal é sempre alinhar isso de perto com seu nefrologista.",
  },
  hipotireoidismo: {
    titulo: "Tireoide",
    prioridade: 6,
    texto:
      "Alterações de tireoide pedem atenção especial porque afetam seu metabolismo de um jeito que a alimentação " +
      "sozinha não resolve completamente. Vamos priorizar iodo e fibra na sua rotina, e o acompanhamento médico " +
      "continua importante.",
  },
  hipertireoidismo: {
    titulo: "Tireoide",
    prioridade: 6,
    texto:
      "Alterações de tireoide pedem atenção especial porque afetam seu metabolismo de um jeito que a alimentação " +
      "sozinha não resolve completamente. Nesse caso, vamos garantir calorias e proteína suficientes para evitar " +
      "perda de massa muscular, e o acompanhamento médico continua importante.",
  },
  colesterol_alto: {
    titulo: "Colesterol",
    prioridade: 6,
    texto:
      "Seu colesterol é outro ponto que vamos cuidar juntos — priorizando gorduras boas (azeite, castanhas, " +
      "peixes) e moderando frituras e gordura saturada no dia a dia.",
  },
};

function montarBlocosCondicoesSaude(params: {
  condicoesSaude: CondicaoSaude[];
  classificacaoImc: string;
  gestante: boolean;
  lactante: boolean;
  historicoTranstornoAlimentar: boolean;
  condicaoClinicaComplexa: string | null;
  perdaPesoNaoIntencional: string | null | undefined;
  ganhoPesoNaoIntencional: string | null | undefined;
}): PontoAtencao[] {
  const blocos: PontoAtencao[] = [];

  if (params.condicaoClinicaComplexa) {
    blocos.push({
      chave: "condicao_clinica_complexa",
      titulo: "Cuidado especial recomendado",
      prioridade: 1,
      categoria: "condicao_saude",
      texto:
        `Você mencionou "${params.condicaoClinicaComplexa}" — esse é um cuidado que pede acompanhamento ` +
        "nutricional presencial, com cálculos individualizados que vão além do que conseguimos fazer com segurança " +
        "por aqui. Por enquanto, deixamos sua meta em manutenção; procure um nutricionista ou seu médico para dar " +
        "os próximos passos com segurança.",
    });
  }
  if (params.gestante) {
    blocos.push({
      chave: "gestante",
      titulo: "Gestação",
      prioridade: 1,
      categoria: "condicao_saude",
      texto:
        "Como você está grávida, ajustamos sua meta para manutenção calórica, sem déficit nem superávit — o ideal " +
        "nessa fase é ter acompanhamento próximo de um nutricionista ou obstetra para orientações individualizadas.",
    });
  }
  if (params.lactante) {
    blocos.push({
      chave: "lactante",
      titulo: "Amamentação",
      prioridade: 1,
      categoria: "condicao_saude",
      texto:
        "Como você está amamentando, ajustamos sua meta para manutenção calórica — essa fase pede acompanhamento " +
        "próximo de um profissional para garantir que tanto você quanto o bebê tenham o suporte nutricional certo.",
    });
  }
  if (params.historicoTranstornoAlimentar) {
    blocos.push({
      chave: "transtorno_alimentar",
      titulo: "Histórico de transtorno alimentar",
      prioridade: 1,
      categoria: "condicao_saude",
      texto:
        "Como você compartilhou um histórico de transtorno alimentar, preferimos não aplicar nenhum déficit ou " +
        "superávit automático — sua meta ficou em manutenção. Esse é um cuidado que merece acompanhamento próximo " +
        "de um profissional especializado, e estamos aqui para apoiar o que vier depois disso.",
    });
  }

  const titulosJaAdicionados = new Set<string>();
  for (const condicao of params.condicoesSaude) {
    const info = TEXTOS_CONDICAO[condicao];
    if (!info || titulosJaAdicionados.has(info.titulo)) continue;
    titulosJaAdicionados.add(info.titulo);
    blocos.push({ chave: condicao, titulo: info.titulo, prioridade: info.prioridade, categoria: "condicao_saude", texto: info.texto });
  }

  if (params.classificacaoImc === "Obesidade grau II" || params.classificacaoImc === "Obesidade grau III") {
    blocos.push({
      chave: "peso_corporal",
      titulo: "Peso corporal",
      prioridade: 5,
      categoria: "condicao_saude",
      texto:
        "Seu peso atual está numa faixa que pede atenção redobrada — mas isso não muda o caminho: pequenas " +
        "mudanças consistentes na alimentação, mantidas ao longo do tempo, costumam trazer resultados reais e " +
        "duradouros nesse cenário.",
    });
  } else if (params.classificacaoImc === "Abaixo do peso") {
    blocos.push({
      chave: "peso_corporal",
      titulo: "Peso corporal",
      prioridade: 5,
      categoria: "condicao_saude",
      texto:
        "Seu peso atual está abaixo da faixa considerada saudável para sua altura. Vamos focar em ganhar peso de " +
        "forma gradual e segura, e recomendamos fortemente somar isso a um acompanhamento presencial.",
    });
  }

  if (params.perdaPesoNaoIntencional && params.perdaPesoNaoIntencional.trim()) {
    blocos.push({
      chave: "mudanca_peso",
      titulo: "Perda de peso recente",
      prioridade: 2,
      categoria: "condicao_saude",
      texto:
        "Você mencionou ter perdido peso recentemente sem intenção de fazer isso — vale a pena investigar essa " +
        "mudança com um médico ou nutricionista presencialmente, mesmo que o restante da consulta não tenha " +
        "apontado nada preocupante.",
    });
  }
  if (params.ganhoPesoNaoIntencional && params.ganhoPesoNaoIntencional.trim()) {
    blocos.push({
      chave: "mudanca_peso",
      titulo: "Ganho de peso recente",
      prioridade: 2,
      categoria: "condicao_saude",
      texto:
        "Você mencionou ter ganhado peso recentemente sem intenção de fazer isso — vale comentar com um médico ou " +
        "nutricionista presencialmente, principalmente se não conseguir associar isso a uma mudança clara de rotina.",
    });
  }

  return blocos;
}

function montarBlocosHabitosVida(params: {
  nivelAtividade: NivelAtividade;
  objetivo: ObjetivoNutricional;
  ingestaoAguaCopos: string | null | undefined;
  aguaMl: number;
  horasSono: string | null | undefined;
  qualidadeSono: number | null;
  insonia: boolean;
  nivelEstresse: number | null;
  consumoAlcool: ConsumoAlcool;
  tabagismo: StatusTabagismo;
  frequenciaRestaurante: string | null | undefined;
  mastigacao: string | null | undefined;
  rotinaTrabalho: string | null | undefined;
}): PontoAtencao[] {
  const blocos: PontoAtencao[] = [];

  if (params.objetivo === "emagrecimento" && (params.nivelAtividade === "sedentario" || params.nivelAtividade === "leve")) {
    blocos.push({
      chave: "sedentarismo",
      titulo: "Atividade física",
      prioridade: 7,
      categoria: "habito_vida",
      texto:
        "Seu nível de atividade física ainda está baixo para o seu objetivo. A recomendação é de 150 a 300 " +
        "minutos por semana de atividade moderada (ou 75-150 minutos intensa), mais fortalecimento muscular 2x ou " +
        "mais por semana — aumentar isso aos poucos tende a acelerar bastante o resultado, junto com a alimentação.",
    });
  }

  const copos = params.ingestaoAguaCopos != null ? parseInt(params.ingestaoAguaCopos, 10) : NaN;
  if (!Number.isNaN(copos)) {
    const aguaRelatadaMl = copos * 250;
    if (aguaRelatadaMl < params.aguaMl * 0.8) {
      const litrosFaltando = Math.max(0.25, (params.aguaMl - aguaRelatadaMl) / 1000);
      blocos.push({
        chave: "agua",
        titulo: "Hidratação",
        prioridade: 8,
        categoria: "habito_vida",
        texto:
          `Sua recomendação diária é de aproximadamente ${(params.aguaMl / 1000).toFixed(1)} litros. Pela sua ` +
          `resposta, ainda faltam cerca de ${litrosFaltando.toFixed(1)} litro por dia para chegar lá — ir ` +
          "aumentando aos poucos, com um copo a mais em horários fixos, costuma ajudar bastante a criar o hábito.",
      });
    }
  }

  const duracaoRuim = params.horasSono === "< 4 horas" || params.horasSono === "4 a 6 horas";
  const qualidadeRuim = params.qualidadeSono != null && params.qualidadeSono <= 2;
  if (duracaoRuim || qualidadeRuim || params.insonia) {
    blocos.push({
      chave: "sono",
      titulo: "Sono",
      prioridade: 9,
      categoria: "habito_vida",
      texto: params.insonia
        ? "Você relatou insônia, e isso interfere bastante no apetite e na composição corporal — vale a pena " +
          "investigar isso com um profissional se persistir, além de tentar manter horários de sono mais regulares."
        : "Seu sono ainda não está no ponto ideal (a referência para adultos é de 7 a 9 horas por noite, com boa " +
          "qualidade). Dormir melhor pode ajudar tanto quanto um ajuste na dieta, porque sono ruim aumenta a fome " +
          "ao longo do dia.",
    });
  }

  if (params.nivelEstresse != null && params.nivelEstresse >= 4) {
    blocos.push({
      chave: "estresse",
      titulo: "Estresse",
      prioridade: 10,
      categoria: "habito_vida",
      texto:
        "Seu nível de estresse está alto, e isso conta mais do que parece: o estresse crônico eleva o cortisol e " +
        "pode dificultar tanto o emagrecimento quanto o ganho de massa. Vale cuidar disso em paralelo com a " +
        "alimentação — mesmo pequenas pausas ao longo do dia já ajudam.",
    });
  }

  if (params.consumoAlcool === "moderado" || params.consumoAlcool === "frequente") {
    const dicaReducao =
      params.objetivo === "emagrecimento"
        ? " Reduzir a frequência é o que mais ajuda nesse caso — o álcool pausa a queima de gordura por várias " +
          "horas depois de beber. Se for continuar bebendo, evitar misturadores açucarados e petiscos salgados já " +
          "reduz bastante o impacto."
        : "";
    blocos.push({
      chave: "alcool",
      titulo: "Álcool",
      prioridade: 11,
      categoria: "habito_vida",
      texto:
        "O álcool tem calorias que não entram no cálculo do seu plano, então quanto mais frequente o consumo, " +
        `mais isso pode pesar no seu resultado.${dicaReducao}`,
    });
  }

  if (params.tabagismo === "fumante") {
    blocos.push({
      chave: "tabagismo",
      titulo: "Tabagismo",
      prioridade: 11,
      categoria: "habito_vida",
      texto:
        "Fumar aumenta a necessidade de vitamina C pelo estresse oxidativo do cigarro — vale incluir mais frutas " +
        "cítricas, acerola, goiaba e vegetais crus na rotina. E se um dia fizer sentido buscar apoio para parar, " +
        "isso teria um impacto na sua saúde maior do que qualquer ajuste na dieta.",
    });
  }

  if (params.frequenciaRestaurante === "3 a 4 vezes por semana" || params.frequenciaRestaurante === "Sempre") {
    blocos.push({
      chave: "delivery",
      titulo: "Restaurante e delivery",
      prioridade: 12,
      categoria: "habito_vida",
      texto:
        "Você come fora (restaurante, bar ou delivery) com bastante frequência. Não precisa cortar completamente " +
        "— só escolher com um pouco mais de atenção nesses dias (grelhados, saladas, evitar refrigerante) já faz " +
        "diferença.",
    });
  }

  if (params.mastigacao === "Rápida demais, sempre termino primeiro.") {
    blocos.push({
      chave: "mastigacao",
      titulo: "Mastigação",
      prioridade: 13,
      categoria: "habito_vida",
      texto:
        "Você relatou que come rápido. Tentar pausar entre garfadas e mastigar mais devagar ajuda o cérebro a " +
        "reconhecer a saciedade a tempo — o corpo leva de 15 a 20 minutos para sentir esse sinal.",
    });
  }

  const rotinaNormalizada = params.rotinaTrabalho ? normalizar(params.rotinaTrabalho) : "";
  if (["noturno", "turno", "madrugada", "plantao", "escala", "revezamento"].some((t) => rotinaNormalizada.includes(t))) {
    blocos.push({
      chave: "rotina_trabalho",
      titulo: "Rotina de trabalho",
      prioridade: 12,
      categoria: "habito_vida",
      texto:
        "Sua rotina parece incluir turno noturno ou horários irregulares, o que está associado a mais risco " +
        "metabólico. Manter horários de refeição o mais fixos possível dentro da sua escala ajuda bastante, mesmo " +
        "que não sejam horários 'convencionais'.",
    });
  }

  return blocos;
}

function montarAlimentacao(params: {
  restricoesAlimentares: string[];
  historicoDietetico: string | null | undefined;
  dietaAnterior: string | null | undefined;
}): string {
  const normalizadas = params.restricoesAlimentares.map(normalizar);
  const eVegano = normalizadas.some((r) => r.includes("vegan"));
  const eVegetariano = !eVegano && normalizadas.some((r) => r.includes("vegetarian"));

  const partes: string[] = [];
  partes.push(
    params.historicoDietetico && params.historicoDietetico.trim()
      ? "Pelo que você descreveu da sua rotina alimentar, já dá para montar um plano que se encaixa bem no seu " +
        "dia a dia — vamos manter o que já funciona para você e ajustar só o que for necessário para bater suas metas."
      : "Vamos montar seu plano alimentar já pensando em algo prático para a sua rotina."
  );

  if (eVegano) {
    partes.push(
      "Como sua alimentação é vegana, vamos ficar de olho principalmente em vitamina B12 (que não existe em " +
        "fontes vegetais e geralmente pede suplementação), além de ferro, cálcio, zinco e ômega-3 — vale conversar " +
        "com um nutricionista sobre suplementação."
    );
  } else if (eVegetariano) {
    partes.push(
      "Como sua alimentação é vegetariana, vamos dar atenção especial a ferro, cálcio e vitamina B12, " +
        "principalmente se ovos e laticínios não estiverem sempre presentes — combinar fontes vegetais de ferro " +
        "com vitamina C ajuda bastante na absorção."
    );
  }

  if (params.dietaAnterior && normalizar(params.dietaAnterior) !== "não") {
    partes.push(
      "Como você já tentou outras dietas antes, vamos priorizar um ritmo mais gradual desta vez — mudanças " +
        "pequenas e consistentes tendem a durar muito mais do que restrições radicais."
    );
  }

  return partes.join(" ");
}

/** Mapeia a chave de cada ponto de atenção pra uma frase de ação curta,
 *  usada na seção "Próximas Prioridades" (só as 5 primeiras, na ordem de
 *  prioridade já aplicada em pontosAtencao). */
const FRASE_PRIORIDADE: Record<string, string> = {
  condicao_clinica_complexa: "Buscar acompanhamento presencial para sua condição de saúde",
  gestante: "Manter acompanhamento próximo durante a gestação",
  lactante: "Manter acompanhamento próximo durante a amamentação",
  transtorno_alimentar: "Buscar acompanhamento especializado",
  diabetes_tipo1: "Cuidar da distribuição de carboidratos ao longo do dia",
  diabetes_tipo2: "Cuidar da distribuição de carboidratos ao longo do dia",
  hipertensao: "Reduzir o sódio no dia a dia",
  doenca_renal: "Manter a proteína dentro do limite conversado com seu médico",
  hipotireoidismo: "Acompanhar sua tireoide de perto",
  hipertireoidismo: "Acompanhar sua tireoide de perto",
  colesterol_alto: "Priorizar gorduras boas e reduzir frituras",
  peso_corporal: "Focar em mudanças graduais no peso corporal",
  mudanca_peso: "Investigar a mudança de peso recente com um profissional",
  sedentarismo: "Aumentar gradualmente sua atividade física",
  agua: "Aumentar sua ingestão de água",
  sono: "Melhorar a qualidade e a duração do sono",
  estresse: "Cuidar do seu nível de estresse",
  alcool: "Reduzir a frequência do consumo de álcool",
  tabagismo: "Buscar apoio para reduzir o cigarro",
  delivery: "Reduzir a frequência de delivery e restaurante",
  mastigacao: "Mastigar com mais calma nas refeições",
  rotina_trabalho: "Fixar horários de refeição dentro da sua escala de trabalho",
};

function montarPrioridades(pontosAtencao: PontoAtencao[]): string[] {
  const vistas = new Set<string>();
  const prioridades: string[] = [];
  for (const ponto of pontosAtencao) {
    const frase = FRASE_PRIORIDADE[ponto.chave];
    if (!frase || vistas.has(frase)) continue;
    vistas.add(frase);
    prioridades.push(frase);
    if (prioridades.length >= 5) break;
  }
  return prioridades;
}

function montarMensagemFinal(pontosFortes: string[], pontosAtencao: PontoAtencao[]): string {
  if (pontosAtencao.length === 0) {
    return (
      "Você já reúne ótimos hábitos para alcançar seu objetivo — nosso trabalho agora é manter essa consistência " +
      "e ajustar os detalhes finos junto com o plano alimentar. Continue assim!"
    );
  }
  if (pontosFortes.length === 0) {
    return (
      "Esse é só o começo: pequenas mudanças consistentes costumam gerar resultados muito maiores do que " +
      "mudanças radicais. Vamos trabalhar juntos, um passo de cada vez, nos pontos que mais importam agora."
    );
  }
  return (
    "Você já possui hábitos importantes que servem de base para alcançar seu objetivo. Agora vamos trabalhar " +
    "juntos para melhorar gradualmente os pontos que ainda precisam de atenção — lembre-se de que resultados " +
    "duradouros normalmente vêm de pequenas mudanças consistentes, não de mudanças radicais."
  );
}

function montarResumoGeral(
  imc: number,
  classificacaoImc: string,
  objetivo: ObjetivoNutricional,
  metaCalorica: number,
  avisoSeguranca: string | null
): string {
  const base =
    `Após analisar suas respostas, seu IMC está na faixa de ${classificacaoImc.toLowerCase()} e o foco a partir ` +
    `de agora vai ser ${OBJETIVO_TEXTO[objetivo]}.`;
  if (avisoSeguranca) return `${base} ${avisoSeguranca}`;
  return `${base} Sua meta calórica foi definida em ${metaCalorica} kcal por dia, buscando um resultado gradual e seguro.`;
}

function montarRelatorioConsulta(params: {
  imc: number;
  classificacaoImc: string;
  tmb: number;
  tdee: number;
  metaCalorica: number;
  objetivo: ObjetivoNutricional;
  avisoSeguranca: string | null;
  avisoMetaPeso: string | null;
  condicoesSaude: CondicaoSaude[];
  gestante: boolean;
  lactante: boolean;
  historicoTranstornoAlimentar: boolean;
  condicaoClinicaComplexa: string | null;
  perdaPesoNaoIntencional: string | null | undefined;
  ganhoPesoNaoIntencional: string | null | undefined;
  nivelAtividade: NivelAtividade;
  ingestaoAguaCopos: string | null | undefined;
  aguaMl: number;
  horasSono: string | null | undefined;
  qualidadeSono: number | null;
  insonia: boolean;
  nivelEstresse: number | null;
  consumoAlcool: ConsumoAlcool;
  tabagismo: StatusTabagismo;
  frequenciaRestaurante: string | null | undefined;
  mastigacao: string | null | undefined;
  rotinaTrabalho: string | null | undefined;
  disposicaoManha: string | null | undefined;
  disposicaoTarde: string | null | undefined;
  disposicaoNoite: string | null | undefined;
  restricoesAlimentares: string[];
  historicoDietetico: string | null | undefined;
  dietaAnterior: string | null | undefined;
}): RelatorioConsulta {
  const pontosFortes = [
    elogiarSono(params.qualidadeSono, params.horasSono, params.insonia),
    elogiarHidratacao(params.ingestaoAguaCopos, params.aguaMl),
    elogiarAtividadeFisica(params.nivelAtividade),
    elogiarAlcool(params.consumoAlcool),
    elogiarTabagismo(params.tabagismo),
    elogiarEstresse(params.nivelEstresse),
    elogiarMastigacao(params.mastigacao),
    elogiarDisposicao(params.disposicaoManha, params.disposicaoTarde, params.disposicaoNoite),
    elogiarRotinaAlimentar(params.frequenciaRestaurante),
  ].filter((texto): texto is string => Boolean(texto));

  const condicoesSaude = montarBlocosCondicoesSaude({
    condicoesSaude: params.condicoesSaude,
    classificacaoImc: params.classificacaoImc,
    gestante: params.gestante,
    lactante: params.lactante,
    historicoTranstornoAlimentar: params.historicoTranstornoAlimentar,
    condicaoClinicaComplexa: params.condicaoClinicaComplexa,
    perdaPesoNaoIntencional: params.perdaPesoNaoIntencional,
    ganhoPesoNaoIntencional: params.ganhoPesoNaoIntencional,
  });

  const habitosVida = montarBlocosHabitosVida({
    nivelAtividade: params.nivelAtividade,
    objetivo: params.objetivo,
    ingestaoAguaCopos: params.ingestaoAguaCopos,
    aguaMl: params.aguaMl,
    horasSono: params.horasSono,
    qualidadeSono: params.qualidadeSono,
    insonia: params.insonia,
    nivelEstresse: params.nivelEstresse,
    consumoAlcool: params.consumoAlcool,
    tabagismo: params.tabagismo,
    frequenciaRestaurante: params.frequenciaRestaurante,
    mastigacao: params.mastigacao,
    rotinaTrabalho: params.rotinaTrabalho,
  });

  const pontosAtencao = [...condicoesSaude, ...habitosVida].sort((a, b) => a.prioridade - b.prioridade);

  return {
    imc: params.imc,
    classificacaoImc: params.classificacaoImc,
    tmb: params.tmb,
    tdee: params.tdee,
    metaCalorica: params.metaCalorica,
    resumoGeral: montarResumoGeral(params.imc, params.classificacaoImc, params.objetivo, params.metaCalorica, params.avisoSeguranca),
    pontosFortes,
    pontosAtencao,
    condicoesSaude,
    habitosVida,
    alimentacao: montarAlimentacao({
      restricoesAlimentares: params.restricoesAlimentares,
      historicoDietetico: params.historicoDietetico,
      dietaAnterior: params.dietaAnterior,
    }),
    prioridades: montarPrioridades(pontosAtencao),
    mensagemFinal: montarMensagemFinal(pontosFortes, pontosAtencao),
    avisoMetaPeso: params.avisoMetaPeso,
  };
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
  avisoMetaPeso: string | null;
  avisosMudancaPeso: string[];
  avisosCondicoes: string[];
  avisosGestacaoCondicao: string[];
  avisosObjetivoRisco: string[];
  avisosAlcool: string[];
  avisosAlcoolReducaoDeDanos: string[];
  avisosTabagismo: string[];
  avisosSono: string[];
  avisosSonoDuracao: string[];
  avisosDieta: string[];
  avisosMedicamentos: string[];
  avisosAtividade: string[];
  avisosHidratacao: string[];
  avisosHistoricoDietas: string[];
  avisosRiscoFamiliar: string[];
  avisosRotinaTrabalho: string[];
  avisosMastigacao: string[];
  avisosFrequenciaRestaurante: string[];
  observacoesPaciente?: string | null;
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

  if (params.avisoMetaPeso) {
    paragrafos.push(`⚠️ Sobre a meta de peso que você informou: ${params.avisoMetaPeso}`);
  }

  if (params.avisosMudancaPeso.length > 0) {
    paragrafos.push(`⚠️ ${params.avisosMudancaPeso.join(" ")}`);
  }

  const blocoCondicoes = [
    ...params.avisosGestacaoCondicao,
    ...params.avisosCondicoes,
    ...params.avisosObjetivoRisco,
    ...params.avisosRiscoFamiliar,
  ];
  if (blocoCondicoes.length > 0) {
    paragrafos.push(`Sobre suas condições de saúde: ${blocoCondicoes.join(" ")}`);
  }

  const blocoHabitos = [
    ...params.avisosAlcool,
    ...params.avisosAlcoolReducaoDeDanos,
    ...params.avisosTabagismo,
    ...params.avisosSono,
    ...params.avisosSonoDuracao,
    ...params.avisosAtividade,
    ...params.avisosRotinaTrabalho,
    ...params.avisosHidratacao,
  ];
  if (blocoHabitos.length > 0) {
    paragrafos.push(`Sobre seus hábitos: ${blocoHabitos.join(" ")}`);
  }

  const blocoAlimentacao = [
    ...params.avisosDieta,
    ...params.avisosMedicamentos,
    ...params.avisosHistoricoDietas,
    ...params.avisosMastigacao,
    ...params.avisosFrequenciaRestaurante,
  ];
  if (blocoAlimentacao.length > 0) {
    paragrafos.push(blocoAlimentacao.join(" "));
  }

  if (params.observacoesPaciente?.trim()) {
    paragrafos.push(
      `Você também comentou: "${params.observacoesPaciente.trim()}" — vou levar isso em conta no seu plano.`
    );
  }

  paragrafos.push(
    "O plano alimentar já foi montado em cima dessas metas — qualquer dúvida ou mudança, é só voltar numa consulta de retorno."
  );

  return paragrafos.join("\n\n");
}

/**
 * Perda ou ganho de peso recente e NÃO intencional são sinais que um
 * nutricionista sempre investiga — podem ter causas que vão de estresse e
 * rotina até condições médicas que precisam de avaliação. Isso nunca é
 * ignorado só porque a pessoa não marcou nenhuma condição de saúde específica
 * em outra parte da consulta.
 */
export function avaliarMudancaPesoNaoIntencional(
  perdaPesoNaoIntencional: string | null | undefined,
  ganhoPesoNaoIntencional: string | null | undefined
): string[] {
  const avisos: string[] = [];
  if (perdaPesoNaoIntencional && perdaPesoNaoIntencional.trim()) {
    avisos.push(
      "Você relatou perda de peso recente e não intencional. Isso é algo que vale investigar com um médico ou " +
        "nutricionista presencialmente — perder peso sem estar buscando isso pode ter várias causas e merece uma " +
        "avaliação, independente do que mais apareceu nesta consulta."
    );
  }
  if (ganhoPesoNaoIntencional && ganhoPesoNaoIntencional.trim()) {
    avisos.push(
      "Você relatou ganho de peso recente e não intencional. Vale comentar isso com um médico ou nutricionista " +
        "presencialmente, principalmente se não conseguir associar a uma mudança clara de rotina ou alimentação."
    );
  }
  return avisos;
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
    observacoesPaciente?: string | null;
    pesoMetaKg?: number | null;
    insonia?: boolean;
    historicoCirurgias?: string | null;
    perdaPesoNaoIntencional?: string | null;
    ganhoPesoNaoIntencional?: string | null;
    horasSono?: string | null;
    ingestaoAguaCopos?: string | null;
    dietaAnterior?: string | null;
    historicoDietetico?: string | null;
    doencasFamiliares?: string[];
    rotinaTrabalho?: string | null;
    mastigacao?: string | null;
    frequenciaRestaurante?: string | null;
    // Usados só pelo relatório em cartões (seção "o que você já faz bem") —
    // não entram em nenhum cálculo, são só registro/contexto, igual aos
    // outros campos da anamnese de 40 perguntas.
    disposicaoManha?: string | null;
    disposicaoTarde?: string | null;
    disposicaoNoite?: string | null;
  } & CondicaoEspecial
): ResultadoAvaliacao {
  const imc = calcularIMC(dados);
  const classificacaoImc = classificarIMC(imc);
  const { pesoMetaKg: pesoMetaSeguro, avisoMetaPeso } = avaliarSegurancaMetaPeso(
    dados.pesoMetaKg,
    dados.pesoKg,
    classificacaoImc,
    dados.historicoTranstornoAlimentar ?? false
  );
  const tmb = calcularTMB(dados);
  const tdee = calcularTDEE(tmb, dados.nivelAtividade);
  // Extraído pra variável própria (antes era só uma expressão inline) porque o
  // relatório em cartões também precisa desse valor mais abaixo — mesma
  // chamada de identificarCondicaoClinicaComplexa, sem mudar o que ela faz.
  const condicaoClinicaComplexa = identificarCondicaoClinicaComplexa(
    [dados.condicoesSaudeOutras, dados.historicoCirurgias].filter(Boolean).join(" ")
  );
  const { valor: metaCalorica, avisoSeguranca } = calcularMetaCalorica(tdee, dados.objetivo, dados.genero, {
    gestante: dados.gestante,
    lactante: dados.lactante,
    historicoTranstornoAlimentar: dados.historicoTranstornoAlimentar,
    imcAbaixoDoPesoComObjetivoEmagrecimento: imc < 18.5 && dados.objetivo === "emagrecimento",
    condicaoClinicaComplexa,
  });

  const { avisos: avisosCondicoes, limiteProteinaPorKg } = avaliarCondicoesSaude(dados.condicoesSaude ?? []);
  const macros = calcularMacros(metaCalorica, dados.pesoKg, dados.objetivo, limiteProteinaPorKg);
  const aguaMl = calcularAguaRecomendada(dados.pesoKg, dados.nivelAtividade, {
    gestante: dados.gestante,
    lactante: dados.lactante,
  });
  const avisosSono = avaliarSonoEEstresse(dados.qualidadeSono ?? null, dados.nivelEstresse ?? null, dados.insonia ?? false);
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
  const avisosMudancaPeso = avaliarMudancaPesoNaoIntencional(dados.perdaPesoNaoIntencional, dados.ganhoPesoNaoIntencional);

  // Novos cruzamentos (campos antes coletados e nunca usados) — ver
  // pesquisa/plano compartilhado com a nutricionista antes de implementar.
  const avisosAlcoolReducaoDeDanos = avaliarAlcoolReducaoDeDanos(dados.consumoAlcool ?? "nunca", dados.objetivo);
  const avisosAtividade = avaliarAtividadeVsObjetivo(dados.nivelAtividade, dados.objetivo);
  const avisosSonoDuracao = avaliarSonoDuracao(dados.horasSono);
  const avisosHidratacao = avaliarHidratacaoReal(dados.ingestaoAguaCopos, aguaMl);
  const avisosHistoricoDietas = avaliarHistoricoDietas(dados.dietaAnterior);
  const avisosRiscoFamiliar = avaliarRiscoFamiliar(dados.doencasFamiliares ?? [], dados.condicoesSaude ?? [], classificacaoImc);
  const avisosRotinaTrabalho = avaliarRotinaTrabalho(dados.rotinaTrabalho);
  const avisosMastigacao = avaliarMastigacao(dados.mastigacao);
  const avisosFrequenciaRestaurante = avaliarFrequenciaRestaurante(dados.frequenciaRestaurante);

  const avisos = [
    avisoMetaPeso,
    avisoSeguranca,
    ...avisosMudancaPeso,
    ...avisosGestacaoCondicao,
    ...avisosCondicoes,
    ...avisosRiscoFamiliar,
    ...avisosAlcool,
    ...avisosAlcoolReducaoDeDanos,
    ...avisosTabagismo,
    ...avisosSono,
    ...avisosSonoDuracao,
    ...avisosAtividade,
    ...avisosRotinaTrabalho,
    ...avisosHidratacao,
    ...avisosDieta,
    ...avisosObjetivoRisco,
    ...avisosMedicamentos,
    ...avisosHistoricoDietas,
    ...avisosMastigacao,
    ...avisosFrequenciaRestaurante,
  ].filter((a): a is string => Boolean(a));

  const resumo = montarResumoConsulta({
    imc,
    classificacaoImc,
    metaCalorica,
    objetivo: dados.objetivo,
    avisoSeguranca,
    avisoMetaPeso,
    avisosMudancaPeso,
    avisosCondicoes,
    avisosGestacaoCondicao,
    avisosObjetivoRisco,
    avisosAlcool,
    avisosAlcoolReducaoDeDanos,
    avisosTabagismo,
    avisosSono,
    avisosSonoDuracao,
    avisosDieta,
    avisosMedicamentos,
    avisosAtividade,
    avisosHidratacao,
    avisosHistoricoDietas,
    avisosRiscoFamiliar,
    avisosRotinaTrabalho,
    avisosMastigacao,
    avisosFrequenciaRestaurante,
    observacoesPaciente: dados.observacoesPaciente,
  });

  const relatorio = montarRelatorioConsulta({
    imc,
    classificacaoImc,
    tmb,
    tdee,
    metaCalorica,
    objetivo: dados.objetivo,
    avisoSeguranca,
    avisoMetaPeso,
    condicoesSaude: dados.condicoesSaude ?? [],
    gestante: dados.gestante ?? false,
    lactante: dados.lactante ?? false,
    historicoTranstornoAlimentar: dados.historicoTranstornoAlimentar ?? false,
    condicaoClinicaComplexa,
    perdaPesoNaoIntencional: dados.perdaPesoNaoIntencional,
    ganhoPesoNaoIntencional: dados.ganhoPesoNaoIntencional,
    nivelAtividade: dados.nivelAtividade,
    ingestaoAguaCopos: dados.ingestaoAguaCopos,
    aguaMl,
    horasSono: dados.horasSono,
    qualidadeSono: dados.qualidadeSono ?? null,
    insonia: dados.insonia ?? false,
    nivelEstresse: dados.nivelEstresse ?? null,
    consumoAlcool: dados.consumoAlcool ?? "nunca",
    tabagismo: dados.tabagismo ?? "nunca",
    frequenciaRestaurante: dados.frequenciaRestaurante,
    mastigacao: dados.mastigacao,
    rotinaTrabalho: dados.rotinaTrabalho,
    disposicaoManha: dados.disposicaoManha,
    disposicaoTarde: dados.disposicaoTarde,
    disposicaoNoite: dados.disposicaoNoite,
    restricoesAlimentares: dados.restricoesAlimentares ?? [],
    historicoDietetico: dados.historicoDietetico,
    dietaAnterior: dados.dietaAnterior,
  });

  return {
    imc,
    classificacaoImc,
    tmb,
    tdee,
    metaCalorica,
    macros,
    aguaMl,
    avisos,
    resumo,
    pesoMetaKg: pesoMetaSeguro,
    avisoMetaPeso,
    relatorio,
  };
}

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}
