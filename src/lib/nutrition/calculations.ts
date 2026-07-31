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

/**
 * Biblioteca clínica de interpretações: pra cada situação (sono bom, água
 * insuficiente, hipertensão, etc.) existem várias variantes de texto —
 * escritas com o mesmo cuidado e tom, mudando só a forma de explicar —
 * escolhidas de forma determinística por rotação, nunca por IA. A escolha
 * usa o número da consulta do paciente (1ª, 2ª, 3ª...) somado a um hash da
 * chave da situação, então: (a) duas consultas seguidas da MESMA pessoa
 * praticamente nunca repetem a mesma frase pro mesmo ponto — só repetem
 * depois de passar por todas as variantes daquela situação; (b) pessoas
 * diferentes com o mesmo perfil não recebem sempre o texto idêntico. Tudo
 * isso sem precisar guardar histórico algum: dado o mesmo número de consulta
 * e a mesma chave, o resultado é sempre o mesmo (fácil de testar).
 */
function escolherVariante(variantes: string[], chave: string, numeroConsulta: number): string {
  if (variantes.length === 0) return "";
  let hash = 0;
  for (let i = 0; i < chave.length; i++) hash = (hash * 31 + chave.charCodeAt(i)) % 997;
  const indice = (hash + Math.max(0, numeroConsulta - 1)) % variantes.length;
  return variantes[indice];
}

// =============================================================
// BIBLIOTECA CLÍNICA OFICIAL — Módulos 1 a 9 (fonte: biblioteca_clinica_nutri_em_casa.md)
// Cada array abaixo corresponde a uma subseção do documento oficial.
// =============================================================

// --- Módulo 1: IMC ---
const TEXTOS_IMC_BAIXO = [
  "Seu peso atual está um pouco abaixo da faixa esperada para sua altura, e isso já é uma informação valiosa para desenharmos o plano. Corpos com pouca reserva energética tendem a priorizar funções básicas antes de investir em massa muscular. Pequenos aumentos na densidade calórica das refeições — como incluir azeite, castanhas e abacate — costumam ajudar mais do que simplesmente comer maiores quantidades.",
  "Chama atenção que seu peso esteja abaixo da faixa considerada ideal. Isso geralmente acontece quando o corpo recebe menos energia do que gasta ao longo do dia, mesmo sem perceber. Distribuir refeições a cada três ou quatro horas pode ajudar o organismo a manter um ritmo mais constante de nutrientes disponíveis.",
  "Um IMC mais baixo costuma levantar uma pergunta simples: será que as refeições do dia estão sustentando toda a energia que sua rotina exige? Isso importa porque reservas insuficientes afetam disposição, concentração e até a qualidade do sono. Priorizar proteínas de boa qualidade em todas as refeições principais tende a favorecer o ganho de peso de forma saudável.",
  "Você parece estar em uma fase em que o corpo pede mais suporte nutricional do que está recebendo. Isso não é incomum, principalmente em rotinas corridas onde as refeições acabam ficando pequenas ou espaçadas demais. Uma estratégia interessante é adicionar um lanche calórico entre as refeições principais, como iogurte com granola e frutas.",
  "O peso abaixo da faixa recomendada costuma vir acompanhado de pouco apetite ou saciedade precoce, o que dificulta comer o suficiente em poucas refeições. Entender esse padrão ajuda a pensar em soluções práticas, como reduzir líquidos durante as refeições para abrir mais espaço para o alimento sólido.",
  "Ganhar peso de forma saudável exige tanto quanto perder peso: um planejamento cuidadoso. O corpo precisa de um excedente energético constante para construir tecido, e isso se conquista com refeições regulares e bem distribuídas ao longo do dia, não apenas com uma refeição maior à noite.",
  "Seu IMC atual sinaliza a necessidade de reforçar o aporte calórico total do dia. Isso costuma acontecer quando a rotina é muito ativa ou quando o apetite naturalmente é menor. Combinar carboidratos de boa qualidade com proteínas em cada refeição pode ajudar o corpo a aproveitar melhor a energia recebida.",
  "Vale destacar que peso baixo nem sempre significa má alimentação — muitas vezes é uma questão de quantidade insuficiente diante de um gasto energético elevado. Mapear os horários em que a fome aparece pode ajudar a posicionar melhor as refeições principais e os lanches.",
  "O organismo em déficit energético prolongado tende a preservar funções essenciais e reduzir investimento em massa muscular, o que explica a dificuldade de ganhar peso mesmo comendo razoavelmente bem. Aumentar gradualmente as porções, sem pressa, costuma ser mais sustentável do que mudanças bruscas na alimentação.",
  "Seu peso está abaixo do esperado para o seu biotipo, o que pode estar relacionado a um metabolismo mais acelerado ou a refeições menores do que o necessário. Pequenas mudanças, como adicionar uma colher de pasta de amendoim ao lanche da tarde, aumentam a densidade calórica sem grande volume extra de comida.",
  "Uma curiosidade que costuma ajudar nesses casos: o corpo gasta energia até para digerir os próprios alimentos, e proteínas exigem mais desse gasto do que gorduras. Por isso, equilibrar bem os grupos alimentares em cada prato favorece o ganho de peso sem sobrecarregar a digestão.",
  "Encontrar-se abaixo do peso ideal costuma pedir mais atenção à frequência das refeições do que à quantidade isolada de cada uma. Um café da manhã mais reforçado, por exemplo, tende a facilitar o restante do dia, já que evita picos de fome que dificultam comer o suficiente depois.",
  "Seu resultado de IMC mostra espaço para ganho de peso de forma gradual e saudável. Isso costuma envolver dois pilares: aumentar levemente as porções e garantir proteína suficiente para que esse peso ganho venha, principalmente, na forma de massa muscular.",
  "É comum que pessoas com IMC baixo tenham uma rotina agitada, que naturalmente reduz o tempo e o apetite para comer. Reservar alguns minutos para as refeições, sem pressa, pode ajudar o corpo a reconhecer melhor os sinais de fome e saciedade.",
  "O peso corporal reflete, entre outras coisas, o equilíbrio entre o que se come e o que se gasta. Estando abaixo da faixa esperada, uma estratégia prática é adicionar uma refeição extra ao dia, mesmo que pequena, para aumentar o aporte total sem depender de porções muito grandes.",
  "Seu corpo pode estar sinalizando que precisa de mais suporte energético para sustentar as atividades do dia a dia com mais disposição. Combinar alimentos calóricos e nutritivos, como frutas secas, oleaginosas e laticínios integrais, é uma forma prática de aumentar as calorias sem aumentar muito o volume das refeições.",
  "Nem sempre o peso baixo incomoda no dia a dia, mas ele pode impactar a imunidade e a energia disponível para as atividades físicas. Vale a pena observar como você se sente ao longo do dia — cansaço frequente pode ser um sinal de que vale reforçar a alimentação.",
  "Seu IMC está na faixa que costuma pedir um acompanhamento mais próximo do ganho de peso. Isso não significa comer sem critério, mas sim de forma mais estratégica: refeições completas, com boa variedade de nutrientes, entregues em intervalos regulares ao longo do dia.",
];

const TEXTOS_IMC_NORMAL = [
  "Seu peso está dentro da faixa considerada saudável para sua altura, o que é uma excelente base para trabalharmos qualquer objetivo. Manter esse equilíbrio costuma ser mais fácil quando os hábitos alimentares já estão bem estruturados, e é justamente esse ponto que vale a pena preservar.",
  "Estar com o IMC dentro da faixa esperada mostra que o equilíbrio entre o que você come e o que seu corpo gasta está funcionando bem. Isso não significa que tudo precise ficar exatamente como está — pequenos ajustes ainda podem trazer mais qualidade de vida, mesmo sem mudar o peso.",
  "Um peso dentro da faixa normal é um ótimo ponto de partida, especialmente porque abre espaço para focar em outros aspectos, como composição corporal, disposição e qualidade do sono, em vez de se concentrar apenas no número da balança.",
  "Seu IMC atual reflete um bom equilíbrio nutricional ao longo do tempo. Isso costuma ser resultado de hábitos consistentes, mesmo que pequenos, mantidos ao longo dos dias. Vale a pena identificar quais desses hábitos têm feito a diferença, para que continuem fazendo parte da rotina.",
  "Estar dentro do peso considerado saudável é importante, mas vale lembrar que o IMC sozinho não conta toda a história — composição corporal, hábitos alimentares e nível de atividade física também merecem atenção para uma avaliação completa da saúde.",
  "O fato de o peso estar equilibrado é um sinal positivo para qualquer objetivo que você tenha em mente, seja manter a forma atual, ganhar massa muscular ou simplesmente melhorar a qualidade da alimentação no dia a dia.",
  "Seu IMC dentro da faixa esperada sugere que o corpo está recebendo, em média, a quantidade de energia que precisa. Esse equilíbrio é uma boa oportunidade para investir em qualidade nutricional, priorizando alimentos mais naturais e variados nas refeições.",
  "Manter o peso dentro da faixa saudável costuma exigir menos esforço do que alcançá-lo, mas ainda assim pede atenção contínua. Pequenos desequilíbrios ao longo do tempo podem passar despercebidos, por isso vale a pena manter check-ins periódicos com os próprios hábitos.",
  "Seu resultado mostra equilíbrio entre ingestão e gasto energético, o que é uma conquista que merece ser reconhecida. A partir daqui, o foco pode se voltar para outros pilares da saúde, como a qualidade do sono, o nível de estresse e a prática regular de atividade física.",
  "Peso dentro da faixa esperada é um indicador importante, mas ele funciona melhor quando olhado junto com outros aspectos da rotina. Isso ajuda a construir uma visão mais completa de como seu corpo está funcionando no dia a dia.",
  "Uma curiosidade interessante: o IMC foi criado como uma ferramenta populacional, não individual, por isso ele funciona melhor como um ponto de partida do que como resposta definitiva. Estando dentro da faixa esperada, é um bom sinal, mas a avaliação completa sempre considera outros fatores.",
  "Seu peso equilibrado mostra que os hábitos atuais estão, no geral, alinhados com as necessidades do seu corpo. Esse é um ótimo momento para refinar detalhes, como a qualidade dos alimentos consumidos e a regularidade das refeições ao longo do dia.",
  "Estar com o peso dentro da faixa saudável costuma facilitar o alcance de outros objetivos, como ganho de massa muscular ou melhora do condicionamento físico, já que o corpo não precisa gastar energia se ajustando a um desequilíbrio calórico importante.",
  "O equilíbrio de peso que você apresenta é um reflexo de escolhas consistentes ao longo do tempo. Vale a pena reconhecer esse resultado e usar esse momento para fortalecer ainda mais hábitos como a variedade alimentar e a hidratação adequada.",
  "Seu IMC dentro da faixa esperada é um bom indicativo geral de saúde metabólica, mas cada corpo é único. Conversar sobre como você se sente no dia a dia — energia, digestão, sono — ajuda a entender se esse equilíbrio numérico também se traduz em bem-estar real.",
];

const TEXTOS_IMC_SOBREPESO = [
  "Seu IMC está um pouco acima da faixa considerada ideal, o que é um ponto de partida comum para muitas pessoas que buscam mais equilíbrio na rotina. Pequenos ajustes na alimentação, mantidos com constância, costumam trazer resultados mais duradouros do que mudanças radicais e temporárias.",
  "Estar na faixa de sobrepeso significa que o corpo está recebendo, em média, um pouco mais de energia do que consegue utilizar. Isso não acontece da noite para o dia, e por isso a reversão também costuma ser gradual — o importante é a direção da mudança, não a velocidade.",
  "Um IMC levemente elevado costuma ser um bom momento para revisar hábitos antes que eles se consolidem ainda mais. Observar quais refeições do dia têm mais espaço para ajuste, como lanches noturnos ou porções muito grandes, pode ser um caminho prático para começar.",
  "Seu peso atual está acima da faixa esperada, e isso costuma estar relacionado tanto à quantidade quanto à qualidade das refeições ao longo do dia. Priorizar alimentos com maior densidade nutricional, como vegetais e proteínas magras, ajuda a promover saciedade com menos calorias.",
  "O sobrepeso, na maioria dos casos, é resultado do acúmulo de pequenos excessos ao longo do tempo, não de um único hábito isolado. Por isso, pequenas mudanças sustentadas — como reduzir o açúcar do café ou aumentar os vegetais no almoço — tendem a gerar resultados mais consistentes que dietas restritivas.",
  "Como seu objetivo envolve equilíbrio de peso, vale lembrar que o corpo responde melhor a mudanças graduais do que a cortes bruscos. Reduzir porções aos poucos e aumentar a presença de fibras nas refeições são estratégias que costumam trazer bons resultados sem gerar sensação de restrição.",
  "Seu IMC indica sobrepeso, uma faixa em que pequenos ajustes na rotina já costumam gerar impacto perceptível na disposição e no bem-estar, mesmo antes de grandes mudanças no peso. Isso serve como um bom estímulo para manter a consistência nas primeiras semanas.",
  "Estar acima do peso recomendado é um dado importante, mas vale olhar também para onde essa gordura está distribuída e como sua rotina de atividade física está estruturada. Esses fatores, juntos, ajudam a entender melhor o cenário completo de saúde.",
  "Um dos primeiros passos diante do sobrepeso costuma ser simples: aumentar a presença de vegetais no prato antes de qualquer outro ajuste. Isso ajuda a criar espaço físico e visual para o restante da refeição, favorecendo naturalmente porções mais equilibradas.",
  "Seu peso atual sugere que o corpo está acumulando um excedente energético moderado. A boa notícia é que, nesse estágio, mudanças relativamente simples — como caminhar mais no dia a dia e reduzir bebidas açucaradas — já costumam gerar resultados visíveis em poucas semanas.",
  "O sobrepeso é uma fase intermediária que, quando percebida cedo, tende a ser revertida com mais facilidade do que estágios mais avançados. Esse é um bom momento para investir em hábitos sustentáveis, sem pressa e sem radicalismo.",
  "Seu IMC acima da faixa ideal pode estar relacionado a fatores como estresse, sono irregular ou rotina alimentar desorganizada, além da alimentação em si. Vale a pena olhar para o quadro completo, não apenas para o prato.",
  "Reduzir gradualmente o peso corporal costuma trazer benefícios que vão além da estética: menos sobrecarga nas articulações, melhora na disposição e redução de riscos metabólicos a longo prazo. Esses ganhos costumam aparecer mesmo com perdas modestas, de 5% a 10% do peso atual.",
  "Seu peso atual está acima do recomendado, mas isso não anula os hábitos positivos que você já tem. O foco pode estar em ajustar pontos específicos — como o tamanho das porções no jantar — em vez de reformular toda a rotina alimentar de uma vez.",
  "Uma curiosidade útil: reduzir apenas 500 a 700 calorias por dia, de forma sustentável, já é suficiente para gerar perda de peso gradual e saudável ao longo das semanas, sem necessidade de dietas extremas ou restritivas.",
  "O sobrepeso costuma responder bem a mudanças de rotina simples, como trocar bebidas açucaradas por água, aumentar a quantidade de proteína nas refeições e caminhar um pouco mais todos os dias. São ajustes pequenos, mas com efeito cumulativo relevante.",
  "Seu IMC na faixa de sobrepeso é um convite para revisar a rotina como um todo, incluindo sono, estresse e nível de atividade física, já que todos esses fatores influenciam o peso corporal, não apenas a alimentação isoladamente.",
];

const TEXTOS_IMC_OBESIDADE_I = [
  "Seu IMC está na faixa classificada como obesidade grau I, um estágio em que o acompanhamento nutricional costuma fazer bastante diferença nos resultados. O caminho aqui não precisa ser rápido — ele precisa ser sustentável, com metas realistas construídas em etapas.",
  "Estar na faixa de obesidade grau I significa que o excedente energético acumulado já é mais expressivo, mas ainda em um estágio em que mudanças de hábito trazem resultados consistentes com relativa agilidade. O foco inicial pode estar em organizar horários e composição das refeições.",
  "Esse resultado de IMC costuma vir acompanhado de outros sinais no corpo, como mais cansaço ou dificuldade de locomoção em atividades do dia a dia. Reconhecer isso ajuda a entender por que pequenas mudanças, como aumentar a movimentação diária, já trazem ganhos perceptíveis de bem-estar.",
  "Na obesidade grau I, o corpo já convive com um excesso de peso que pode começar a impactar articulações e disposição. A boa notícia é que perdas moderadas — entre 5% e 10% do peso atual — já costumam gerar melhoras significativas em marcadores de saúde.",
  "Seu IMC nessa faixa pede um olhar mais estruturado sobre a rotina alimentar, sem que isso signifique dietas restritivas. Organizar as refeições principais, garantir proteína e fibras em quantidade adequada e reduzir ultraprocessados costuma ser um ponto de partida eficiente.",
  "A obesidade grau I é um estágio em que o corpo ainda responde de forma bastante positiva a mudanças graduais. Isso é encorajador: pequenos ajustes mantidos ao longo de semanas tendem a gerar resultados visíveis, tanto na balança quanto na disposição do dia a dia.",
  "Esse resultado costuma estar relacionado a um padrão de consumo energético acima do gasto, mantido por um período mais longo. Entender esse histórico, sem julgamento, ajuda a construir um plano realista que respeite o ritmo de cada pessoa.",
  "Seu peso atual pede atenção redobrada, mas isso não significa que tudo precisa mudar de uma vez. Escolher uma ou duas mudanças por vez — como reduzir refrigerante e aumentar vegetais — costuma ser mais sustentável do que reformular a rotina inteira de imediato.",
  "A obesidade grau I está associada a um risco moderadamente elevado para condições como pressão alta e alterações metabólicas, mas esse risco tende a diminuir de forma expressiva com perdas de peso ainda modestas, o que torna o esforço inicial bastante recompensador.",
  "Seu IMC nessa faixa mostra que o corpo pode se beneficiar de um plano alimentar mais estruturado, com refeições regulares e melhor distribuição de macronutrientes ao longo do dia. Isso ajuda a reduzir picos de fome que costumam levar a escolhas menos planejadas.",
  "Um ponto importante nesse estágio é priorizar consistência sobre perfeição. Manter bons hábitos na maior parte dos dias, mesmo com deslizes ocasionais, tende a gerar resultados muito mais duradouros do que buscar uma rotina alimentar perfeita e inflexível.",
  "Seu resultado de IMC reforça a importância de olhar para o corpo de forma integral: alimentação, sono, estresse e movimento caminham juntos. Ajustar apenas a comida, sem considerar esses outros pilares, costuma trazer resultados mais lentos.",
  "A obesidade grau I costuma responder bem à combinação de pequenas mudanças alimentares com aumento gradual da atividade física, mesmo que em intensidade leve, como caminhadas regulares. O importante é começar de onde você está agora, sem comparação com outros pontos de partida.",
  "Seu IMC atual é um dado, não uma sentença. Ele mostra onde você está hoje e ajuda a traçar um caminho realista daqui para frente, com metas de curto prazo que tornam o processo mais leve e menos intimidador.",
  "Nesse estágio, vale a pena investir tempo entendendo os gatilhos que levam a escolhas alimentares menos equilibradas — estresse, cansaço, tédio — já que atuar sobre esses gatilhos costuma trazer resultados mais duradouros do que apenas contar calorias.",
  "Seu peso atual pede um plano com metas parciais, revisadas a cada poucas semanas. Isso ajuda a manter a motivação e permite ajustes no percurso, já que o corpo e a rotina de cada pessoa respondem de formas diferentes ao longo do processo.",
];

const TEXTOS_IMC_OBESIDADE_II = [
  "Seu IMC está na faixa classificada como obesidade grau II, um estágio que pede acompanhamento mais próximo, mas que também responde muito bem a mudanças graduais e bem orientadas. O primeiro passo não precisa ser grande — precisa apenas ser possível de manter.",
  "Nesse estágio, o excesso de peso já costuma impactar de forma mais perceptível a disposição, o sono e até a mobilidade no dia a dia. Reconhecer esses sinais ajuda a entender a importância de um plano estruturado, construído em etapas realistas.",
  "A obesidade grau II está associada a um risco mais elevado para condições metabólicas e cardiovasculares, mas é importante lembrar que mesmo perdas moderadas de peso, entre 5% e 10%, já trazem benefícios significativos e mensuráveis para a saúde.",
  "Seu resultado de IMC pede um olhar cuidadoso e multidisciplinar, que pode incluir apoio médico além do nutricional, especialmente se houver outras condições associadas. O trabalho em conjunto costuma trazer resultados mais consistentes e seguros.",
  "Nesse ponto da jornada, pequenas conquistas diárias merecem ser celebradas: beber mais água, incluir um vegetal a mais no prato, caminhar por dez minutos. Esses gestos, somados ao longo do tempo, constroem a base para mudanças mais amplas.",
  "A obesidade grau II costuma vir acompanhada de um histórico de tentativas anteriores de emagrecimento, muitas vezes frustradas por métodos muito restritivos. Por isso, construir um plano realista e flexível tende a ter mais chance de sucesso a longo prazo.",
  "Seu IMC atual reflete anos de hábitos acumulados, e é importante ter paciência com o processo de mudança, que também será gradual. Estabelecer metas de curto prazo, revisadas periodicamente, ajuda a manter o processo mais leve e sustentável.",
  "Nesse estágio, cuidar da relação com a comida é tão importante quanto ajustar o cardápio. Entender os momentos em que a fome emocional aparece, sem julgamento, é um passo importante para construir mudanças duradouras.",
  "Seu peso atual pede atenção a fatores que muitas vezes passam despercebidos, como qualidade do sono e níveis de estresse, já que ambos influenciam diretamente os hormônios relacionados à fome e à saciedade.",
  "A obesidade grau II é um estágio sério, mas reversível com o suporte adequado. O acompanhamento contínuo, com ajustes ao longo do caminho, costuma ser mais eficaz do que planos rígidos definidos de uma única vez.",
  "Vale lembrar que resultados consistentes, mesmo que graduais, tendem a durar mais do que perdas rápidas e drásticas. Reduzir o ritmo de expectativa pode, paradoxalmente, acelerar o sucesso do processo a longo prazo.",
  "Seu IMC nessa faixa reforça a importância de priorizar proteínas e fibras nas refeições, já que ambas favorecem a saciedade e ajudam a reduzir naturalmente o consumo de alimentos mais calóricos ao longo do dia.",
  "Esse é um momento em que pequenas mudanças de ambiente também ajudam bastante: ter opções saudáveis mais acessíveis em casa, planejar as refeições com antecedência e reduzir a presença de ultraprocessados no dia a dia.",
  "Seu resultado de IMC não define seu valor ou esforço — ele é apenas um ponto de partida para construirmos, juntos, um caminho mais saudável. Cada pequena mudança mantida com consistência já representa um avanço real.",
  "Nesse estágio, o movimento físico pode começar de forma bem leve, como caminhadas curtas ou alongamentos, respeitando o corpo e evoluindo gradualmente conforme a disposição for aumentando ao longo das semanas.",
];

const TEXTOS_IMC_OBESIDADE_III = [
  "Seu IMC está na faixa classificada como obesidade grau III, um estágio que pede acompanhamento próximo e multidisciplinar, envolvendo nutrição e, em muitos casos, também acompanhamento médico. Esse cuidado conjunto costuma trazer mais segurança e melhores resultados ao longo do processo.",
  "Nesse estágio, o excesso de peso já costuma trazer impactos importantes na mobilidade, respiração e disposição para atividades simples do dia a dia. Reconhecer esse cenário, sem julgamento, é o primeiro passo para construir um plano de cuidado real e sustentável.",
  "A obesidade grau III está associada a riscos elevados para diversas condições de saúde, mas mesmo aqui, perdas de peso modestas — de 5% a 10% — já trazem benefícios significativos, especialmente para articulações, respiração e marcadores metabólicos.",
  "Seu resultado pede um plano construído com muito cuidado, priorizando segurança e sustentabilidade acima da velocidade. Mudanças bruscas nesse estágio podem ser mais arriscadas do que benéficas, por isso o acompanhamento profissional próximo é especialmente importante.",
  "Nesse ponto da jornada, cada pequeno movimento em direção a hábitos mais equilibrados já representa um avanço significativo. Não é sobre grandes transformações imediatas, mas sobre construir, com apoio adequado, uma base sólida para mudanças duradouras.",
  "A obesidade grau III costuma ter raízes complexas, que envolvem fatores genéticos, hormonais, emocionais e sociais, além da alimentação. Reconhecer essa complexidade ajuda a construir um plano mais compassivo e realista, sem simplificações que geram frustração.",
  "Seu IMC atual reforça a importância de um acompanhamento em equipe, que pode incluir nutricionista, médico e, em alguns casos, psicólogo. Esse suporte combinado costuma trazer resultados mais seguros e consistentes do que tentativas isoladas.",
  "Nesse estágio, pequenas mudanças no ambiente ao redor — como organizar a despensa e planejar as refeições com antecedência — podem facilitar bastante o processo, reduzindo a necessidade de decisões difíceis em momentos de cansaço ou estresse.",
  "Seu peso atual pede paciência e compaixão consigo mesmo. O processo de mudança será gradual, e cada etapa concluída, por menor que pareça, merece ser reconhecida como parte importante do caminho.",
  "A obesidade grau III frequentemente traz junto questões de mobilidade que podem limitar o tipo de atividade física inicial. Isso não é um obstáculo definitivo — existem formas de movimento adaptadas que podem começar de forma leve e segura, mesmo sentado ou na água.",
  "Seu IMC nessa faixa mostra que o corpo está carregando um peso significativo, o que reforça a importância de cuidar também da saúde emocional ao longo do processo, já que mudanças sustentáveis raramente acontecem sem esse suporte.",
  "Nesse estágio, o foco inicial pode estar simplesmente em interromper o ganho de peso, antes mesmo de buscar a perda. Essa estabilização já é, por si só, um resultado importante e um bom ponto de partida.",
  "Seu resultado de IMC não apaga os esforços que você já fez até aqui. Cada tentativa anterior trouxe aprendizados que podem ser usados para construir, agora, um plano mais realista e ajustado à sua realidade atual.",
  "A obesidade grau III pede um ritmo de mudança bem gradual, com metas pequenas e alcançáveis. Isso ajuda a manter a confiança ao longo do processo e reduz o risco de desistência diante de expectativas muito altas.",
  "Seu IMC atual é um convite para reconstruir a relação com o cuidado, com apoio profissional próximo em cada etapa. Não é uma jornada para ser percorrida sozinho, e buscar esse suporte já é, em si, um passo de coragem.",
];

// --- Módulo 2: Objetivo do paciente ---
const TEXTOS_OBJETIVO_EMAGRECIMENTO = [
  "Seu objetivo de emagrecimento pede, acima de tudo, consistência ao longo do tempo. O corpo responde melhor a pequenos déficits calóricos sustentados por semanas do que a restrições intensas e passageiras. Ajustar as porções aos poucos costuma ser mais eficaz do que cortar grupos alimentares inteiros de uma vez.",
  "Emagrecer de forma saudável envolve muito mais do que reduzir calorias — envolve construir uma rotina que você consiga manter no longo prazo. Priorizar alimentos que trazem saciedade, como proteínas e fibras, ajuda a tornar esse processo mais confortável e menos desgastante.",
  "Como seu foco está em perder peso, vale lembrar que resultados visíveis na balança costumam vir depois de mudanças reais de comportamento. Isso significa que os primeiros sinais de progresso muitas vezes aparecem antes na disposição e no sono, antes mesmo do peso mudar.",
  "O processo de emagrecimento tende a ser mais tranquilo quando dividido em metas pequenas e alcançáveis, como reduzir o açúcar do café por duas semanas antes de mexer em outro hábito. Mudanças graduais costumam durar mais do que reformulações completas e repentinas.",
  "Para quem deseja emagrecer, entender os próprios sinais de fome e saciedade é tão importante quanto escolher os alimentos certos. Comer com mais atenção, sem distrações como televisão ou celular, pode ajudar o corpo a reconhecer melhor quando já é suficiente.",
  "Seu objetivo de perda de peso se beneficia bastante de um sono de qualidade, já que noites mal dormidas alteram os hormônios da fome e aumentam a vontade de comer alimentos mais calóricos no dia seguinte. Cuidar do sono é, também, cuidar do emagrecimento.",
  "Emagrecer não precisa significar comer menos o tempo todo — muitas vezes significa comer melhor. Trocar alimentos ultraprocessados por opções mais naturais aumenta a saciedade por caloria consumida, o que facilita naturalmente a redução do total ingerido ao longo do dia.",
  "Uma curiosidade que ajuda nesse processo: o corpo leva cerca de 20 minutos para reconhecer a saciedade depois de começar a comer. Comer mais devagar, mastigando bem, é uma estratégia simples que costuma reduzir naturalmente o volume das refeições.",
  "Como seu objetivo é reduzir o peso corporal, vale destacar que a atividade física entra como aliada, mas não substitui os ajustes alimentares. A combinação dos dois costuma trazer resultados mais consistentes do que apostar em apenas um dos dois pilares.",
  "O emagrecimento saudável costuma respeitar um ritmo de perda entre 0,5 e 1 quilo por semana. Ritmos mais acelerados que isso tendem a ser mais difíceis de sustentar e trazem maior risco de recuperação do peso perdido no futuro.",
  "Para alcançar seu objetivo de emagrecimento, vale a pena observar os momentos do dia em que a alimentação foge mais do planejado, como à noite ou em situações de estresse. Identificar esses padrões ajuda a construir estratégias específicas para cada situação.",
  "Seu foco em perder peso pode se beneficiar de uma reorganização simples: montar o prato com metade de vegetais, um quarto de proteína e um quarto de carboidratos. Essa proporção costuma favorecer a saciedade sem exigir contagem detalhada de calorias.",
  "Emagrecer envolve paciência com o próprio corpo, que muitas vezes reage de forma não linear, com semanas de maior e menor perda de peso. Isso é normal e não significa que o processo parou de funcionar — apenas que o corpo está se ajustando.",
  "Seu objetivo de redução de peso se fortalece quando acompanhado de bons níveis de hidratação, já que a água ajuda na digestão, na saciedade e no funcionamento geral do metabolismo. Manter uma garrafa por perto ao longo do dia pode facilitar esse hábito.",
  "Para quem busca emagrecer, cada escolha alimentar não precisa ser perfeita — precisa apenas, na maioria das vezes, apontar na direção certa. Essa mentalidade tende a reduzir a pressão do processo e aumentar as chances de manter os resultados a longo prazo.",
  "Seu objetivo pede atenção especial às bebidas calóricas, como refrigerantes e sucos industrializados, que costumam adicionar calorias significativas sem gerar saciedade proporcional. Reduzir esse consumo é, muitas vezes, um dos ajustes mais eficientes para acelerar resultados.",
  "O processo de emagrecimento costuma ficar mais leve quando você tem algumas receitas práticas e saudáveis já dominadas, prontas para os dias mais corridos. Isso reduz a dependência de decisões alimentares de última hora, que tendem a ser menos equilibradas.",
];

const TEXTOS_OBJETIVO_HIPERTROFIA = [
  "Seu objetivo de ganho de massa muscular pede um pilar fundamental: proteína suficiente distribuída ao longo do dia. Consumir proteína em todas as refeições principais, em vez de concentrar tudo em uma só, favorece melhor a síntese muscular ao longo das 24 horas.",
  "Construir massa muscular exige um pequeno excedente calórico, já que o corpo precisa de energia extra para sintetizar novo tecido. Esse excedente não precisa ser grande — aumentos moderados e consistentes tendem a favorecer ganho de músculo com menor acúmulo de gordura.",
  "Como seu foco é hipertrofia, o descanso entre os treinos é tão importante quanto a alimentação. É durante o sono e os períodos de recuperação que o músculo efetivamente se reconstrói mais forte, então negligenciar essa parte pode limitar seus resultados.",
  "Ganhar massa muscular envolve consistência de longo prazo, tanto no treino quanto na alimentação. Resultados visíveis costumam levar semanas para aparecer, então manter o padrão alimentar mesmo sem mudanças imediatas na balança é essencial para o processo funcionar.",
  "Para quem busca hipertrofia, distribuir carboidratos ao redor dos horários de treino ajuda a garantir energia disponível para o esforço físico e favorece a recuperação muscular logo depois. Essa estratégia costuma potencializar os resultados do treino.",
  "Seu objetivo de ganho muscular se beneficia de uma boa hidratação, já que a água participa diretamente do transporte de nutrientes até as células musculares e da regulação da temperatura corporal durante o exercício físico.",
  "A hipertrofia depende de estímulo, nutrientes e descanso trabalhando juntos. Focar apenas na alimentação, sem considerar a qualidade do sono e a intensidade adequada do treino, tende a limitar o ritmo dos resultados que você está buscando.",
  "Uma curiosidade interessante: o corpo consegue sintetizar uma quantidade limitada de proteína muscular por refeição, o que reforça a importância de espaçar bem o consumo proteico ao longo do dia, em vez de concentrar tudo em uma única refeição grande.",
  "Seu foco em ganhar massa magra pede atenção também às gorduras boas, presentes em azeite, castanhas e peixes, já que participam da produção de hormônios relacionados ao crescimento muscular. Cortar gordura da dieta pode, na verdade, prejudicar esse objetivo.",
  "Para hipertrofia, vale a pena considerar um lanche com proteína e carboidrato logo após o treino, já que esse período costuma favorecer a reposição de energia e o início do processo de recuperação muscular.",
  "Ganhar massa muscular de forma consistente costuma ser mais eficiente do que buscar resultados rápidos, que geralmente vêm acompanhados de ganho excessivo de gordura junto com o músculo. Paciência aqui tende a gerar uma composição corporal mais equilibrada.",
  "Seu objetivo pede atenção ao total calórico do dia, não apenas à proteína. Sem energia suficiente vinda de carboidratos e gorduras, o corpo pode usar a proteína consumida como fonte de energia, em vez de destiná-la à construção muscular.",
  "Para quem treina buscando hipertrofia, café da manhã com boa quantidade de proteína ajuda a interromper o jejum noturno de forma mais eficiente para a manutenção muscular, além de contribuir para mais disposição ao longo da manhã.",
  "Seu foco em ganho muscular se conecta diretamente à qualidade do sono: é durante as fases mais profundas do sono que o corpo libera hormônios importantes para a recuperação e o crescimento muscular. Dormir bem é, também, treinar bem.",
  "A hipertrofia é um processo gradual que recompensa a paciência. Pequenos ganhos de força e definição, mês após mês, tendem a se somar em resultados expressivos ao longo do tempo, mesmo quando o progresso semanal parece pouco perceptível.",
];

const TEXTOS_OBJETIVO_MANUTENCAO = [
  "Manter o peso e os hábitos atuais é, muitas vezes, tão desafiador quanto alcançá-los. Seu objetivo de manutenção se beneficia de uma rotina alimentar estável, com refeições regulares que sustentem o equilíbrio já conquistado.",
  "Como seu foco está em manutenção, o corpo tende a responder bem a uma alimentação variada, sem grandes restrições, já que essa flexibilidade facilita sustentar os hábitos no longo prazo, inclusive em situações sociais e imprevistos da rotina.",
  "A manutenção de peso pede atenção contínua, mesmo sem grandes mudanças na alimentação. Pequenos desequilíbrios, quando não observados, podem se acumular ao longo dos meses, por isso check-ins periódicos com os próprios hábitos ajudam a manter o rumo.",
  "Seu objetivo de manter os resultados atuais é uma ótima oportunidade para consolidar hábitos como boa hidratação, sono regular e prática constante de atividade física, que sustentam o equilíbrio conquistado de forma mais ampla que apenas a alimentação.",
  "Manter um peso ou hábito conquistado exige menos intensidade do que alcançá-lo, mas ainda pede consistência. A vantagem é que, nesse estágio, há mais espaço para flexibilidade nas escolhas alimentares do dia a dia, sem comprometer o resultado geral.",
  "Para quem busca manutenção, vale a pena olhar para a alimentação com uma lógica de longo prazo: o que funciona para você hoje precisa continuar fazendo sentido daqui a alguns meses, e não apenas nas próximas semanas.",
  "Seu objetivo de estabilidade se fortalece quando você tem algumas refeições de referência já bem estabelecidas na rotina, que servem como base mesmo em dias mais corridos ou imprevisíveis.",
  "Manter os resultados conquistados costuma ser mais fácil quando a alimentação deixa de ser vista como um projeto temporário e passa a fazer parte natural da rotina, sem a sensação de estar seguindo regras rígidas.",
  "Seu foco em manutenção é uma boa fase para experimentar pequenas variações na alimentação, testando novos alimentos e receitas, já que não há a pressão de resultados rápidos que costuma acompanhar outros objetivos.",
  "A manutenção bem-sucedida costuma envolver monitoramento leve, como pesar-se ocasionalmente ou observar como as roupas estão vestindo, para identificar cedo qualquer tendência de mudança antes que ela se torne mais significativa.",
  "Seu objetivo de sustentar os hábitos atuais se beneficia de uma boa relação com a comida, sem culpa em situações sociais ou comemorações. Flexibilidade consciente costuma ser mais sustentável do que rigidez extrema no longo prazo.",
  "Manter resultados exige, muitas vezes, mais atenção mental do que física, já que a motivação inicial de uma mudança de hábito tende a diminuir com o tempo. Encontrar novos motivos para manter a rotina ajuda a sustentar o compromisso.",
  "Seu foco em manutenção pode incluir metas além do peso, como melhorar a qualidade dos alimentos consumidos, aumentar a variedade do cardápio ou fortalecer hábitos de preparo próprio das refeições.",
  "A fase de manutenção é um bom momento para consolidar o aprendizado das etapas anteriores, entendendo quais estratégias realmente funcionaram para você e quais fazem mais sentido manter como parte permanente da rotina.",
  "Seu objetivo de estabilidade se conecta diretamente ao equilíbrio emocional com a comida — comer por prazer, sem excessos nem restrições, costuma ser a chave para sustentar resultados de forma tranquila ao longo dos anos.",
];

const TEXTOS_OBJETIVO_REEDUCACAO = [
  "Buscar reeducação alimentar é um objetivo que vai além do peso — é sobre reconstruir a relação com a comida de forma mais equilibrada e consciente. Esse processo costuma ser gradual, já que hábitos alimentares se formam ao longo de anos.",
  "Seu foco em reeducação alimentar pede paciência com o próprio processo de aprendizado. Trocar hábitos automáticos por escolhas mais conscientes exige repetição e tempo, e cada pequena mudança mantida já representa um avanço real.",
  "A reeducação alimentar costuma funcionar melhor quando feita por etapas, começando por um ou dois hábitos por vez, como aumentar a água ingerida ou incluir mais vegetais nas refeições, antes de avançar para outras mudanças.",
  "Para quem busca reeducação alimentar, entender o porquê de cada escolha costuma ser mais eficaz do que apenas seguir regras. Saber, por exemplo, por que fibras ajudam na saciedade torna mais fácil manter esse hábito no dia a dia.",
  "Seu objetivo de reconstruir hábitos alimentares se beneficia de um ambiente que facilite as boas escolhas, como ter opções saudáveis visíveis e acessíveis em casa, reduzindo a dependência de força de vontade em momentos de cansaço.",
  "A reeducação alimentar não é sobre eliminar alimentos, mas sobre reorganizar a frequência e o contexto em que eles aparecem na rotina. Isso torna o processo mais sustentável e menos associado à sensação de proibição.",
  "Seu foco nesse objetivo pede atenção a padrões automáticos, como comer assistindo televisão ou beliscar por tédio. Identificar esses gatilhos é um passo importante para substituí-los gradualmente por escolhas mais conscientes.",
  "Reconstruir a relação com a alimentação costuma envolver também desfazer crenças rígidas, como a ideia de que existem alimentos totalmente proibidos. Uma abordagem mais flexível tende a durar muito mais tempo do que regras absolutas.",
  "Seu objetivo de reeducação alimentar se fortalece quando você aprende a cozinhar algumas receitas simples e saudáveis, já que isso aumenta a autonomia e reduz a dependência de alimentos prontos ou ultraprocessados no dia a dia.",
  "A reeducação alimentar é um processo de longo prazo, e recaídas ocasionais fazem parte do caminho, não representam fracasso. O que importa é retomar o padrão saudável na refeição seguinte, sem culpa excessiva.",
  "Seu foco em reconstruir hábitos alimentares pede também atenção ao ritmo das refeições — comer com calma, prestando atenção aos sinais do corpo, é parte fundamental de uma relação mais saudável com a comida.",
  "Para quem busca reeducação alimentar, pequenas vitórias diárias merecem reconhecimento: escolher água em vez de refrigerante, ou preparar uma refeição em casa em vez de pedir delivery. Esses momentos, somados, constroem a mudança maior.",
  "Seu objetivo envolve desenvolver mais autonomia nas escolhas alimentares, entendendo rótulos, porções e combinações de alimentos, para que as decisões do dia a dia fiquem cada vez menos dependentes de orientação externa.",
  "A reeducação alimentar costuma trazer benefícios que vão além do prato: mais energia, melhor digestão e uma relação mais tranquila com a comida, sem os ciclos de restrição e exagero que costumam acompanhar dietas tradicionais.",
];

const TEXTOS_OBJETIVO_SAUDE = [
  "Seu foco em saúde é um objetivo amplo e valioso, que coloca o bem-estar geral à frente de metas puramente estéticas. Isso costuma trazer uma relação mais equilibrada com a comida, guiada por como você se sente, não apenas pelo número da balança.",
  "Buscar saúde através da alimentação envolve olhar para o corpo como um todo: energia, digestão, sono, imunidade. Pequenos ajustes na rotina alimentar costumam refletir em melhorias perceptíveis em várias dessas áreas ao mesmo tempo.",
  "Seu objetivo de melhorar a saúde geral se beneficia de uma alimentação variada e colorida, já que diferentes cores de frutas e vegetais costumam indicar diferentes grupos de nutrientes e compostos benéficos para o organismo.",
  "Priorizar saúde é um objetivo que se sustenta bem a longo prazo, já que não depende de resultados rápidos ou visíveis para ser válido. Cada escolha alimentar mais equilibrada já contribui para o funcionamento do corpo, mesmo sem mudanças imediatas na aparência.",
  "Seu foco em saúde pede atenção a fatores muitas vezes esquecidos, como a qualidade do sono e os níveis de estresse, já que ambos influenciam diretamente a digestão, a imunidade e até as escolhas alimentares do dia a dia.",
  "Cuidar da saúde através da alimentação envolve equilíbrio, não perfeição. Ter a maior parte das refeições bem estruturadas, com espaço ocasional para momentos de prazer, costuma ser mais sustentável do que buscar uma dieta impecável o tempo todo.",
  "Seu objetivo de melhorar a saúde geral se fortalece com hábitos simples: beber água regularmente, mastigar com calma, incluir fibras nas refeições. São mudanças pequenas, mas com impacto acumulado significativo ao longo do tempo.",
  "Buscar saúde é também buscar prevenção. Ajustes alimentares feitos hoje, mesmo sem sintomas presentes, ajudam a reduzir riscos futuros relacionados a condições metabólicas e cardiovasculares, tornando o cuidado atual um investimento de longo prazo.",
  "Seu foco em bem-estar geral pede atenção à variedade do cardápio, já que cada grupo alimentar contribui com nutrientes específicos que o corpo precisa. Um prato colorido e diversificado tende a cobrir melhor essas necessidades.",
  "Priorizar saúde envolve também cuidar da relação emocional com a comida, evitando tanto a restrição excessiva quanto o uso da alimentação como única válvula de escape para o estresse do dia a dia.",
  "Seu objetivo de melhorar a saúde geral se beneficia de pequenas checagens periódicas, como exames de rotina, que ajudam a entender se os ajustes alimentares estão realmente refletindo em melhorias nos marcadores de saúde.",
  "Cuidar da saúde é um compromisso contínuo, não um destino final. Isso significa que ajustes vão continuar sendo necessários ao longo da vida, conforme a rotina, a idade e as necessidades do corpo forem mudando naturalmente.",
  "Seu foco em saúde pede atenção redobrada à qualidade da água consumida, à regularidade do sono e ao nível de movimento diário, já que a alimentação é apenas um dos pilares que sustentam o bem-estar geral do corpo.",
];

const TEXTOS_OBJETIVO_PERFORMANCE = [
  "Seu foco em performance pede uma alimentação estrategicamente distribuída ao longo do dia, com atenção especial aos horários próximos aos treinos ou competições, já que a energia disponível nesses momentos influencia diretamente o rendimento.",
  "Buscar melhor performance física envolve equilibrar carboidratos, proteínas e boa hidratação, já que cada um desempenha um papel específico: energia, recuperação muscular e regulação da temperatura corporal durante o esforço físico.",
  "Seu objetivo de melhorar o rendimento físico se beneficia de refeições pré-treino bem planejadas, com boa quantidade de carboidratos de fácil digestão, garantindo energia disponível sem desconforto gástrico durante a atividade.",
  "Para quem busca performance, a recuperação pós-treino é tão importante quanto o treino em si. Uma refeição com proteína e carboidrato logo depois do esforço físico ajuda a repor energia e iniciar o processo de reparação muscular.",
  "Seu foco em rendimento físico pede atenção especial à hidratação, já que mesmo pequenos níveis de desidratação já são suficientes para reduzir perceptivelmente a capacidade física e a concentração durante o exercício.",
  "Melhorar a performance envolve também respeitar os períodos de descanso, já que é durante a recuperação que o corpo se adapta aos estímulos do treino e efetivamente melhora sua capacidade física ao longo do tempo.",
  "Seu objetivo de alto rendimento se beneficia de uma alimentação individualizada, ajustada aos horários e à intensidade dos treinos, já que as necessidades energéticas variam bastante conforme o tipo e a duração da atividade física praticada.",
  "Para performance, o sono de qualidade funciona quase como um treino invisível: é nesse período que o corpo consolida os ganhos de força, resistência e recuperação conquistados ao longo do dia de treino.",
  "Seu foco em melhorar o desempenho físico pede atenção ao equilíbrio entre volume de treino e alimentação, já que déficits calóricos muito agressivos tendem a comprometer a energia disponível para treinos de alta intensidade.",
  "Buscar performance envolve testar e ajustar estratégias nutricionais ao longo do tempo, já que cada corpo responde de forma diferente a horários e composições de refeições antes e depois do exercício físico.",
  "Seu objetivo de alto rendimento se fortalece com boa ingestão de micronutrientes, como ferro, magnésio e vitaminas do complexo B, que participam diretamente da produção de energia e da função muscular durante o esforço físico.",
  "Para quem busca performance, pequenos ajustes no timing das refeições — como comer carboidratos de rápida absorção durante treinos muito longos — podem fazer diferença perceptível na energia e na resistência ao longo da atividade.",
  "Seu foco em rendimento físico pede também atenção à recuperação entre sessões de treino, já que treinar sem descanso suficiente tende a reduzir a performance ao invés de melhorá-la, mesmo com alimentação adequada.",
];

// --- Módulo 3: Atividade física ---
const TEXTOS_ATIVIDADE_SEDENTARIO = [
  "Sua rotina atual parece ter pouco espaço para movimento, o que é comum em dias corridos de trabalho e compromissos. O corpo humano, no entanto, funciona melhor com estímulo regular de movimento, mesmo que em pequenas doses ao longo do dia.",
  "Passar boa parte do dia sem se movimentar costuma impactar não só o peso, mas também a disposição, a qualidade do sono e até o humor. Pequenas pausas ativas, como caminhar por cinco minutos a cada hora, já ajudam a quebrar esse padrão.",
  "Um estilo de vida mais parado pede um primeiro passo simples, sem exigir academia ou equipamentos: caminhadas curtas no início já trazem benefícios perceptíveis para a circulação, o humor e a energia disponível ao longo do dia.",
  "O sedentarismo costuma se instalar de forma gradual, muitas vezes sem perceber, conforme a rotina vai ficando mais corrida. Reconhecer esse padrão é o primeiro passo para reintroduzir movimento de forma leve e progressiva.",
  "Seu nível atual de atividade física sugere bastante espaço para ganhos rápidos de bem-estar, já que o corpo sedentário costuma responder de forma bem perceptível às primeiras semanas de movimento regular, mesmo em intensidade leve.",
  "A falta de movimento no dia a dia está associada a mais fadiga, não menos — pode parecer contraintuitivo, mas o corpo que se movimenta pouco tende a se sentir mais cansado do que aquele que mantém alguma atividade regular.",
  "Iniciar a partir de um estilo de vida sedentário pede metas bem pequenas no começo, como subir escadas em vez de elevador ou caminhar até um local próximo, em vez de usar o carro. Esses gestos simples já contam como movimento.",
  "Seu corpo pode se beneficiar bastante de qualquer movimento adicional na rotina, já que o contraste entre pouca e nenhuma atividade costuma trazer ganhos rápidos de disposição e humor, funcionando como um bom ponto de partida motivador.",
  "Rotinas muito paradas tendem a impactar também a qualidade do sono, já que o corpo associa movimento durante o dia com a necessidade de descanso à noite. Incluir alguma atividade, mesmo leve, pode ajudar a dormir melhor.",
  "Para sair do sedentarismo, escolher uma atividade que seja prazerosa — dançar, caminhar ouvindo música, pedalar — costuma funcionar melhor do que forçar um tipo de exercício que não combina com sua rotina ou preferência pessoal.",
  "Seu nível atual de movimento sugere que qualquer aumento gradual já trará benefícios metabólicos importantes, incluindo melhor controle de glicose e menor acúmulo de gordura abdominal, mesmo antes de mudanças visíveis no peso.",
  "O sedentarismo prolongado pede atenção especial à postura e à saúde das articulações, já que a falta de movimento regular pode enfraquecer a musculatura de sustentação ao longo do tempo.",
  "Reintroduzir movimento na rotina não precisa ser sobre performance ou intensidade — pode começar simplesmente sobre se movimentar mais do que ontem, de forma consistente, sem pressão por resultados imediatos.",
  "Seu estilo de vida atual, com pouco movimento, é um ponto de partida comum e totalmente reversível. O importante é encontrar um primeiro passo que caiba na sua rotina real, não na rotina ideal que imaginamos ter.",
  "A falta de atividade física regular tende a amplificar os efeitos de uma alimentação desequilibrada, já que o corpo tem menos capacidade de utilizar o excedente energético recebido. Incluir movimento pode potencializar os resultados de qualquer ajuste alimentar.",
];

const TEXTOS_ATIVIDADE_POUCOATIVO = [
  "Sua rotina já conta com algum movimento, o que é um bom ponto de partida, mas ainda há espaço para aumentar a frequência ou a intensidade das atividades, especialmente se seu objetivo envolve mudanças mais perceptíveis no corpo.",
  "Ter uma atividade física ocasional é melhor do que nenhuma, mas o corpo tende a responder de forma mais consistente quando o movimento acontece com regularidade, mesmo que em sessões mais curtas ao longo da semana.",
  "Seu nível atual de atividade física sugere que aumentar a frequência, mesmo mantendo a mesma intensidade, já pode trazer ganhos perceptíveis de disposição e condicionamento nas próximas semanas.",
  "Ser pouco ativo costuma significar que o movimento acontece de forma esporádica, sem uma rotina fixa. Estabelecer dias e horários específicos para se exercitar pode ajudar a transformar essa prática ocasional em um hábito mais consistente.",
  "Seu padrão atual de atividade física é um bom sinal de que o movimento já faz parte da sua rotina de alguma forma. Aumentar gradualmente a frequência, de uma para duas ou três vezes por semana, tende a ampliar bastante os benefícios.",
  "Praticar atividade física de forma pouco frequente ainda traz benefícios importantes para o corpo, mas para objetivos mais específicos, como ganho de massa muscular ou emagrecimento mais acelerado, a regularidade costuma fazer bastante diferença nos resultados.",
  "Seu nível de atividade física atual pede uma reflexão simples: o que tem dificultado uma frequência maior de movimento? Entender essa barreira — tempo, cansaço, falta de companhia — ajuda a construir soluções mais realistas.",
  "Ser pouco ativo é um estágio intermediário valioso, já que mostra que o movimento não é estranho à sua rotina. A partir daqui, pequenos ajustes de frequência tendem a gerar resultados visíveis com relativa rapidez.",
  "Seu padrão de atividade física atual se beneficia de metas simples, como duas sessões fixas por semana, agendadas como qualquer outro compromisso importante da rotina, para reduzir a chance de serem deixadas de lado.",
  "A prática ocasional de exercícios já contribui para a saúde cardiovascular e o bem-estar geral, mas aumentar a consistência tende a trazer benefícios adicionais para o controle de peso e para a qualidade do sono.",
  "Seu nível atual de movimento sugere que encontrar uma atividade mais prazerosa pode ser o caminho para aumentar a frequência, já que a falta de identificação com o exercício costuma ser um dos principais motivos de baixa regularidade.",
  "Ser pouco ativo, mas não sedentário, coloca você em uma posição favorável para evoluir com relativa facilidade. Pequenos aumentos de frequência ou duração das atividades já tendem a gerar ganhos perceptíveis em poucas semanas.",
  "Seu padrão de atividade física atual pode se beneficiar de combinar dois tipos de movimento na semana, como caminhada e alongamento, para tornar a rotina mais variada e reduzir o risco de desmotivação por repetição.",
  "A atividade física ocasional que você já pratica é uma base positiva para construir mais consistência. O próximo passo pode ser simplesmente adicionar mais um dia de movimento à semana, sem grandes mudanças na intensidade.",
  "Seu nível atual de movimento mostra que o hábito já existe, só precisa de mais espaço na rotina. Reservar horários fixos no calendário, como se fossem compromissos inadiáveis, costuma ajudar a aumentar a frequência de forma natural.",
];

const TEXTOS_ATIVIDADE_MODERADO = [
  "Seu nível de atividade física está em um ponto bastante positivo, com movimento regular fazendo parte da rotina. Isso já traz benefícios importantes para o metabolismo, a saúde cardiovascular e o bem-estar geral.",
  "Manter uma rotina moderada de exercícios é um equilíbrio saudável entre consistência e sustentabilidade. Esse padrão costuma ser mais fácil de manter a longo prazo do que rotinas muito intensas, que exigem grande disponibilidade de tempo e energia.",
  "Seu padrão atual de atividade física mostra bom comprometimento com o movimento regular. Dependendo do seu objetivo, pequenos ajustes na intensidade ou variedade dos treinos podem potencializar ainda mais os resultados que você já vem construindo.",
  "Ser moderadamente ativo traz benefícios consistentes para o controle de peso, a saúde do coração e a qualidade do sono. Esse nível de atividade já coloca você em uma posição favorável em relação à média da população.",
  "Seu nível de movimento atual sustenta bem objetivos como manutenção de peso e melhora geral da saúde. Para metas mais específicas, como hipertrofia significativa, pode valer a pena conversar sobre ajustes na frequência ou intensidade dos treinos.",
  "A atividade física moderada e regular que você mantém já contribui para reduzir riscos metabólicos e cardiovasculares de forma expressiva, mesmo sem alcançar os níveis de um atleta ou praticante intenso.",
  "Seu padrão de exercícios mostra uma rotina bem estabelecida, o que é uma conquista importante, já que a consistência costuma ser mais desafiadora do que a intensidade isolada de um treino.",
  "Ser moderadamente ativo permite variar entre diferentes tipos de atividade — força, resistência, flexibilidade — o que ajuda a evitar platôs e mantém o corpo respondendo bem aos estímulos ao longo do tempo.",
  "Seu nível de atividade atual sustenta bem as necessidades energéticas do corpo, o que reforça a importância de uma alimentação equilibrada que acompanhe esse gasto, especialmente em proteínas e carboidratos de qualidade.",
  "A rotina moderada de exercícios que você mantém já é suficiente para trazer boa parte dos benefícios associados à atividade física, incluindo melhora do humor, da disposição e da qualidade do sono.",
  "Seu padrão atual de movimento é uma base sólida para evoluir, caso o objetivo envolva ganhos mais expressivos de força ou resistência. Pequenos aumentos progressivos de carga ou duração costumam trazer bons resultados a partir daqui.",
  "Manter-se moderadamente ativo de forma consistente ao longo dos anos costuma trazer mais benefícios de saúde do que períodos intensos e intermitentes de exercício, seguidos de longas pausas.",
  "Seu nível de atividade física atual já favorece um bom equilíbrio hormonal e metabólico, o que reflete positivamente tanto no controle do apetite quanto na qualidade do sono ao longo da semana.",
  "A regularidade que você mantém nos exercícios é um dos fatores mais importantes para resultados de longo prazo, muitas vezes mais relevante do que a intensidade de cada sessão isolada.",
  "Seu padrão de atividade física moderada oferece uma boa margem para ajustes finos, como incluir treinos de força caso o foco seja hipertrofia, ou aumentar o volume aeróbico caso o objetivo seja emagrecimento mais acelerado.",
];

const TEXTOS_ATIVIDADE_MUITOATIVO = [
  "Seu nível de atividade física é bastante elevado, o que exige uma alimentação à altura desse gasto energético, com atenção especial à quantidade de carboidratos e proteínas para sustentar o desempenho e a recuperação.",
  "Manter uma rotina intensa de exercícios traz muitos benefícios, mas também aumenta a necessidade de descanso adequado, já que o corpo precisa de tempo para se recuperar e se adaptar aos estímulos recebidos.",
  "Seu padrão de atividade física elevado sugere que o total calórico das refeições merece atenção redobrada, para garantir que o corpo tenha energia suficiente para sustentar esse ritmo sem comprometer a recuperação.",
  "Ser muito ativo fisicamente é uma conquista importante, mas pede equilíbrio: descanso insuficiente entre os treinos pode aumentar o risco de lesões e prejudicar os próprios resultados que você está buscando.",
  "Seu nível de exercício elevado pede atenção especial à hidratação, já que as perdas de líquido durante treinos intensos e frequentes são maiores, e repor adequadamente ajuda a manter o desempenho e a recuperação.",
  "A rotina intensa de atividade física que você mantém se beneficia bastante de um sono de qualidade, já que é durante o descanso que o corpo consolida boa parte dos ganhos de força e resistência conquistados nos treinos.",
  "Seu padrão de exercícios elevado pede atenção à variedade nutricional, garantindo micronutrientes suficientes, como ferro, magnésio e vitaminas do complexo B, que participam diretamente da produção de energia e da recuperação muscular.",
  "Ser muito ativo fisicamente costuma trazer excelente condicionamento cardiovascular, mas vale observar sinais de cansaço excessivo ou queda de desempenho, que podem indicar necessidade de mais tempo de recuperação entre os treinos.",
  "Seu nível atual de atividade física sustenta objetivos ambiciosos, como hipertrofia significativa ou melhora expressiva de performance, desde que a alimentação e o descanso acompanhem esse ritmo intenso de treino.",
  "A rotina intensa de exercícios pede uma distribuição cuidadosa das refeições ao longo do dia, com atenção especial aos horários próximos aos treinos, para garantir energia disponível e boa recuperação.",
  "Seu padrão elevado de atividade física é impressionante, mas vale lembrar que mais não é sempre melhor — o equilíbrio entre estímulo e recuperação é o que realmente determina os resultados a longo prazo.",
  "Ser muito ativo aumenta consideravelmente as necessidades calóricas totais, e um aporte insuficiente pode levar a fadiga, queda de desempenho e maior risco de lesões, mesmo em pessoas com ótimo condicionamento físico.",
  "Seu nível de atividade física elevado se beneficia de dias de descanso ativo, com movimentos leves como alongamento ou caminhada, que ajudam na recuperação sem interromper completamente a rotina de movimento.",
  "A intensidade da sua rotina de exercícios pede atenção redobrada aos sinais do corpo, como dores persistentes ou cansaço fora do comum, que podem indicar a necessidade de ajustar o volume de treino temporariamente.",
];

const TEXTOS_ATIVIDADE_ATLETA = [
  "Sua rotina de treinos em nível de atleta exige uma estratégia nutricional bastante individualizada, ajustada às fases de treinamento, competição e recuperação, com atenção especial ao timing de nutrientes ao redor dos treinos.",
  "Como atleta, seu corpo tem demandas energéticas e de recuperação muito específicas, que costumam se beneficiar de acompanhamento nutricional próximo, especialmente em períodos de maior volume ou intensidade de treino.",
  "Seu nível de exigência física como atleta pede atenção cuidadosa ao equilíbrio entre carboidratos, proteínas e gorduras, já que cada macronutriente desempenha um papel específico na performance, recuperação e prevenção de lesões.",
  "Ser atleta envolve entender que a alimentação é parte do treinamento, não algo separado dele. Estratégias nutricionais bem ajustadas podem ser o diferencial entre um bom e um ótimo desempenho em competições.",
  "Seu nível de atividade física como atleta pede periodização também na alimentação, com ajustes conforme as fases de base, intensificação e competição, cada uma com necessidades energéticas e de nutrientes distintas.",
  "Como atleta, a recuperação entre sessões de treino é tão estratégica quanto o treino em si. Nutrição adequada logo após o esforço físico, aliada a sono de qualidade, potencializa a adaptação e reduz o risco de lesões por overtraining.",
  "Seu padrão de treino intenso e frequente pede atenção redobrada à hidratação e à reposição de eletrólitos, especialmente em treinos longos ou em ambientes quentes, já que perdas significativas afetam diretamente o desempenho.",
  "Ser atleta de alto rendimento envolve equilibrar a paixão pelo esporte com o cuidado do corpo a longo prazo, já que excessos sem recuperação adequada podem comprometer tanto a performance quanto a saúde ao longo dos anos.",
  "Seu nível de exigência física pede micronutrientes em quantidade adequada, especialmente ferro, cálcio e vitamina D, que participam diretamente da produção de energia, saúde óssea e função muscular durante o treinamento intenso.",
  "Como atleta, cada refeição pode ser pensada estrategicamente em relação ao momento do treino: antes, para garantir energia disponível; depois, para otimizar a recuperação e a reposição de glicogênio muscular.",
  "Seu ritmo intenso de treinamento pede atenção ao sono como parte central da estratégia de performance, já que é durante o descanso que ocorrem os principais processos de adaptação e recuperação muscular.",
  "Ser atleta envolve também escutar o corpo em relação a sinais de fadiga acumulada, já que treinar além da capacidade de recuperação tende a prejudicar o desempenho a médio prazo, mesmo com alimentação impecável.",
  "Seu nível de atividade física em patamar de atleta se beneficia de estratégias nutricionais testadas previamente em treinos, nunca apenas no dia da competição, para evitar desconfortos gástricos ou quedas de energia em momentos decisivos.",
  "Como atleta, pequenos ajustes finos na alimentação — como o tipo de carboidrato consumido antes de provas de longa duração — podem representar diferenças perceptíveis no desempenho final, justificando atenção detalhada a esses aspectos.",
];

// --- Módulo 4: Sono ---
const TEXTOS_SONO_EXCELENTE = [
  "Seu sono parece ser um dos pontos mais positivos da sua rotina, e isso vale muito reconhecimento. Dormir bem regularmente é um dos pilares mais importantes da saúde, influenciando desde o humor até o metabolismo e a regulação hormonal.",
  "A qualidade do seu sono merece um destaque especial. Poucas pessoas conseguem manter esse padrão de forma consistente, e isso já coloca você em vantagem para alcançar qualquer objetivo relacionado à saúde ou à composição corporal.",
  "Dormir bem, como parece ser o seu caso, é um dos fatores que mais favorecem o controle do apetite, já que hormônios como grelina e leptina, responsáveis pela fome e saciedade, se regulam melhor com noites de sono de qualidade.",
  "Seu padrão de sono excelente é uma base sólida para qualquer objetivo nutricional, já que é durante o descanso que o corpo realiza boa parte dos processos de recuperação, regulação hormonal e consolidação de memória.",
  "Manter um sono de excelente qualidade é um hábito que vale muito a pena preservar. Ele funciona como uma base silenciosa que sustenta a energia, o humor e as escolhas alimentares ao longo de todo o dia.",
  "Seu sono de boa qualidade é um diferencial importante, especialmente para quem busca ganho de massa muscular, já que os principais hormônios relacionados à recuperação e ao crescimento são liberados durante as fases mais profundas do sono.",
  "Dormir bem consistentemente, como no seu caso, costuma refletir positivamente até na disposição para se exercitar e na qualidade das escolhas alimentares, já que a privação de sono está associada a mais desejo por alimentos calóricos.",
  "Seu padrão de sono excelente é um dos hábitos mais valiosos para a saúde a longo prazo. Vale a pena manter os fatores que sustentam essa qualidade, como horários regulares e um ambiente propício para dormir.",
  "Ter um sono de excelente qualidade favorece a recuperação muscular, o equilíbrio emocional e até a saúde imunológica, funcionando como uma base que potencializa os resultados de qualquer outro cuidado que você tenha com o corpo.",
  "Seu sono se destaca como um ponto forte da sua rotina. Esse é um ótimo momento para focar energia em outros aspectos, sabendo que essa base de descanso já está bem estabelecida e funcionando a seu favor.",
  "Dormir bem de forma consistente, como parece ser o seu padrão, está associado a menor risco de compulsão alimentar e a uma relação mais equilibrada com a comida ao longo do dia.",
  "Seu sono de excelente qualidade é um ativo importante para a saúde metabólica, já que noites bem dormidas favorecem a sensibilidade à insulina e o equilíbrio dos níveis de glicose no sangue.",
  "Manter esse padrão de sono de qualidade é uma conquista que impacta positivamente quase todos os outros aspectos da saúde, funcionando como um multiplicador silencioso dos resultados de uma boa alimentação e da atividade física.",
  "Seu sono parece bem estruturado, o que é uma ótima notícia — vale a pena entender quais hábitos sustentam essa qualidade, como horário fixo para dormir ou ambiente escuro e silencioso, para preservá-los mesmo em fases mais corridas.",
  "Dormir bem, de forma consistente, é um dos hábitos de saúde mais subestimados. Reconhecer e manter esse ponto forte da sua rotina é tão importante quanto qualquer ajuste na alimentação.",
];

const TEXTOS_SONO_BOM = [
  "Seu sono parece estar em um bom nível, o que já traz benefícios importantes para a recuperação do corpo e o equilíbrio hormonal. Pequenos ajustes na rotina noturna podem elevar ainda mais essa qualidade, caso você sinta necessidade.",
  "Ter um sono de boa qualidade é uma base sólida para sustentar qualquer objetivo relacionado à alimentação ou à atividade física, já que o descanso adequado favorece o controle do apetite e a disposição ao longo do dia.",
  "Seu padrão de sono atual é positivo, e isso conta bastante para o seu bem-estar geral. Manter horários regulares para dormir e acordar tende a preservar essa qualidade mesmo em semanas mais movimentadas.",
  "Dormir bem, como parece ser seu caso na maior parte do tempo, favorece a regulação dos hormônios da fome e da saciedade, o que facilita naturalmente escolhas alimentares mais equilibradas ao longo do dia.",
  "Seu sono de boa qualidade é um ponto positivo importante da sua rotina. Ainda assim, pequenos ajustes, como reduzir telas antes de dormir, podem ajudar a aprofundar ainda mais essa qualidade de descanso.",
  "Ter uma boa qualidade de sono contribui diretamente para a recuperação muscular e a disposição física, especialmente relevante caso seu objetivo envolva ganho de massa muscular ou melhora de performance.",
  "Seu padrão de sono atual sustenta bem as demandas do dia a dia. Vale a pena observar se existem noites específicas em que essa qualidade cai, para entender os fatores que podem estar influenciando.",
  "Dormir bem na maior parte das noites é um hábito valioso que vale a pena preservar. Pequenas rotinas antes de dormir, como reduzir a luminosidade do ambiente, costumam ajudar a manter essa consistência.",
  "Seu sono de boa qualidade favorece o equilíbrio emocional e a capacidade de lidar com o estresse do dia a dia, o que reflete indiretamente também nas escolhas alimentares e na disposição para se exercitar.",
  "Ter um bom padrão de sono é uma conquista que merece ser mantida com atenção, especialmente cuidando de fatores como cafeína no fim do dia ou uso de telas próximo ao horário de dormir.",
  "Seu sono atual sustenta bem os processos de recuperação do corpo, e pequenos ajustes na rotina noturna, como um horário mais regular para dormir, podem levar essa qualidade a um patamar ainda mais alto.",
  "Dormir bem na maior parte das noites contribui para um metabolismo mais equilibrado e para menos oscilações de apetite ao longo do dia, o que facilita a consistência em qualquer objetivo nutricional.",
  "Seu padrão de sono é um ponto positivo que vale a pena valorizar. Mantê-lo estável, mesmo em períodos de mais estresse ou correria, ajuda a sustentar a energia e o bem-estar geral.",
  "Ter uma boa qualidade de sono já traz boa parte dos benefícios associados ao descanso adequado. Caso queira aprimorar ainda mais, vale observar a consistência dos horários de dormir e acordar ao longo da semana.",
  "Seu sono atual é uma base confiável para o seu bem-estar. Pequenos cuidados, como evitar refeições muito pesadas perto da hora de dormir, podem ajudar a manter e até melhorar essa qualidade.",
];

const TEXTOS_SONO_REGULAR = [
  "Seu sono parece variar bastante, com noites melhores e outras nem tanto. Esse padrão irregular pode estar relacionado a horários inconsistentes de dormir ou a fatores do dia a dia, como estresse ou uso de telas à noite.",
  "Um sono de qualidade regular costuma refletir em oscilações de energia e apetite ao longo dos dias. Buscar mais consistência nos horários de dormir e acordar pode ajudar a estabilizar essa qualidade.",
  "Seu padrão atual de sono tem espaço para melhorar, e pequenos ajustes na rotina noturna costumam trazer resultados perceptíveis, como reduzir a exposição a telas na última hora antes de dormir.",
  "Dormir de forma irregular, com qualidade que varia bastante, pode dificultar a regulação dos hormônios relacionados à fome, o que às vezes explica dias com mais vontade de comer alimentos calóricos.",
  "Seu sono regular sugere que alguns hábitos da rotina podem estar interferindo na qualidade do descanso. Vale observar fatores como horário das refeições à noite, consumo de cafeína e nível de estresse antes de dormir.",
  "Ter um sono de qualidade regular é comum e totalmente reversível com pequenos ajustes. Criar uma rotina mais previsível antes de dormir, como ler ou tomar um banho morno, pode ajudar o corpo a relaxar mais facilmente.",
  "Seu padrão de sono atual pede atenção ao ambiente onde você dorme — ruído, luminosidade e temperatura influenciam bastante a qualidade do descanso, mesmo quando o tempo total de sono parece adequado.",
  "Dormir com qualidade regular, nem ruim nem excelente, é um ponto de partida comum para melhorias. Pequenas mudanças de rotina, mantidas com consistência, costumam elevar essa qualidade ao longo de algumas semanas.",
  "Seu sono atual parece sofrer interferências pontuais, o que é bastante comum. Identificar o que muda nas noites de sono mais fraco pode ajudar a entender os gatilhos específicos que afetam seu descanso.",
  "Um padrão de sono regular pode se beneficiar de horários mais fixos para dormir e acordar, mesmo nos finais de semana, já que essa consistência ajuda a regular o relógio biológico do corpo.",
  "Seu sono variando entre bom e mediano sugere que pequenos fatores do dia podem estar influenciando o descanso à noite. Cafeína após o meio da tarde, por exemplo, é um ponto comum que vale a pena observar.",
  "Dormir com qualidade regular ainda permite boa recuperação do corpo, mas otimizar esse padrão pode trazer ganhos extras de disposição e até facilitar o controle do apetite ao longo do dia.",
  "Seu padrão de sono atual é um bom ponto para pequenos experimentos: testar horários diferentes de dormir por algumas semanas pode ajudar a identificar o que funciona melhor para o seu corpo.",
  "Ter uma qualidade de sono regular pede atenção às últimas horas antes de dormir, já que atividades estimulantes, como trabalho ou telas, podem dificultar a transição do corpo para o estado de descanso.",
  "Seu sono atual tem espaço para evoluir com ajustes simples e graduais. Não é necessário mudar tudo de uma vez — escolher um hábito noturno para ajustar por semana já costuma trazer resultados perceptíveis.",
];

const TEXTOS_SONO_RUIM = [
  "Seu sono parece não estar rendendo o descanso que o corpo precisa, e isso é um ponto que merece atenção especial. Dormir mal com frequência afeta praticamente todos os aspectos da saúde, incluindo o apetite e a disposição para se exercitar.",
  "Um sono de qualidade ruim costuma aumentar a vontade de comer alimentos mais calóricos, já que a privação de descanso altera os hormônios relacionados à fome e à saciedade. Reconhecer essa conexão pode ajudar a entender certos dias mais difíceis com a alimentação.",
  "Seu padrão atual de sono pede uma atenção próxima, já que noites mal dormidas de forma recorrente impactam a recuperação muscular, o humor e até a capacidade de tomar decisões alimentares mais equilibradas.",
  "Dormir mal com frequência é um sinal importante de que algo na rotina precisa de ajuste, seja o ambiente de sono, os horários ou o nível de estresse acumulado ao longo do dia.",
  "Seu sono atual sugere que o corpo pode não estar tendo tempo suficiente para os processos de recuperação noturna, o que pode explicar cansaço persistente mesmo em dias sem grande esforço físico.",
  "Um sono de má qualidade costuma vir acompanhado de mais apetite ao longo do dia seguinte, especialmente por alimentos ricos em açúcar e gordura. Entender essa relação pode ajudar a lidar com esses momentos sem julgamento.",
  "Seu padrão de sono pede atenção a hábitos simples que costumam fazer diferença, como reduzir a luz de telas antes de dormir e evitar refeições pesadas nas últimas horas do dia.",
  "Dormir mal com frequência pode estar relacionado a fatores como estresse, ambiente inadequado ou horários muito irregulares. Vale a pena investigar qual desses fatores parece mais presente na sua rotina atual.",
  "Seu sono atual merece prioridade, já que ele impacta diretamente outros aspectos da saúde que estamos trabalhando juntos, incluindo o controle do peso e a disposição para manter hábitos alimentares equilibrados.",
  "Um padrão de sono ruim, mantido por muito tempo, pode aumentar o risco de alterações metabólicas, por isso pequenos ajustes na rotina noturna costumam trazer benefícios que vão muito além do simples descanso.",
  "Seu sono atual pede uma abordagem gradual: em vez de tentar resolver tudo de uma vez, escolher um único hábito para ajustar, como o horário de dormir, costuma trazer resultados mais sustentáveis.",
  "Dormir mal com frequência costuma afetar também a motivação para se exercitar, criando um ciclo em que a falta de sono reduz a energia, e a falta de movimento dificulta ainda mais um sono de qualidade.",
  "Seu padrão de sono atual reforça a importância de cuidar do ambiente onde você dorme: escuridão, silêncio e temperatura agradável são fatores simples que costumam melhorar bastante a qualidade do descanso.",
  "Um sono de qualidade ruim pode estar relacionado ao consumo de cafeína tarde no dia, ao uso de telas próximo do horário de dormir, ou a preocupações que dificultam relaxar. Vale observar qual desses fatores mais se aplica à sua rotina.",
  "Seu sono atual pede cuidado e paciência para melhorar. Pequenas mudanças, sustentadas por algumas semanas, costumam trazer resultados mais consistentes do que soluções rápidas que não se mantêm no longo prazo.",
];

const TEXTOS_SONO_INSONIA = [
  "Lidar com insônia é desafiador, e reconhecer esse ponto já é um passo importante para buscar soluções mais adequadas. A dificuldade para dormir costuma ter múltiplas causas, que vão desde hábitos até fatores emocionais que merecem atenção cuidadosa.",
  "A insônia costuma impactar diretamente o apetite e as escolhas alimentares, já que o corpo em privação de sono tende a buscar mais energia rápida, geralmente vinda de alimentos açucarados ou ultraprocessados.",
  "Seu quadro de insônia merece atenção multidisciplinar, muitas vezes se beneficiando de acompanhamento médico em conjunto com o nutricional, já que fatores hormonais, emocionais e comportamentais costumam estar envolvidos.",
  "Dificuldades para dormir de forma recorrente pedem uma investigação cuidadosa da rotina noturna, incluindo horários de refeições, consumo de cafeína e nível de estresse acumulado ao longo do dia.",
  "A insônia pode estar relacionada a fatores alimentares, como o horário do jantar ou o consumo de estimulantes à noite. Pequenos ajustes nesses pontos, junto com apoio profissional adequado, podem ajudar a melhorar gradualmente o quadro.",
  "Seu relato de dificuldade para dormir reforça a importância de uma rotina noturna mais estruturada, com horários consistentes e um ambiente que favoreça o relaxamento antes de deitar.",
  "A insônia costuma criar um ciclo difícil: a falta de sono aumenta o estresse, e o estresse dificulta ainda mais dormir. Buscar apoio profissional para quebrar esse ciclo é um passo importante e válido.",
  "Seu quadro atual pede atenção a estimulantes como cafeína e telas eletrônicas nas horas que antecedem o sono, já que ambos podem intensificar a dificuldade de adormecer, mesmo em pequenas quantidades.",
  "Conviver com insônia impacta bastante a energia e a disposição ao longo do dia, o que reforça a importância de um cuidado conjunto entre nutrição, atividade física leve e, quando necessário, acompanhamento médico especializado.",
  "A dificuldade para dormir pode estar relacionada a desequilíbrios de magnésio ou outros micronutrientes, entre outros fatores. Vale conversar sobre a alimentação atual para identificar possíveis pontos de ajuste nesse sentido.",
  "Seu quadro de insônia é importante e merece cuidado sem pressa, já que soluções rápidas raramente resolvem causas mais profundas. Um acompanhamento próximo ajuda a identificar as raízes específicas do seu caso.",
  "A insônia recorrente pede atenção também ao horário e à composição do jantar, já que refeições muito pesadas ou muito próximas do horário de dormir podem dificultar ainda mais o processo de adormecer.",
  "Seu relato de insônia reforça a importância de técnicas de relaxamento antes de dormir, como respiração guiada ou redução gradual de estímulos, combinadas com hábitos alimentares que favoreçam o sono, como evitar cafeína à tarde.",
  "Lidar com dificuldade persistente para dormir pede paciência e, muitas vezes, apoio profissional especializado, já que a insônia crônica costuma ter causas que vão além de simples ajustes de rotina.",
  "Seu quadro de insônia é um ponto central a ser trabalhado, já que ele influencia praticamente todos os outros aspectos da saúde, desde o apetite até a disposição para manter hábitos alimentares equilibrados.",
];

const TEXTOS_SONO_MEDICACAO = [
  "O uso de medicação para dormir é uma estratégia válida quando orientada por um profissional, e reconhecer essa necessidade já mostra cuidado com a própria saúde. Vale manter o acompanhamento médico responsável por essa prescrição atualizado.",
  "Utilizar medicação para conseguir dormir costuma vir acompanhado de outros ajustes de rotina que podem potencializar os resultados, como horários regulares de sono e redução de estimulantes ao longo do dia.",
  "Seu uso de medicação para dormir é uma informação importante para o cuidado nutricional, já que alguns medicamentos podem influenciar o apetite ou o metabolismo, o que reforça a importância de um olhar integrado entre as áreas.",
  "Precisar de apoio medicamentoso para dormir não é motivo para desconforto — é uma ferramenta que, usada com acompanhamento adequado, ajuda a restaurar um padrão de sono necessário para a saúde geral.",
  "O uso de medicação para o sono reforça a importância de também trabalhar hábitos que favoreçam o descanso naturalmente, como rotina noturna consistente e ambiente adequado, complementando o efeito da medicação.",
  "Seu uso atual de medicação para dormir é um dado relevante para entendermos o quadro completo de saúde, já que alguns desses medicamentos podem interagir com hábitos alimentares, especialmente horários de refeições.",
  "Utilizar apoio medicamentoso para o sono pode ser uma fase importante do cuidado, e vale manter o diálogo aberto com o médico responsável sobre a evolução do quadro ao longo do tempo.",
  "O uso de medicação para dormir, combinado com bons hábitos alimentares e de rotina, tende a trazer melhores resultados do que a medicação isolada, já que fatores como cafeína e horários de refeições também influenciam o sono.",
  "Seu quadro atual, com uso de medicação para dormir, reforça a importância de uma alimentação equilibrada ao longo do dia, já que oscilações grandes de açúcar no sangue podem interferir na qualidade do sono, mesmo com apoio medicamentoso.",
  "Precisar de medicação para dormir em determinado momento da vida é comum e não deve ser motivo de julgamento. O importante é que esse uso esteja sempre acompanhado por orientação médica adequada.",
  "O uso de medicação para o sono pode ser complementado por hábitos que favorecem o relaxamento natural do corpo, como reduzir a exposição a telas à noite e manter horários regulares de dormir.",
  "Seu uso de medicação para dormir é uma peça importante do quadro geral de saúde que estamos construindo juntos, e vale sempre alinhar qualquer ajuste na alimentação com o profissional que acompanha essa prescrição.",
  "Utilizar apoio medicamentoso para o sono, quando bem orientado, é uma estratégia legítima de cuidado. Junto a isso, pequenos ajustes na rotina alimentar podem contribuir para reduzir gradualmente essa dependência, sempre sob orientação médica.",
  "O uso de medicação para dormir reforça a importância de conversarmos sobre outros fatores que podem estar contribuindo para a dificuldade de sono, como estresse, cafeína e horários irregulares ao longo do dia.",
  "Seu cuidado em buscar apoio medicamentoso para o sono, sob orientação médica, é um passo positivo. Trabalhar em conjunto os hábitos alimentares pode ajudar a sustentar melhores resultados ao longo do tempo.",
];

const TEXTOS_SONO_POUCASHORAS = [
  "Seu tempo de sono parece estar abaixo do que o corpo costuma precisar para uma boa recuperação. Dormir poucas horas com frequência impacta o apetite, a disposição e até a capacidade de tomar decisões alimentares mais equilibradas.",
  "Dormir poucas horas por noite, mesmo que pareça suficiente no dia seguinte, tende a gerar um déficit de sono acumulado ao longo da semana, que impacta a energia e o metabolismo de forma gradual.",
  "Seu padrão atual de poucas horas de sono pede atenção especial, já que a privação de descanso está associada a maior desejo por alimentos calóricos e a mais dificuldade de manter escolhas alimentares planejadas.",
  "Um tempo de sono reduzido costuma refletir em cansaço acumulado, mesmo que não seja percebido imediatamente. Buscar aumentar gradualmente esse tempo, mesmo que em 30 minutos por noite, já pode trazer benefícios perceptíveis.",
  "Seu sono atual, com poucas horas de duração, reforça a importância de priorizar o descanso como parte do cuidado com a saúde, já que ele influencia diretamente os resultados de qualquer ajuste alimentar ou de atividade física.",
  "Dormir poucas horas de forma recorrente pode estar relacionado à rotina de trabalho, uso de telas à noite ou dificuldade de desacelerar antes de dormir. Identificar essa causa ajuda a construir uma solução mais direcionada.",
  "Seu tempo de sono reduzido pede atenção ao horário de deitar, já que muitas vezes o problema não é a dificuldade de dormir, mas sim o horário tardio em que a rotina noturna começa.",
  "Um sono insuficiente em quantidade tende a afetar a regulação da glicose no sangue, o que pode aumentar a vontade de comer doces e carboidratos simples ao longo do dia seguinte.",
  "Seu padrão atual de sono reduzido é um ponto importante para ajustarmos junto com a alimentação, já que dormir mais horas, mesmo que gradualmente, costuma facilitar bastante o controle do apetite.",
  "Dormir poucas horas por noite, de forma contínua, está associado a maior risco de ganho de peso a longo prazo, principalmente pela alteração nos hormônios que regulam a fome e a saciedade.",
  "Seu tempo de sono atual pede uma reflexão simples: o que poderia ser ajustado na rotina noturna para ganhar mesmo que 30 a 60 minutos extras de descanso? Pequenas mudanças de horário costumam ser um bom ponto de partida.",
  "Um sono reduzido em quantidade, mesmo com boa qualidade nas horas dormidas, ainda limita os processos de recuperação do corpo. Aumentar gradualmente o tempo total de sono tende a trazer ganhos perceptíveis de disposição.",
  "Seu padrão de poucas horas de sono reforça a importância de repensar prioridades na rotina noturna, já que o descanso adequado é tão importante para a saúde quanto a alimentação e a atividade física.",
  "Dormir pouco de forma recorrente pode comprometer a recuperação muscular, especialmente relevante caso seu objetivo envolva ganho de massa ou melhora de performance física.",
  "Seu tempo de sono atual é um ponto que vale a pena priorizar nas próximas semanas. Aumentar gradualmente essa quantidade, mesmo aos poucos, tende a trazer benefícios que se somam aos ajustes alimentares.",
];

const TEXTOS_SONO_MUITASHORAS = [
  "Seu tempo de sono parece estar bem acima da média, o que pode ser normal para algumas pessoas, mas também vale a pena observar se esse padrão está relacionado a mais descanso ou a uma qualidade de sono que não está sendo tão restauradora quanto poderia.",
  "Dormir muitas horas por noite nem sempre significa melhor descanso — às vezes reflete um sono mais fragmentado, que exige mais tempo total para compensar a qualidade reduzida.",
  "Seu padrão de sono prolongado pode estar relacionado a diversos fatores, incluindo rotina, nível de atividade física ou até questões de saúde que vale a pena investigar caso esse tempo esteja muito acima do habitual para você.",
  "Um tempo de sono muito elevado, de forma recorrente, também merece atenção, já que pode estar associado a baixa qualidade do sono ou a outros fatores de saúde que se beneficiam de uma avaliação mais próxima.",
  "Seu sono prolongado pode ser simplesmente uma característica individual do seu corpo, mas vale observar como você se sente ao acordar — a sensação de descanso real é tão importante quanto a quantidade de horas dormidas.",
  "Dormir muitas horas seguidas pode estar relacionado ao nível de atividade física, à alimentação ou até a períodos de maior cansaço acumulado. Entender o contexto ajuda a interpretar melhor esse padrão.",
  "Seu tempo de sono atual, quando bastante prolongado, pode se beneficiar de uma avaliação sobre a qualidade desse descanso, já que sono fragmentado ou pouco profundo costuma levar o corpo a buscar compensação em quantidade.",
  "Um padrão de sono muito longo pode, em alguns casos, estar relacionado a baixos níveis de energia ao longo do dia, o que reforça a importância de olhar também para a alimentação e os níveis de atividade física.",
  "Seu sono prolongado merece um olhar cuidadoso sobre a rotina como um todo, já que fatores como alimentação pobre em nutrientes ou baixo nível de movimento físico podem estar relacionados à necessidade de mais horas de descanso.",
  "Dormir muitas horas nem sempre é motivo de preocupação, mas vale a pena observar se esse padrão está associado a mais disposição durante o dia ou, ao contrário, a uma sensação constante de cansaço mesmo após dormir bastante.",
  "Seu tempo de sono atual pode refletir uma necessidade individual de descanso, especialmente se você mantém uma rotina fisicamente exigente. Nesses casos, dormir mais horas é uma resposta natural do corpo à recuperação necessária.",
  "Um sono muito prolongado, quando acompanhado de cansaço mesmo ao acordar, pode ser um sinal para investigar outros fatores de saúde, incluindo aspectos nutricionais como deficiência de ferro ou vitamina D.",
  "Seu padrão de sono estendido reforça a importância de observar a regularidade dos horários, já que dormir muitas horas em dias aleatórios pode indicar tentativa do corpo de compensar privação de sono em outros momentos da semana.",
  "Dormir muitas horas pode ser simplesmente parte do seu ritmo biológico natural, e isso está tudo bem. O mais importante é observar se você acorda com sensação de descanso e disposição para o dia.",
  "Seu tempo de sono prolongado é um dado que vale a pena acompanhar junto com outros aspectos da rotina, como alimentação e nível de energia, para entender se ele reflete descanso de qualidade ou algum desequilíbrio a ser investigado.",
];

// --- Módulo 5: Estresse ---
const TEXTOS_ESTRESSE_MUITOBAIXO = [
  "Seus níveis de estresse parecem estar bem controlados, o que é um dos pilares mais importantes para qualquer objetivo de saúde. Um corpo mais tranquilo tende a responder melhor tanto à alimentação quanto à atividade física.",
  "Manter o estresse em níveis baixos é uma conquista que impacta diretamente o apetite, o sono e até a digestão. Esse equilíbrio emocional costuma facilitar bastante a consistência dos hábitos alimentares ao longo do tempo.",
  "Seu nível de estresse controlado favorece a regulação do cortisol, hormônio que, em excesso, está associado a mais acúmulo de gordura abdominal e mais dificuldade de controlar o apetite.",
  "Ter baixos níveis de estresse é um diferencial importante para sustentar qualquer mudança de hábito, já que a mente tranquila costuma facilitar decisões mais planejadas em vez de escolhas impulsivas.",
  "Seu equilíbrio emocional atual é uma base valiosa para o seu bem-estar geral. Vale a pena identificar quais práticas sustentam esse estado, para mantê-las mesmo em fases futuras mais desafiadoras.",
  "Manter o estresse sob controle favorece diretamente a qualidade do sono, que por sua vez impacta o apetite e a disposição, criando um ciclo positivo que vale a pena preservar.",
  "Seus níveis baixos de estresse são um dos fatores que mais contribuem para uma relação equilibrada com a comida, sem os episódios de compulsão que costumam acompanhar períodos de tensão elevada.",
  "Ter uma rotina emocionalmente equilibrada, como parece ser o seu caso, favorece a digestão e a absorção de nutrientes, já que o sistema digestivo funciona melhor em estados de menor tensão.",
  "Seu nível de estresse controlado é um ativo importante para qualquer objetivo, seja emagrecimento, hipertrofia ou simplesmente manutenção do bem-estar. Vale reconhecer e valorizar esse equilíbrio.",
  "Manter baixos níveis de estresse ao longo do tempo é um hábito que merece atenção contínua, já que mudanças na rotina podem, eventualmente, elevar essa tensão sem que se perceba de imediato.",
  "Seus níveis de estresse baixos favorecem a estabilidade do apetite, reduzindo episódios de fome emocional que costumam levar a escolhas alimentares menos planejadas.",
  "Ter esse equilíbrio emocional é uma conquista que vale a pena valorizar, especialmente porque cria uma base sólida para sustentar qualquer mudança de hábito alimentar ou de atividade física a longo prazo.",
  "Seu nível baixo de estresse contribui para um sistema imunológico mais equilibrado, já que a tensão crônica está associada a maior inflamação no corpo e menor capacidade de defesa natural.",
  "Manter-se emocionalmente equilibrado, como parece ser seu caso, favorece decisões alimentares mais conscientes, já que o estresse elevado costuma direcionar o corpo para escolhas rápidas e mais calóricas.",
  "Seus níveis de estresse controlados são uma base sólida sobre a qual outros hábitos de saúde se apoiam com mais facilidade. Vale reconhecer esse equilíbrio como parte importante da sua qualidade de vida.",
];

const TEXTOS_ESTRESSE_BAIXO = [
  "Seus níveis de estresse parecem estar bem administrados na maior parte do tempo, o que é positivo para o equilíbrio geral do corpo. Manter práticas que sustentam esse controle vale a pena, mesmo em fases mais tranquilas.",
  "Ter um nível de estresse relativamente baixo favorece a regulação do apetite e da digestão, já que o corpo funciona melhor em estados de menor tensão para processar e absorver nutrientes.",
  "Seu equilíbrio emocional atual é uma boa base, mas vale observar quais situações ainda geram alguma tensão, para entender se pequenos ajustes de rotina podem reduzir ainda mais esses momentos.",
  "Manter níveis baixos de estresse contribui para um sono de melhor qualidade e para decisões alimentares mais conscientes ao longo do dia, já que a mente mais tranquila facilita esse tipo de escolha.",
  "Seus níveis de estresse controlados favorecem a consistência dos hábitos alimentares, reduzindo a chance de episódios de compulsão que costumam surgir em momentos de maior tensão emocional.",
  "Ter um baixo nível de estresse na maior parte do tempo é positivo, e vale identificar quais estratégias — como exercício físico ou momentos de lazer — mais contribuem para esse equilíbrio, para reforçá-las quando necessário.",
  "Seu equilíbrio emocional atual sustenta bem os objetivos de saúde que você tem buscado. Pequenos momentos de pausa ao longo do dia podem ajudar a manter esse nível de tranquilidade mesmo em dias mais corridos.",
  "Manter o estresse em níveis baixos favorece a saúde cardiovascular e metabólica a longo prazo, já que a tensão crônica está associada a maior risco de alterações na pressão arterial e no perfil lipídico.",
  "Seus níveis de estresse relativamente controlados são um bom sinal, mas vale continuar atento a fatores que possam elevá-los no futuro, como mudanças na rotina de trabalho ou questões pessoais.",
  "Ter um nível baixo de estresse favorece decisões alimentares mais planejadas, já que a ansiedade e a pressa costumam ser gatilhos comuns para escolhas mais impulsivas ao longo do dia.",
  "Seu equilíbrio emocional atual contribui para uma digestão mais tranquila e para menos desconfortos gastrointestinais, já que o sistema digestivo é bastante sensível ao estado emocional do corpo.",
  "Manter níveis baixos de estresse é uma conquista que vale reforçar com práticas regulares, como atividade física, momentos de lazer ou técnicas de relaxamento, mesmo quando tudo parece estar sob controle.",
  "Seus níveis de estresse controlados favorecem um apetite mais estável ao longo do dia, sem os picos de fome repentina que costumam acompanhar momentos de maior tensão emocional.",
  "Ter um baixo nível de estresse na rotina é um diferencial importante para sustentar qualquer objetivo de saúde a longo prazo, já que reduz a chance de recaídas em hábitos menos equilibrados.",
  "Seu equilíbrio emocional atual é uma base sólida para o bem-estar geral. Vale continuar cultivando os hábitos que sustentam esse estado, mesmo diante de eventuais desafios futuros.",
];

const TEXTOS_ESTRESSE_MODERADO = [
  "Seus níveis de estresse parecem estar em um patamar moderado, algo bastante comum na correria do dia a dia. Vale observar como esse estresse pode estar influenciando suas escolhas alimentares, especialmente em momentos mais tensos.",
  "Ter um nível moderado de estresse é comum, mas merece atenção, já que ele pode elevar gradualmente os níveis de cortisol, hormônio associado a mais acúmulo de gordura abdominal e mais dificuldade de controlar o apetite.",
  "Seu nível de estresse atual pede algumas estratégias de manejo, como pausas ao longo do dia ou atividade física regular, que ajudam a reduzir essa tensão antes que ela se intensifique.",
  "Um nível moderado de estresse costuma influenciar o apetite de forma sutil, aumentando a vontade por alimentos mais calóricos em determinados momentos do dia. Reconhecer esse padrão ajuda a lidar com ele de forma mais consciente.",
  "Seus níveis atuais de estresse merecem atenção, especialmente porque a tensão acumulada ao longo do dia pode impactar tanto o sono quanto as escolhas alimentares nas horas seguintes.",
  "Ter um estresse moderado na rotina é uma realidade para boa parte das pessoas. Pequenas pausas conscientes ao longo do dia, mesmo que de poucos minutos, podem ajudar a reduzir essa tensão acumulada.",
  "Seu nível de estresse atual pede atenção redobrada aos horários de refeição, já que a tensão do dia a dia costuma levar a refeições mais rápidas e menos planejadas.",
  "Um estresse moderado, mantido por muito tempo, pode gradualmente se tornar mais elevado, por isso vale a pena investir em estratégias de manejo antes que a tensão se intensifique.",
  "Seus níveis de estresse atuais reforçam a importância de cuidar do sono e da atividade física, já que ambos são aliados importantes na redução da tensão acumulada ao longo do dia.",
  "Ter um nível moderado de estresse pede atenção a como você se alimenta nesses momentos — comer com mais calma, mesmo em dias corridos, ajuda o corpo a processar melhor tanto a comida quanto a tensão emocional.",
  "Seu estresse atual em nível moderado é um bom momento para experimentar técnicas de manejo, como respiração profunda ou pequenas pausas entre tarefas, antes que essa tensão se intensifique ao longo do tempo.",
  "Um nível moderado de estresse pode estar relacionado a fatores como carga de trabalho, questões pessoais ou até privação de sono. Identificar a origem principal ajuda a direcionar melhor as estratégias de manejo.",
  "Seus níveis de estresse atuais merecem atenção contínua, já que pequenas mudanças de rotina, como reservar momentos de descanso, costumam trazer alívio perceptível ao longo das semanas.",
  "Ter um estresse moderado é uma fase comum, mas que se beneficia de cuidado ativo, já que a tensão acumulada tende a impactar tanto a qualidade do sono quanto as escolhas alimentares diárias.",
  "Seu nível atual de estresse pede um olhar cuidadoso sobre o equilíbrio entre trabalho, descanso e lazer, já que esse equilíbrio costuma ser um dos fatores mais eficazes para reduzir a tensão do dia a dia.",
];

const TEXTOS_ESTRESSE_ALTO = [
  "Seus níveis de estresse parecem estar elevados, e isso é um ponto que merece atenção cuidadosa. O estresse alto, mantido por muito tempo, impacta diretamente o apetite, o sono e até a forma como o corpo armazena energia.",
  "Um nível alto de estresse costuma elevar os níveis de cortisol de forma significativa, o que está associado a mais acúmulo de gordura abdominal e mais dificuldade em manter escolhas alimentares planejadas.",
  "Seu estresse elevado pede atenção prioritária, já que ele tende a influenciar praticamente todos os outros aspectos da saúde, desde o sono até a qualidade das refeições ao longo do dia.",
  "Níveis altos de estresse costumam aumentar significativamente a vontade por alimentos ricos em açúcar e gordura, já que o corpo busca esse tipo de energia rápida como resposta à tensão acumulada.",
  "Seu quadro atual de estresse elevado reforça a importância de buscar estratégias de manejo o quanto antes, como atividade física regular, técnicas de respiração ou, quando necessário, apoio psicológico especializado.",
  "Um estresse alto e persistente pode dificultar bastante a consistência de qualquer objetivo alimentar, já que a mente sob tensão tende a priorizar soluções imediatas em vez de escolhas planejadas.",
  "Seus níveis elevados de estresse merecem cuidado prioritário, já que essa tensão constante pode impactar negativamente o sono, criando um ciclo em que a falta de descanso intensifica ainda mais o estresse.",
  "Um nível alto de estresse costuma vir acompanhado de mais episódios de fome emocional, em que a comida é usada como forma de alívio momentâneo. Reconhecer esse padrão, sem julgamento, é o primeiro passo para lidar com ele de forma mais saudável.",
  "Seu quadro de estresse elevado pede atenção redobrada à qualidade das refeições, já que a tensão constante pode levar a escolhas mais rápidas e menos nutritivas ao longo do dia.",
  "Níveis altos de estresse impactam diretamente a digestão, podendo gerar desconfortos gastrointestinais mesmo com uma alimentação equilibrada. Cuidar do estresse é, nesses casos, tão importante quanto ajustar o cardápio.",
  "Seu estresse elevado reforça a importância de buscar apoio profissional, seja psicológico, médico ou nutricional, já que o manejo eficaz dessa tensão costuma exigir uma abordagem em conjunto, não isolada.",
  "Um nível alto de estresse mantido por muito tempo está associado a maior risco de alterações metabólicas e cardiovasculares, o que reforça a importância de tratar esse ponto com prioridade dentro do cuidado geral com a saúde.",
  "Seus níveis elevados de estresse pedem pequenas pausas ao longo do dia, mesmo que de poucos minutos, para ajudar o corpo a reduzir gradualmente essa tensão acumulada antes que ela se intensifique ainda mais.",
  "Um estresse alto e constante costuma reduzir a qualidade do sono, o que por sua vez intensifica ainda mais a fome e a vontade por alimentos calóricos no dia seguinte, criando um ciclo que vale a pena interromper com cuidado.",
  "Seu quadro atual de estresse elevado é um ponto central a ser trabalhado com cuidado e, se necessário, com apoio profissional especializado, já que ele influencia diretamente os resultados de qualquer outro ajuste na rotina.",
];

const TEXTOS_ESTRESSE_MUITOALTO = [
  "Seus níveis de estresse parecem estar muito elevados, e isso é um sinal importante que merece cuidado prioritário. Esse nível de tensão constante pode impactar de forma significativa o corpo e a mente, e buscar apoio adequado é um passo essencial.",
  "Um nível muito alto de estresse costuma sobrecarregar o corpo de forma expressiva, elevando significativamente o cortisol e impactando desde o sono até o apetite e a digestão.",
  "Seu quadro atual de estresse muito elevado reforça a importância de buscar apoio profissional especializado, como acompanhamento psicológico, já que esse nível de tensão raramente se resolve apenas com ajustes de rotina.",
  "Níveis muito altos de estresse podem comprometer significativamente a qualidade de vida, e cuidar desse ponto é tão importante quanto qualquer ajuste alimentar que possamos fazer juntos.",
  "Seu estresse muito elevado merece atenção imediata e cuidado multidisciplinar, envolvendo apoio psicológico, médico e nutricional trabalhando em conjunto para ajudar o corpo a recuperar o equilíbrio.",
  "Um nível muito alto de estresse costuma dificultar bastante a manutenção de qualquer hábito saudável, já que a mente sobrecarregada tende a priorizar sobrevivência imediata em vez de planejamento de longo prazo.",
  "Seu quadro de estresse muito elevado pede compreensão e cuidado, sem julgamento sobre eventuais dificuldades na alimentação, já que esse nível de tensão impacta profundamente as escolhas do dia a dia.",
  "Níveis muito altos de estresse estão associados a maior risco de diversas condições de saúde, o que reforça a importância de buscar apoio adequado o quanto antes, com uma equipe de cuidado multidisciplinar.",
  "Seu estresse muito elevado é um ponto que merece prioridade absoluta no cuidado com a saúde, já que ele influencia e, muitas vezes, dificulta os resultados de qualquer outro ajuste que estejamos fazendo juntos.",
  "Um nível muito alto de estresse pode se manifestar também em sintomas físicos, como tensão muscular, dores de cabeça ou desconfortos digestivos, reforçando a importância de um cuidado integral e não apenas alimentar.",
  "Seu quadro atual pede, acima de tudo, gentileza consigo mesmo. Em momentos de estresse muito elevado, manter pequenas rotinas de cuidado, mesmo simples, já é um avanço importante, sem pressão por perfeição.",
  "Níveis muito altos de estresse merecem uma rede de apoio ampla, que pode incluir familiares, amigos e profissionais de saúde, já que esse tipo de sobrecarga raramente é resolvido sozinho.",
  "Seu estresse muito elevado reforça a importância de buscar ajuda o quanto antes, entendendo que esse cuidado não é um sinal de fraqueza, mas sim um passo importante de autocuidado e responsabilidade com a própria saúde.",
  "Um nível muito alto de estresse pode fazer com que a alimentação se torne uma das poucas fontes de controle ou alívio percebido, e entender esse padrão, com acolhimento, é essencial para construir um cuidado mais amplo.",
  "Seu quadro de estresse muito elevado é levado a sério nesse acompanhamento, e qualquer pequeno passo em direção ao equilíbrio, por menor que pareça, já representa um avanço importante nesse momento.",
];

// --- Módulo 6: Água (nível geral) ---
const TEXTOS_AGUA_MUITOABAIXO = [
  "Sua ingestão de água parece estar bem abaixo do que o corpo costuma precisar para funcionar bem. A água participa de praticamente todos os processos do organismo, da digestão à regulação da temperatura corporal, por isso esse ponto merece atenção prioritária.",
  "Beber pouca água ao longo do dia pode passar despercebido, mas costuma se manifestar em sinais como cansaço, dor de cabeça e dificuldade de concentração. Aumentar gradualmente esse consumo tende a trazer melhorias perceptíveis rapidamente.",
  "Seu consumo atual de água está bem aquém do ideal, o que pode estar relacionado à rotina corrida ou simplesmente ao hábito de não sentir sede com frequência. Manter uma garrafa por perto costuma ajudar bastante nesse processo.",
  "Uma hidratação muito abaixo do recomendado pode dificultar até a digestão dos alimentos, já que a água é essencial para o funcionamento adequado do sistema digestivo. Esse é um ponto simples, mas com grande impacto na sua saúde.",
  "Seu nível de hidratação atual pede uma mudança gradual, começando talvez por adicionar apenas mais dois copos de água ao dia, antes de buscar a meta ideal completa. Pequenos passos tendem a ser mais sustentáveis.",
  "Beber pouca água ao longo do dia pode confundir o corpo, que às vezes interpreta sede como fome, levando a mais vontade de comer mesmo sem necessidade real de energia. Aumentar a hidratação pode ajudar a diferenciar esses sinais.",
  "Seu consumo de água muito reduzido é um dos pontos mais simples de ajustar na rotina, com grande potencial de impacto na disposição, na pele e até no funcionamento dos rins.",
  "Uma hidratação insuficiente como a atual pode reduzir o desempenho físico e mental ao longo do dia, mesmo em tarefas simples. Vale a pena priorizar esse ajuste antes mesmo de mexer em outros aspectos da alimentação.",
  "Seu nível atual de ingestão de água está bem distante do recomendado, o que reforça a importância de criar lembretes ao longo do dia, como associar o consumo de água a momentos específicos da rotina.",
  "Beber muito pouca água pode impactar negativamente até o humor, já que a desidratação leve já é suficiente para gerar irritabilidade e dificuldade de concentração em algumas pessoas.",
  "Seu consumo de água muito abaixo do ideal é um ponto de partida importante para trabalharmos juntos. Aumentar gradualmente, copo a copo, costuma ser mais sustentável do que tentar atingir a meta completa de uma só vez.",
  "Uma hidratação muito reduzida pode dificultar a eliminação de toxinas pelo corpo, sobrecarregando os rins ao longo do tempo. Esse é um dos motivos pelos quais aumentar o consumo de água costuma trazer benefícios rápidos e perceptíveis.",
  "Seu nível atual de hidratação pede atenção especial, principalmente em dias mais quentes ou de maior atividade física, quando a necessidade de água do corpo aumenta ainda mais.",
  "Beber pouca água ao longo do dia é um hábito comum, mas com solução simples: associar o consumo de água a rotinas já existentes, como beber um copo ao acordar e outro antes de cada refeição, pode facilitar bastante esse ajuste.",
  "Seu consumo atual de água está bem abaixo do recomendado, e esse é um dos ajustes mais rápidos de implementar, com impacto positivo em praticamente todos os outros aspectos da saúde que estamos trabalhando.",
];

const TEXTOS_AGUA_ABAIXO = [
  "Sua ingestão de água está um pouco abaixo do recomendado, o que é comum, mas vale a pena ajustar aos poucos. Pequenos aumentos ao longo do dia já ajudam bastante o corpo a funcionar de forma mais equilibrada.",
  "Beber um pouco menos água do que o ideal pode não gerar sintomas óbvios de imediato, mas ao longo do tempo pode impactar a disposição e a qualidade da pele. Aumentar gradualmente esse consumo tende a trazer benefícios perceptíveis.",
  "Seu consumo atual de água está próximo do recomendado, mas ainda com espaço para melhorar. Adicionar mais um ou dois copos ao longo do dia pode ser o ajuste necessário para atingir níveis mais adequados de hidratação.",
  "Uma hidratação levemente abaixo do ideal ainda sustenta boa parte das funções do corpo, mas otimizar esse consumo pode trazer ganhos extras de energia e até facilitar o controle do apetite ao longo do dia.",
  "Seu nível de água consumida está quase no ponto ideal, o que é positivo. Pequenos lembretes ao longo do dia, como beber um copo a cada intervalo entre as refeições, podem ajudar a fechar essa diferença.",
  "Beber água um pouco abaixo do recomendado é bastante comum, especialmente em rotinas corridas. Uma estratégia simples é manter uma garrafa visível na mesa de trabalho, o que costuma aumentar naturalmente o consumo ao longo do dia.",
  "Seu consumo atual de água tem uma pequena margem para ajuste, e alcançar essa meta pode potencializar ainda mais os resultados de qualquer objetivo relacionado à alimentação ou à atividade física.",
  "Uma hidratação levemente insuficiente pode passar despercebida, mas vale observar sinais como urina mais escura ou sede persistente, que indicam a necessidade de aumentar um pouco mais o consumo diário de água.",
  "Seu nível de água consumida está perto do ideal, e esse pequeno ajuste final costuma ser fácil de alcançar, especialmente incluindo água durante e entre as refeições principais do dia.",
  "Beber um pouco menos água do que o recomendado ainda é melhor do que uma hidratação muito baixa, mas fechar essa diferença pode trazer ganhos adicionais de disposição, digestão e até saúde da pele.",
  "Seu consumo atual está próximo da meta ideal de hidratação, o que mostra que o hábito já está bem encaminhado. Pequenos ajustes de rotina, como beber água antes de sentir sede, podem completar esse processo.",
  "Uma hidratação levemente abaixo do ideal pode ser facilmente ajustada substituindo, por exemplo, uma bebida açucarada por água ao longo do dia, o que também traz benefícios adicionais para o controle do peso.",
  "Seu nível de água consumida está bom, mas ainda com espaço de melhora. Vale observar em quais momentos do dia o consumo costuma cair mais, para reforçar a hidratação exatamente nesses períodos.",
  "Beber água um pouco abaixo do recomendado é um ajuste simples de fazer, especialmente durante o período da tarde, quando o consumo costuma diminuir naturalmente em muitas rotinas.",
  "Seu consumo atual de água está quase no ponto ideal. Esse último ajuste, mesmo pequeno, pode potencializar ainda mais a disposição e o bem-estar que você já vem construindo com outros hábitos saudáveis.",
];

const TEXTOS_AGUA_ADEQUADA = [
  "Sua ingestão de água está dentro da faixa recomendada, o que é um excelente hábito para sustentar praticamente todas as funções do corpo. Manter essa consistência é tão importante quanto qualquer outro ajuste na alimentação.",
  "Beber água de forma adequada ao longo do dia é um hábito que merece reconhecimento, já que favorece a digestão, a disposição e até o desempenho físico e mental nas atividades diárias.",
  "Seu consumo atual de água está bem ajustado às necessidades do corpo, o que é uma ótima base para qualquer objetivo relacionado à saúde ou à composição corporal que você esteja buscando.",
  "Uma hidratação adequada, como a sua, favorece o funcionamento renal, a regulação da temperatura corporal e até a saúde da pele. Vale a pena manter esse hábito mesmo em dias mais corridos ou fora da rotina habitual.",
  "Seu nível de água consumida está no ponto ideal, o que costuma facilitar o controle do apetite, já que muitas vezes o corpo confunde sede com fome quando a hidratação não está adequada.",
  "Beber água de forma consistente e adequada é um dos hábitos mais simples e ao mesmo tempo mais impactantes para a saúde geral. Vale reconhecer esse ponto positivo da sua rotina.",
  "Seu consumo atual de água sustenta bem as demandas do corpo, inclusive durante a atividade física, contribuindo para melhor desempenho e recuperação após os treinos.",
  "Uma hidratação adequada, como a que você mantém, favorece a absorção de nutrientes das refeições, já que a água participa diretamente do transporte de vitaminas e minerais pelo corpo.",
  "Seu nível de água consumida está bem equilibrado. Esse é um ótimo momento para focar em outros aspectos da rotina, sabendo que a hidratação já está bem estabelecida como parte natural do seu dia.",
  "Beber a quantidade adequada de água diariamente é um hábito que impacta positivamente até a qualidade do sono, já que a hidratação adequada favorece diversos processos regulatórios do corpo durante a noite.",
  "Seu consumo atual de água é um exemplo de hábito simples, mas consistente, que sustenta o bem-estar geral. Vale continuar mantendo essa prática mesmo em fases de mudança na rotina.",
  "Uma hidratação bem ajustada, como a sua, favorece a saúde intestinal, já que a água participa ativamente do processo digestivo e da formação adequada do bolo fecal, prevenindo desconfortos como a constipação.",
  "Seu nível de água consumida está alinhado com as recomendações gerais, o que é uma conquista que vale a pena reconhecer, principalmente pela consistência que esse hábito exige ao longo do tempo.",
  "Beber água de forma adequada é um hábito que sustenta silenciosamente muitos outros aspectos da saúde. Manter essa prática estável é uma forma simples de continuar cuidando bem do corpo.",
  "Seu consumo atual de água é um ponto forte da sua rotina, e observar o que sustenta esse hábito — como manter uma garrafa sempre por perto — pode ajudar a preservá-lo mesmo em dias mais desafiadores.",
];

const TEXTOS_AGUA_EXCELENTE = [
  "Sua ingestão de água está em um nível excelente, o que é um dos hábitos mais valiosos para a saúde geral do corpo. Esse cuidado consistente com a hidratação merece bastante reconhecimento.",
  "Manter um consumo de água tão bem ajustado como o seu favorece praticamente todos os sistemas do corpo, da digestão à regulação da temperatura, passando pela saúde da pele e das articulações.",
  "Seu nível excelente de hidratação é uma base sólida que potencializa os resultados de qualquer outro cuidado com a saúde, seja alimentação equilibrada, atividade física regular ou sono de qualidade.",
  "Beber água de forma tão consistente quanto você faz é um hábito que muitas pessoas têm dificuldade em manter. Vale reconhecer esse ponto forte e entender quais estratégias sustentam essa prática para preservá-la.",
  "Sua hidratação excelente favorece o desempenho físico e mental ao longo do dia, além de contribuir para uma digestão mais eficiente e um funcionamento renal adequado.",
  "Manter esse nível excelente de consumo de água é uma conquista que impacta positivamente até o controle do apetite, já que a boa hidratação ajuda o corpo a diferenciar melhor sede de fome.",
  "Seu consumo de água em nível excelente é um exemplo de hábito simples, mas com grande impacto acumulado na saúde ao longo do tempo. Esse é um ponto forte que vale muito a pena preservar.",
  "Beber água de forma tão adequada quanto você faz favorece a recuperação muscular, especialmente relevante caso sua rotina inclua atividade física regular ou intensa.",
  "Sua hidratação excelente é uma base que sustenta muitos outros aspectos do bem-estar, funcionando quase como um multiplicador silencioso dos resultados de uma boa alimentação.",
  "Manter um consumo tão consistente de água como o seu é um hábito que vale a pena manter mesmo em mudanças de rotina, já que ele sustenta boa parte do equilíbrio do corpo.",
  "Seu nível excelente de hidratação favorece também a saúde da pele e do cabelo, além de contribuir para uma sensação geral de disposição ao longo do dia.",
  "Beber água de forma tão bem ajustada é um hábito que reflete um cuidado atento com o próprio corpo. Vale reconhecer esse esforço como parte importante da sua rotina de saúde.",
  "Sua hidratação em nível excelente contribui para um funcionamento intestinal mais regular, reduzindo desconfortos digestivos e favorecendo a absorção adequada de nutrientes das refeições.",
  "Manter esse padrão excelente de consumo de água é uma prática que vale a pena valorizar e sustentar, já que poucos hábitos têm um impacto tão amplo e simultâneo em diferentes sistemas do corpo.",
  "Seu consumo de água excelente é um dos pilares mais sólidos da sua rotina de saúde atual. Esse é um ótimo momento para direcionar energia para outros aspectos, sabendo que esse ponto já está muito bem cuidado.",
];

// --- Módulo 7: Álcool ---
const TEXTOS_ALCOOL_NUNCA = [
  "Não consumir álcool é um hábito que já elimina uma fonte significativa de calorias vazias e favorece bastante a saúde do fígado e do sistema cardiovascular a longo prazo. Esse é um ponto forte da sua rotina que vale reconhecer.",
  "Sua escolha por não beber álcool contribui diretamente para um sono de melhor qualidade, já que mesmo pequenas quantidades da substância podem interferir nas fases mais profundas do sono.",
  "Manter-se afastado do álcool favorece a absorção de nutrientes das refeições, já que o consumo dessa substância pode interferir na absorção de vitaminas importantes, como as do complexo B.",
  "Não beber álcool é um hábito que sustenta bem qualquer objetivo relacionado à composição corporal, já que essa substância costuma adicionar calorias significativas sem qualquer valor nutricional.",
  "Sua escolha de não consumir álcool contribui para um funcionamento hepático mais equilibrado, já que o fígado é o principal órgão responsável por processar essa substância no corpo.",
  "Manter-se longe do álcool favorece também a saúde emocional, já que essa substância pode intensificar quadros de ansiedade ou alterar o humor em algumas pessoas, mesmo em quantidades moderadas.",
  "Não consumir álcool é um dos hábitos que mais contribuem para a prevenção de diversas condições de saúde a longo prazo, incluindo questões hepáticas, cardiovasculares e algumas relacionadas ao metabolismo.",
  "Sua escolha de não beber é um ponto positivo importante, especialmente se o seu objetivo envolve emagrecimento ou ganho de massa muscular, já que o álcool costuma dificultar ambos os processos.",
  "Manter-se afastado do consumo de álcool favorece a qualidade do sono e, consequentemente, a regulação do apetite, criando um ciclo positivo que sustenta outros hábitos saudáveis da sua rotina.",
  "Não beber álcool é uma escolha que vale muito reconhecimento, já que essa substância está entre os fatores que mais dificultam a manutenção de hábitos alimentares equilibrados no longo prazo.",
  "Sua escolha de não consumir álcool contribui para níveis mais estáveis de energia ao longo do dia, sem os períodos de cansaço que costumam acompanhar o consumo dessa substância, mesmo em pequenas quantidades.",
  "Manter-se longe do álcool é um hábito que sustenta bem a saúde cardiovascular a longo prazo, contribuindo para níveis mais equilibrados de pressão arterial e de triglicerídeos.",
  "Não beber álcool é uma escolha que facilita bastante a consistência de qualquer plano alimentar, já que essa substância costuma reduzir o controle sobre as escolhas alimentares nas horas seguintes ao consumo.",
  "Sua opção por não consumir álcool é um dos hábitos mais protetores para a saúde geral, e vale reconhecer esse cuidado como parte importante da sua rotina de bem-estar.",
  "Manter-se afastado do álcool contribui para uma pele mais saudável e hidratada, já que essa substância tem efeito diurético e pode contribuir para a desidratação do corpo como um todo.",
];

const TEXTOS_ALCOOL_RARAMENTE = [
  "Consumir álcool raramente é um padrão que costuma trazer baixo impacto na saúde geral, especialmente quando comparado a um consumo mais frequente. Vale continuar mantendo essa moderação como parte da rotina.",
  "Seu consumo ocasional de álcool, em momentos pontuais, tende a ter impacto limitado nos seus objetivos de saúde, desde que as quantidades nessas ocasiões também sejam moderadas.",
  "Beber álcool raramente é um padrão equilibrado, mas vale observar a quantidade consumida nessas ocasiões, já que mesmo o consumo esporádico em excesso pode impactar o sono e a digestão nos dias seguintes.",
  "Seu padrão de consumo raro de álcool sugere uma relação equilibrada com essa substância, o que é positivo tanto para a saúde física quanto para a consistência dos hábitos alimentares ao longo do tempo.",
  "Consumir álcool apenas ocasionalmente permite aproveitar momentos sociais sem grande impacto na rotina de saúde, desde que esses momentos não se tornem cada vez mais frequentes com o tempo.",
  "Seu consumo raro de álcool é um padrão saudável, mas vale atenção ao dia seguinte a essas ocasiões, já que o álcool pode impactar temporariamente o apetite e a qualidade do sono.",
  "Beber álcool com pouca frequência costuma ter impacto reduzido na composição corporal e na saúde geral, especialmente quando as quantidades consumidas nessas ocasiões também são moderadas.",
  "Seu padrão de consumo ocasional é equilibrado, e manter essa moderação, sem deixar que a frequência aumente gradualmente, é uma boa estratégia para preservar esse ponto positivo da rotina.",
  "Consumir álcool raramente permite que você aproveite momentos especiais sem grande preocupação, desde que fique atento à quantidade consumida em cada ocasião e à hidratação nos dias seguintes.",
  "Seu consumo esporádico de álcool é um padrão que costuma se encaixar bem em qualquer objetivo de saúde, desde que continue sendo, de fato, uma exceção e não uma tendência crescente.",
  "Beber álcool ocasionalmente é uma escolha equilibrada. Vale apenas observar como o corpo responde no dia seguinte a essas ocasiões, ajustando a hidratação e a alimentação conforme necessário.",
  "Seu padrão raro de consumo de álcool sugere uma boa relação com essa substância, permitindo momentos de socialização sem comprometer significativamente os hábitos de saúde construídos ao longo do tempo.",
  "Consumir álcool com pouca frequência é um equilíbrio saudável entre vida social e cuidado com o corpo. Manter essa moderação é uma forma inteligente de aproveitar momentos especiais sem abrir mão do bem-estar geral.",
  "Seu consumo ocasional de álcool tem impacto limitado nos resultados que você está buscando, mas vale sempre priorizar a hidratação com água nesses momentos, para reduzir os efeitos no dia seguinte.",
  "Beber raramente é um padrão que reflete equilíbrio e consciência sobre os efeitos dessa substância no corpo. Vale continuar com essa moderação como parte de uma relação saudável com o álcool.",
];

const TEXTOS_ALCOOL_SOCIALMENTE = [
  "Consumir álcool em contextos sociais é bastante comum, e o importante é observar se a frequência e a quantidade dessas ocasiões estão dentro de um padrão que não compromete outros aspectos da sua saúde.",
  "Seu consumo social de álcool pede atenção à quantidade ingerida em cada ocasião, já que é fácil perder a conta em momentos de socialização mais descontraídos e prolongados.",
  "Beber em situações sociais é uma parte natural da vida para muitas pessoas. Vale a pena ter algumas estratégias, como intercalar bebidas alcoólicas com água, para reduzir o impacto no corpo no dia seguinte.",
  "Seu padrão de consumo social de álcool sugere que essa substância aparece principalmente em momentos de confraternização. Observar a frequência desses eventos ao longo do mês ajuda a entender melhor o impacto real na sua rotina.",
  "Consumir álcool socialmente costuma vir acompanhado de escolhas alimentares menos planejadas, já que esses momentos geralmente envolvem petiscos mais calóricos. Vale observar esse padrão, sem julgamento, para ajustar quando fizer sentido.",
  "Seu consumo em contextos sociais pode ser equilibrado com pequenas estratégias, como definir um limite de bebidas antes de sair ou escolher opções com menor teor calórico entre as disponíveis.",
  "Beber socialmente é uma prática comum, mas vale atenção especial quando esses momentos se tornam frequentes ao longo da semana, já que o impacto acumulado pode ser maior do que parece em cada ocasião isolada.",
  "Seu padrão de consumo social de álcool pede reflexão sobre o dia seguinte a essas ocasiões: sono, disposição e apetite costumam ser impactados, mesmo quando o consumo parece moderado no momento.",
  "Consumir álcool em encontros sociais faz parte da vida de muitas pessoas, e o equilíbrio está em aproveitar esses momentos sem que eles se tornem tão frequentes a ponto de impactar consistentemente outros hábitos de saúde.",
  "Seu consumo social de álcool se beneficia de pequenas estratégias práticas, como comer algo antes de sair, o que ajuda a reduzir tanto a velocidade de absorção do álcool quanto o consumo excessivo de petiscos calóricos.",
  "Beber em contextos sociais, com moderação, tem impacto limitado nos objetivos de saúde de longo prazo. O que costuma fazer diferença é a frequência com que essas ocasiões acontecem ao longo do mês.",
  "Seu padrão de consumo social pede atenção à hidratação, já que o álcool tem efeito diurético e pode contribuir para desidratação, especialmente em eventos mais longos ou em ambientes quentes.",
  "Consumir álcool socialmente é uma escolha pessoal que pode conviver bem com objetivos de saúde, desde que acompanhada de consciência sobre quantidade e frequência ao longo do tempo.",
  "Seu consumo em momentos sociais pode ser equilibrado escolhendo, quando possível, bebidas com menor teor calórico e alternando com água ao longo do evento, o que ajuda a reduzir o impacto total no corpo.",
  "Beber socialmente faz parte da vida em sociedade para muitas pessoas, e observar como o corpo responde a esses momentos — sono, apetite, disposição no dia seguinte — ajuda a encontrar o equilíbrio que funciona para você.",
];

const TEXTOS_ALCOOL_FREQUENTE = [
  "Consumir álcool com frequência é um padrão que merece atenção, já que o impacto dessa substância no corpo tende a se acumular ao longo do tempo, afetando desde o sono até o metabolismo.",
  "Seu consumo frequente de álcool pode estar influenciando outros aspectos da sua saúde, como a qualidade do sono e a disposição ao longo do dia, mesmo que esses efeitos não sejam sempre percebidos de imediato.",
  "Beber com frequência costuma adicionar uma quantidade significativa de calorias à rotina, o que pode dificultar objetivos como emagrecimento ou ganho de massa muscular, mesmo com uma alimentação bem estruturada.",
  "Seu padrão de consumo frequente de álcool pede uma reflexão sobre os momentos em que essa substância aparece na rotina, para entender se há espaço para reduzir gradualmente essa frequência.",
  "Consumir álcool com regularidade pode impactar a saúde do fígado ao longo do tempo, já que esse órgão precisa processar a substância repetidamente, o que reforça a importância de reduzir essa frequência gradualmente.",
  "Seu consumo frequente pode estar relacionado a momentos específicos da rotina, como o fim do dia de trabalho. Identificar esses gatilhos ajuda a pensar em alternativas para esses momentos.",
  "Beber com frequência costuma interferir na qualidade do sono, mesmo quando parece ajudar a relaxar no momento, já que o álcool reduz as fases mais profundas e restauradoras do sono.",
  "Seu padrão atual de consumo frequente de álcool pede uma redução gradual, sem necessidade de eliminar completamente de uma vez, mas com atenção a reduzir a quantidade e a frequência nas próximas semanas.",
  "Consumir álcool com regularidade pode estar associado a mais dificuldade em manter escolhas alimentares planejadas, já que essa substância tende a reduzir o controle sobre o apetite nas horas seguintes ao consumo.",
  "Seu consumo frequente de álcool merece atenção especial, principalmente se houver também outras condições de saúde envolvidas, como pressão alta ou alterações no colesterol, já que o álcool pode intensificar esses quadros.",
  "Beber com frequência ao longo da semana costuma impactar o metabolismo, dificultando processos como a queima de gordura, já que o corpo prioriza processar o álcool antes de outras fontes de energia.",
  "Seu padrão frequente de consumo pede uma estratégia gradual de redução, como estabelecer dias específicos sem álcool durante a semana, até encontrar um equilíbrio mais sustentável.",
  "Consumir álcool com regularidade pode estar relacionado a padrões emocionais, como alívio de estresse ou ansiedade. Reconhecer essa relação, sem julgamento, ajuda a encontrar alternativas mais equilibradas para esses momentos.",
  "Seu consumo frequente de álcool é um ponto importante a trabalhar junto com outros hábitos de saúde, já que ele influencia diretamente os resultados de qualquer ajuste alimentar ou de atividade física.",
  "Beber com frequência pede reflexão sobre o que essa substância representa na sua rotina — relaxamento, socialização, hábito — para que a redução gradual seja construída de forma consciente e sustentável.",
];

const TEXTOS_ALCOOL_DIARIO = [
  "Consumir álcool diariamente é um padrão que merece atenção prioritária, já que esse uso contínuo tende a impactar de forma significativa o fígado, o metabolismo e a qualidade geral da saúde ao longo do tempo.",
  "Seu consumo diário de álcool é um ponto central a ser trabalhado com cuidado, e vale considerar também apoio profissional especializado, já que reduzir esse padrão pode exigir suporte além do nutricional.",
  "Beber álcool todos os dias, mesmo em quantidades moderadas, tende a se acumular significativamente ao longo do tempo, impactando o funcionamento do fígado e a qualidade do sono de forma contínua.",
  "Seu padrão de consumo diário reforça a importância de uma abordagem cuidadosa e gradual de redução, sempre com acolhimento e sem julgamento, já que mudanças bruscas nesse tipo de hábito podem ser desafiadoras.",
  "Consumir álcool diariamente pode estar associado a diversos riscos de saúde a longo prazo, o que reforça a importância de conversar abertamente sobre esse padrão e buscar, junto com apoio profissional, um caminho de redução gradual.",
  "Seu consumo diário de álcool merece um olhar cuidadoso e multidisciplinar, envolvendo, quando necessário, acompanhamento médico e psicológico além do nutricional, para que a redução aconteça de forma segura.",
  "Beber todos os dias, mesmo que em pequenas quantidades, tende a impactar a qualidade do sono de forma contínua, criando um ciclo em que o descanso insuficiente pode intensificar ainda mais esse padrão de consumo.",
  "Seu padrão diário de consumo de álcool pede compreensão sobre o que motiva esse hábito — relaxamento, rotina, alívio emocional — para que possamos, juntos, pensar em alternativas mais equilibradas para esses momentos.",
  "Consumir álcool diariamente está associado a maior risco de alterações hepáticas, cardiovasculares e metabólicas, o que reforça a importância de tratar esse ponto com prioridade e cuidado dentro do plano de saúde.",
  "Seu consumo diário de álcool é um ponto que merece atenção sem julgamento, reconhecendo que a redução desse padrão costuma ser um processo gradual, que se beneficia de apoio e paciência.",
  "Beber álcool todos os dias pode estar relacionado a rotinas ou gatilhos específicos, e identificar esses momentos é um primeiro passo importante para construir, aos poucos, alternativas mais saudáveis.",
  "Seu padrão de consumo diário reforça a importância de uma rede de apoio ampla nesse processo, incluindo profissionais de saúde especializados, já que essa mudança costuma ser mais bem-sucedida com suporte adequado.",
  "Consumir álcool diariamente impacta significativamente a absorção de nutrientes importantes, o que pode estar relacionado também a outros desequilíbrios nutricionais que vale a pena investigar em conjunto.",
  "Seu consumo diário de álcool é levado a sério nesse acompanhamento, e cada pequeno passo em direção à redução, por menor que seja, já representa um avanço importante para a sua saúde a longo prazo.",
  "Beber todos os dias é um padrão que pede cuidado compassivo e, muitas vezes, apoio profissional especializado. Buscar esse suporte é um sinal de força e cuidado consigo mesmo, não de fraqueza.",
];

// --- Módulo 8: Tabagismo ---
const TEXTOS_TABACO_NUNCA = [
  "Nunca ter fumado é um dos hábitos mais protetores para a saúde pulmonar e cardiovascular a longo prazo. Esse cuidado, mesmo que não pareça uma escolha ativa no dia a dia, tem grande impacto na sua qualidade de vida.",
  "Sua trajetória sem tabagismo favorece diretamente a capacidade pulmonar, especialmente relevante caso você pratique atividade física com regularidade, já que os pulmões conseguem trabalhar em sua capacidade plena.",
  "Nunca ter fumado contribui para uma circulação sanguínea mais saudável, o que favorece desde a disposição no dia a dia até a recuperação após exercícios físicos.",
  "Sua história sem tabagismo é um dos maiores fatores de proteção contra diversas condições de saúde a longo prazo, incluindo questões cardiovasculares e respiratórias.",
  "Não fumar é um hábito que sustenta bem qualquer objetivo relacionado à performance física, já que os pulmões e o sistema cardiovascular funcionam de forma mais eficiente sem a exposição a essa substância.",
  "Sua trajetória livre do tabagismo contribui para uma pele mais saudável e para um processo de cicatrização mais eficiente, já que o cigarro é conhecido por prejudicar ambos os processos.",
  "Nunca ter fumado é uma escolha que reflete cuidado com a saúde a longo prazo, mesmo que os benefícios não sejam sempre visíveis no dia a dia. Vale reconhecer esse ponto como parte importante do seu bem-estar.",
  "Sua história sem tabagismo favorece o paladar e o olfato, sentidos que costumam ser prejudicados pelo cigarro, o que também contribui para uma relação mais prazerosa com a alimentação.",
  "Não fumar contribui para níveis de oxigenação mais eficientes no corpo, o que favorece desde a disposição diária até a recuperação muscular após atividades físicas.",
  "Sua trajetória sem tabagismo é um dos pilares mais importantes da sua saúde atual, e vale reconhecer esse cuidado como uma base sólida para qualquer outro objetivo que você queira alcançar.",
  "Nunca ter fumado favorece a saúde óssea a longo prazo, já que o tabagismo está associado a maior risco de perda de densidade óssea ao longo dos anos.",
  "Sua história livre do cigarro contribui para um sistema imunológico mais forte, reduzindo a frequência e a intensidade de infecções respiratórias ao longo da vida.",
  "Não fumar é uma escolha que sustenta bem a saúde cardiovascular, reduzindo significativamente o risco de condições como hipertensão e alterações no colesterol ao longo dos anos.",
  "Sua trajetória sem tabagismo é um ativo importante de saúde que vale a pena reconhecer, especialmente pelos benefícios acumulados ao longo de toda uma vida sem exposição a essa substância.",
  "Nunca ter fumado favorece também a fertilidade e a saúde hormonal, fatores que muitas vezes passam despercebidos, mas que fazem parte do quadro geral de benefícios dessa escolha.",
];

const TEXTOS_TABACO_EXFUMANTE = [
  "Ter deixado de fumar é uma das conquistas mais importantes para a saúde a longo prazo, e merece bastante reconhecimento. O corpo começa a se recuperar dos efeitos do cigarro já nas primeiras semanas após a parada.",
  "Sua trajetória como ex-fumante mostra força e determinação. A partir do momento em que se para de fumar, a capacidade pulmonar e a circulação sanguínea começam a melhorar de forma gradual e contínua.",
  "Deixar de fumar é uma mudança que impacta positivamente diversos aspectos da saúde, incluindo o paladar, que costuma se tornar mais sensível, o que pode até facilitar a apreciação de alimentos naturais e variados.",
  "Sua conquista de parar de fumar é um dos maiores presentes que você já deu à própria saúde. Esse é um ótimo momento para reforçar outros hábitos saudáveis, já que o corpo está em processo ativo de recuperação.",
  "Ter parado de fumar reduz progressivamente o risco de diversas condições de saúde, e esse benefício aumenta quanto mais tempo se passa desde a interrupção do hábito.",
  "Sua trajetória como ex-fumante pode vir acompanhada, em alguns casos, de mudanças no apetite ou no peso, o que é normal nesse processo de adaptação. Ajustes na alimentação podem ajudar a equilibrar esse período de transição.",
  "Deixar de fumar é uma conquista que vale muito reconhecimento, e cuidar da alimentação nesse período pode ajudar o corpo a se recuperar ainda mais rápido dos efeitos anteriores do cigarro.",
  "Sua decisão de parar de fumar favorece diretamente a saúde cardiovascular, com redução perceptível do risco de eventos cardíacos já no primeiro ano após a interrupção do hábito.",
  "Ter deixado o cigarro para trás é uma mudança que merece ser celebrada. Esse é um bom momento para investir em atividade física, já que a capacidade pulmonar tende a melhorar progressivamente após a parada.",
  "Sua trajetória como ex-fumante mostra capacidade de mudança e cuidado consigo mesmo, características que também são valiosas para sustentar outros ajustes de hábito relacionados à alimentação e ao bem-estar geral.",
  "Deixar de fumar favorece a absorção de nutrientes importantes, como a vitamina C, que costuma estar reduzida em fumantes devido ao maior consumo dessa vitamina pelo processo de desintoxicação do cigarro.",
  "Sua conquista de parar de fumar é permanente em seus benefícios, mesmo que o processo de adaptação inicial tenha trazido desafios. Reconhecer esse esforço é importante para sustentar a motivação em outros aspectos da saúde.",
  "Ter deixado de fumar reduz gradualmente o risco de diversas condições respiratórias, e complementar essa mudança com boa alimentação e atividade física potencializa ainda mais esses benefícios.",
  "Sua trajetória como ex-fumante é uma prova de capacidade de mudança duradoura, o que pode servir como motivação extra para sustentar outros hábitos saudáveis que você queira construir.",
  "Deixar de fumar é uma das decisões mais impactantes que alguém pode tomar pela própria saúde, e o tempo desde a interrupção do hábito continua trazendo benefícios cumulativos ao longo dos anos.",
];

const TEXTOS_TABACO_LEVE = [
  "Um consumo leve de cigarros ainda representa exposição a substâncias que impactam a saúde pulmonar e cardiovascular, mesmo que em menor intensidade do que um consumo mais elevado. Reduzir gradualmente esse hábito traz benefícios progressivos.",
  "Seu padrão de consumo leve de tabaco é um ponto de partida relativamente favorável para pensar em redução gradual, já que menores quantidades costumam facilitar esse processo de mudança.",
  "Fumar de forma leve ainda impacta a capacidade pulmonar e a oxigenação do corpo, o que pode influenciar a disposição para atividades físicas e a recuperação após o exercício.",
  "Seu consumo atual, mesmo leve, de cigarros reforça a importância de considerar estratégias de redução gradual, com apoio profissional quando necessário, já que qualquer diminuição já traz benefícios perceptíveis para a saúde.",
  "Um padrão leve de tabagismo ainda está associado a impactos na absorção de certos nutrientes, como a vitamina C, o que reforça a importância de uma alimentação rica em frutas e vegetais nesse contexto.",
  "Seu consumo leve de cigarros pode ser um bom ponto de partida para pensar em redução gradual, já que hábitos menos intensos costumam ser mais fáceis de ajustar do que padrões de consumo elevado.",
  "Fumar mesmo que pouco ainda representa um fator de risco para a saúde cardiovascular e pulmonar, e vale considerar apoio especializado caso você tenha interesse em reduzir ou interromper esse hábito.",
  "Seu padrão atual de consumo leve de tabaco é um dado importante para o cuidado integral com a sua saúde, e conversar sobre estratégias de redução pode ser um passo valioso, sempre no seu ritmo.",
  "Um consumo leve de cigarros ainda impacta a qualidade da pele e a capacidade de cicatrização do corpo, fatores que tendem a melhorar progressivamente com a redução gradual desse hábito.",
  "Seu padrão de tabagismo leve reforça a importância de cuidar bem de outros aspectos da saúde, como alimentação rica em antioxidantes, que ajudam o corpo a lidar melhor com o estresse oxidativo gerado pelo cigarro.",
  "Fumar em quantidade reduzida ainda representa exposição a substâncias nocivas, e cada cigarro a menos, mesmo gradualmente, já representa um ganho real para a saúde a longo prazo.",
  "Seu consumo leve de tabaco pode ser um bom momento para buscar apoio, caso tenha interesse em reduzir ainda mais ou interromper o hábito, já que esse padrão inicial costuma responder bem a estratégias de redução gradual.",
  "Um padrão leve de consumo de cigarros ainda impacta o paladar e o olfato, o que pode influenciar sutilmente a forma como você percebe e aprecia os alimentos ao longo do dia.",
  "Seu consumo atual, mesmo que leve, reforça a importância de conversar sobre estratégias de cuidado integral, incluindo apoio médico especializado, caso o objetivo seja reduzir ou interromper esse hábito no futuro.",
  "Fumar pouco ainda é fumar, e reconhecer isso sem julgamento é importante para entender os próximos passos possíveis, sempre no ritmo que fizer sentido para você.",
];

const TEXTOS_TABACO_MODERADO = [
  "Um consumo moderado de cigarros representa uma exposição mais significativa às substâncias nocivas do tabaco, impactando de forma mais perceptível a capacidade pulmonar e a saúde cardiovascular.",
  "Seu padrão moderado de tabagismo reforça a importância de considerar, com apoio profissional adequado, estratégias de redução gradual, já que esse nível de consumo tende a ter impacto cumulativo relevante na saúde.",
  "Fumar em quantidade moderada impacta diretamente a oxigenação do corpo, o que pode se refletir em menor disposição para atividades físicas e recuperação mais lenta após o exercício.",
  "Seu consumo moderado de cigarros pede atenção especial à alimentação, priorizando alimentos ricos em antioxidantes, como frutas cítricas e vegetais coloridos, que ajudam o corpo a lidar com o estresse oxidativo gerado pelo tabaco.",
  "Um padrão moderado de tabagismo está associado a maior risco de diversas condições respiratórias e cardiovasculares, o que reforça a importância de buscar apoio especializado para pensar em estratégias de redução.",
  "Seu consumo atual de cigarros em nível moderado merece atenção cuidadosa, e reduzir gradualmente essa quantidade, com o suporte adequado, já traz benefícios perceptíveis para a saúde ao longo do tempo.",
  "Fumar moderadamente impacta a absorção de nutrientes importantes, como vitamina C e alguns antioxidantes, reforçando a importância de uma alimentação bem estruturada para compensar parte desse impacto.",
  "Seu padrão moderado de tabagismo é um ponto importante do cuidado integral com a saúde, e vale considerar, no seu tempo, conversar sobre possibilidades de redução gradual com apoio médico especializado.",
  "Um consumo moderado de cigarros pode estar relacionado a momentos específicos do dia, como pausas no trabalho ou situações de estresse. Identificar esses gatilhos é um passo importante para pensar em alternativas futuras.",
  "Seu padrão de tabagismo moderado reforça a importância de cuidar de outros aspectos da saúde com atenção redobrada, como atividade física regular, que ajuda a compensar parcialmente alguns dos impactos do cigarro na capacidade cardiorrespiratória.",
  "Fumar em quantidade moderada impacta a qualidade do sono em muitas pessoas, especialmente quando o consumo acontece próximo ao horário de dormir, o que reforça a importância de observar esse padrão.",
  "Seu consumo moderado de cigarros é um dado importante para o cuidado integral com sua saúde, e buscar apoio especializado, quando fizer sentido para você, pode ajudar bastante no processo de redução gradual.",
  "Um padrão moderado de tabagismo reforça a importância de exames de rotina regulares, para acompanhar de perto indicadores de saúde cardiovascular e pulmonar ao longo do tempo.",
  "Seu consumo atual de cigarros pede reconhecimento sem julgamento, e qualquer passo em direção à redução gradual, por menor que seja, já representa um ganho real para a saúde a longo prazo.",
  "Fumar moderadamente é um hábito que se beneficia de uma rede de apoio ampla para redução gradual, incluindo acompanhamento médico, psicológico e nutricional trabalhando de forma integrada.",
];

const TEXTOS_TABACO_INTENSO = [
  "Um consumo intenso de cigarros representa uma exposição significativa a substâncias nocivas, impactando de forma expressiva a saúde pulmonar, cardiovascular e metabólica. Esse é um ponto que merece cuidado prioritário e multidisciplinar.",
  "Seu padrão intenso de tabagismo reforça fortemente a importância de buscar apoio médico especializado, já que a redução ou interrupção desse hábito costuma trazer os maiores ganhos de saúde entre todas as mudanças possíveis de rotina.",
  "Fumar em grande quantidade impacta significativamente a capacidade pulmonar e a oxigenação do corpo, o que pode se refletir em cansaço mais frequente e menor disposição para atividades físicas.",
  "Seu consumo intenso de cigarros é um ponto central a ser trabalhado com cuidado e, acima de tudo, sem julgamento, reconhecendo que esse é um processo desafiador que se beneficia bastante de apoio profissional especializado.",
  "Um padrão intenso de tabagismo está associado a riscos elevados para diversas condições de saúde, o que reforça a importância de um acompanhamento próximo, envolvendo médico, psicólogo e nutricionista trabalhando em conjunto.",
  "Seu consumo elevado de cigarros pede atenção redobrada à alimentação, priorizando antioxidantes e nutrientes que ajudam o corpo a lidar com o alto nível de estresse oxidativo gerado por esse padrão de consumo.",
  "Fumar intensamente impacta significativamente a absorção de nutrientes e o funcionamento do sistema imunológico, reforçando a importância de um cuidado nutricional atento enquanto se trabalha a redução gradual desse hábito.",
  "Seu padrão intenso de tabagismo merece compreensão e cuidado, reconhecendo que a dependência da nicotina é uma condição real que se beneficia de tratamento especializado, não apenas de força de vontade.",
  "Um consumo elevado de cigarros reforça a importância de buscar ajuda o quanto antes, entendendo que esse processo raramente é resolvido sozinho e que existem tratamentos eficazes disponíveis para apoiar essa mudança.",
  "Seu padrão intenso de tabagismo é levado a sério nesse acompanhamento, e qualquer passo em direção à redução, mesmo pequeno, já representa um avanço significativo para a sua saúde a longo prazo.",
  "Fumar em grande quantidade impacta significativamente a saúde cardiovascular, aumentando de forma expressiva o risco de diversas condições, o que reforça a urgência de buscar apoio especializado para essa mudança.",
  "Seu consumo intenso de cigarros pede uma rede de apoio ampla e compassiva, incluindo tratamento médico especializado para dependência de nicotina, já que esse é um dos fatores mais determinantes para o sucesso da redução.",
  "Um padrão intenso de tabagismo reforça a importância de exames de rotina frequentes, para acompanhar de perto a saúde pulmonar e cardiovascular enquanto se trabalha, com cuidado, a redução gradual desse hábito.",
  "Seu consumo elevado de cigarros é reconhecido aqui com acolhimento, sem julgamento algum. Buscar apoio especializado para essa mudança é um passo de coragem e cuidado consigo mesmo.",
  "Fumar intensamente é um padrão que se beneficia enormemente de tratamento especializado para cessação do tabagismo, que pode incluir apoio médico, psicológico e, em alguns casos, medicação específica para auxiliar nesse processo.",
];

// --- Módulo 9: Mastigação ---
const TEXTOS_MASTIGACAO_MUITORAPIDA = [
  "Comer muito rápido é um hábito comum, mas que costuma dificultar a percepção dos sinais de saciedade do corpo. O cérebro leva cerca de 20 minutos para reconhecer que já é suficiente, e mastigar rápido demais tende a levar a porções maiores do que o necessário.",
  "Seu ritmo de mastigação muito acelerado pode estar relacionado à rotina corrida, mas vale observar que comer rápido demais costuma dificultar a digestão, já que os alimentos chegam ao estômago menos processados.",
  "Mastigar muito rápido é um padrão que pode ser ajustado com pequenas estratégias, como pousar os talheres entre as garfadas, o que naturalmente reduz a velocidade da refeição sem exigir esforço constante.",
  "Seu ritmo acelerado ao comer pode estar dificultando o aproveitamento pleno das refeições, já que comer com mais calma favorece tanto a digestão quanto a sensação de satisfação com o que foi consumido.",
  "Comer muito rápido está associado a maior chance de desconfortos digestivos, como gases e sensação de estufamento, já que o processo de mastigação é a primeira etapa importante da digestão dos alimentos.",
  "Seu padrão de mastigação muito rápida pode ser trabalhado com pequenas mudanças de ambiente, como evitar comer em frente a telas, o que costuma acelerar ainda mais o ritmo das refeições sem perceber.",
  "Mastigar rapidamente demais está relacionado a uma tendência de comer mais do que o necessário, já que a sensação de saciedade não tem tempo de ser percebida antes que a refeição termine.",
  "Seu ritmo muito acelerado de mastigação pode ser ajustado gradualmente, começando por contar mentalmente algumas mastigadas extras em cada garfada, até que esse ritmo mais lento se torne mais natural.",
  "Comer muito rápido costuma estar associado a refeições feitas sob pressão de tempo. Reservar, mesmo que poucos minutos a mais para cada refeição, pode ajudar bastante a reduzir esse ritmo acelerado.",
  "Seu padrão de mastigação muito rápida pode dificultar a percepção do sabor e da textura dos alimentos, reduzindo o prazer da refeição, mesmo quando os alimentos escolhidos são saborosos e bem preparados.",
  "Mastigar com pressa é um hábito que o corpo aprende, e por isso também pode reaprender. Pequenas pausas conscientes durante a refeição ajudam a construir, aos poucos, um ritmo mais equilibrado.",
  "Seu ritmo acelerado de mastigação pode estar relacionado a comer em ambientes barulhentos ou distrativos. Buscar mais tranquilidade durante as refeições, quando possível, costuma ajudar a desacelerar naturalmente.",
  "Comer muito rápido tende a reduzir a eficiência da digestão desde a boca, já que a mastigação é responsável por iniciar a quebra dos alimentos e a produção de enzimas digestivas importantes.",
  "Seu padrão de mastigação acelerada pode se beneficiar de refeições com talheres menores, que naturalmente reduzem o tamanho de cada garfada e ajudam a desacelerar o ritmo geral da refeição.",
  "Mastigar rápido demais é um hábito bastante comum na correria do dia a dia, e ajustá-lo aos poucos, sem cobrança excessiva, costuma trazer benefícios tanto para a digestão quanto para o controle das porções.",
];

const TEXTOS_MASTIGACAO_RAPIDA = [
  "Seu ritmo de mastigação está um pouco acelerado, o que é comum, mas ainda tem espaço para ajuste. Comer um pouco mais devagar favorece a digestão e ajuda o corpo a reconhecer melhor os sinais de saciedade.",
  "Mastigar rápido, mesmo que não excessivamente, pode reduzir a percepção de saciedade durante a refeição, o que às vezes leva a comer um pouco mais do que o necessário.",
  "Seu padrão atual de mastigação pede pequenos ajustes, como pausas breves entre as garfadas, que ajudam a desacelerar naturalmente o ritmo da refeição sem exigir grande esforço consciente.",
  "Comer com um ritmo rápido pode estar relacionado à rotina corrida do dia a dia. Reservar alguns minutos extras para as refeições principais pode ajudar a criar mais espaço para desacelerar.",
  "Seu ritmo de mastigação rápido tem espaço para melhorar, e pequenas mudanças, como mastigar cada garfada um pouco mais antes de engolir, já costumam fazer diferença perceptível na digestão.",
  "Mastigar rapidamente pode dificultar levemente a percepção do sabor dos alimentos, reduzindo um pouco o prazer da refeição. Desacelerar o ritmo pode trazer mais satisfação com o que você já está comendo.",
  "Seu padrão atual de mastigação pede atenção a ambientes que aceleram ainda mais esse ritmo, como comer em pé ou distraído com outras tarefas ao mesmo tempo.",
  "Comer em ritmo rápido é comum, mas vale observar que desacelerar um pouco favorece tanto a digestão quanto o controle natural das porções ao longo da refeição.",
  "Seu ritmo de mastigação atual tem espaço para ajustes simples, como pousar os talheres entre as garfadas, o que naturalmente cria pequenas pausas durante a refeição.",
  "Mastigar um pouco mais rápido do que o ideal pode estar relacionado ao contexto das refeições. Buscar comer em ambientes mais tranquilos, quando possível, costuma ajudar a desacelerar naturalmente.",
  "Seu padrão atual de mastigação rápida ainda permite boa digestão na maior parte das vezes, mas otimizar esse ritmo pode trazer benefícios extras para a saciedade e o conforto digestivo.",
  "Comer rápido, mesmo moderadamente, tende a reduzir o tempo total da refeição, o que pode dificultar perceber os sinais de satisfação antes que o prato esteja vazio.",
  "Seu ritmo de mastigação pede pequenos ajustes de consciência, como prestar atenção ao sabor e à textura de cada garfada, o que naturalmente ajuda a desacelerar o ritmo da refeição.",
  "Mastigar em ritmo acelerado pode ser ajustado gradualmente, começando por uma refeição do dia, como o almoço, antes de expandir essa prática para as demais refeições.",
  "Seu padrão atual de mastigação rápida é um ponto simples de ajustar, com potencial de melhorar tanto a digestão quanto a relação geral com a comida ao longo do dia.",
];

const TEXTOS_MASTIGACAO_NORMAL = [
  "Seu ritmo de mastigação está equilibrado, o que é um hábito importante para a digestão e para a percepção adequada dos sinais de saciedade ao longo das refeições.",
  "Mastigar em um ritmo adequado, como parece ser o seu padrão, favorece a digestão desde a boca, já que essa etapa inicial é responsável por quebrar os alimentos e iniciar a produção de enzimas digestivas.",
  "Seu padrão de mastigação equilibrado é um hábito positivo que sustenta bem tanto a digestão quanto o controle natural das porções ao longo das refeições.",
  "Comer em um ritmo adequado, nem muito rápido nem muito lento, costuma favorecer o prazer da refeição, permitindo perceber melhor os sabores e texturas dos alimentos.",
  "Seu ritmo de mastigação atual é um hábito que vale a pena manter, já que ele contribui para uma digestão mais tranquila e para uma relação mais equilibrada com a comida.",
  "Mastigar em ritmo equilibrado favorece a percepção da saciedade no tempo certo, o que costuma facilitar naturalmente o controle das porções sem esforço consciente adicional.",
  "Seu padrão atual de mastigação é positivo e sustenta bem qualquer objetivo relacionado à alimentação, já que esse ritmo equilibrado favorece tanto a digestão quanto a satisfação com as refeições.",
  "Comer em um ritmo adequado é um hábito que muitas pessoas têm dificuldade de manter na correria do dia a dia. Vale reconhecer esse ponto positivo da sua rotina alimentar.",
  "Seu ritmo de mastigação equilibrado contribui para menos desconfortos digestivos, como gases e sensação de estufamento, que costumam estar associados a refeições feitas com muita pressa.",
  "Mastigar adequadamente, como parece ser o seu caso, favorece a absorção de nutrientes, já que alimentos bem processados na boca são mais facilmente aproveitados pelo restante do sistema digestivo.",
  "Seu padrão de mastigação atual é um hábito saudável que vale a pena preservar, especialmente em dias mais corridos, quando a tendência natural é acelerar o ritmo das refeições.",
  "Comer em ritmo equilibrado é uma prática que sustenta bem a relação entre corpo e alimentação, favorecendo tanto o prazer da refeição quanto o funcionamento adequado da digestão.",
  "Seu ritmo de mastigação adequado é um dos hábitos menos percebidos, mas mais importantes para o bem-estar digestivo. Vale reconhecer esse cuidado como parte da sua rotina de saúde.",
  "Mastigar em um ritmo equilibrado favorece a experiência sensorial da refeição, permitindo perceber melhor quando o corpo já está satisfeito, sem depender apenas do volume de comida consumido.",
  "Seu padrão atual de mastigação é positivo e reflete um bom nível de consciência durante as refeições, o que é uma base importante para qualquer ajuste futuro na alimentação.",
];

const TEXTOS_MASTIGACAO_LENTA = [
  "Seu ritmo de mastigação mais pausado é um hábito bastante favorável para a digestão e para a percepção da saciedade. Comer com calma costuma facilitar naturalmente o controle das porções ao longo da refeição.",
  "Mastigar devagar, como parece ser o seu padrão, favorece a produção adequada de enzimas digestivas já na boca, o que facilita todo o processo digestivo nas etapas seguintes.",
  "Seu ritmo mais lento ao comer é um hábito positivo que contribui para uma relação mais tranquila e consciente com a alimentação, permitindo apreciar melhor cada refeição.",
  "Comer devagar favorece a percepção dos sinais de saciedade no tempo certo, já que o cérebro tem tempo suficiente para processar essas informações antes do fim da refeição.",
  "Seu padrão de mastigação lenta é um diferencial positivo, especialmente para quem busca emagrecimento, já que esse ritmo costuma favorecer naturalmente porções mais equilibradas.",
  "Mastigar com calma, como você faz, contribui para menos desconfortos digestivos e para uma melhor absorção dos nutrientes presentes nos alimentos consumidos.",
  "Seu ritmo pausado ao comer é um hábito que vale muito reconhecimento, já que a maioria das pessoas tende a comer rápido demais na correria do dia a dia.",
  "Comer devagar favorece também o prazer da refeição, permitindo perceber melhor os sabores, texturas e aromas dos alimentos, o que contribui para uma experiência alimentar mais satisfatória.",
  "Seu padrão de mastigação mais lenta é um hábito que sustenta bem qualquer objetivo nutricional, já que favorece tanto a digestão quanto o controle natural do apetite.",
  "Mastigar com calma é uma prática que muitas pessoas precisam desenvolver conscientemente, mas que parece já fazer parte natural da sua rotina. Vale reconhecer e manter esse hábito valioso.",
  "Seu ritmo lento ao comer contribui para uma digestão mais eficiente, reduzindo a sobrecarga do estômago e favorecendo o conforto digestivo após as refeições.",
  "Comer devagar é um hábito associado a menor risco de excessos alimentares, já que a saciedade é percebida de forma mais precisa ao longo da refeição.",
  "Seu padrão de mastigação pausada é uma base sólida para uma relação equilibrada com a comida, favorecendo tanto a saúde física quanto o bem-estar emocional durante as refeições.",
  "Mastigar com calma, como parece ser o seu caso, é um hábito que vale a pena manter mesmo em dias mais corridos, já que os benefícios desse ritmo compensam o tempo extra investido nas refeições.",
  "Seu ritmo mais lento de mastigação é um ponto forte da sua rotina alimentar, contribuindo silenciosamente para melhor digestão, mais saciedade e mais prazer em cada refeição.",
];

const TEXTOS_MASTIGACAO_MUITOLENTA = [
  "Seu ritmo de mastigação bastante pausado favorece bastante a digestão, mas vale observar se as refeições estão se estendendo por tempo suficiente para atender às suas necessidades práticas do dia a dia.",
  "Mastigar de forma muito lenta pode, em alguns casos, estar relacionado a dificuldades específicas de mastigação ou deglutição, que vale a pena investigar caso esse padrão seja recente ou venha acompanhado de desconforto.",
  "Seu ritmo muito pausado ao comer favorece bastante a digestão e a percepção da saciedade, mas pode também estar associado a refeições que se estendem além do necessário, o que vale observar caso gere algum desconforto na rotina.",
  "Comer de forma muito lenta pode refletir uma relação bastante consciente com a alimentação, o que é positivo, mas vale garantir que esse ritmo não esteja relacionado a ansiedade ou desconforto durante as refeições.",
  "Seu padrão de mastigação muito lenta favorece a digestão de forma expressiva, e observar se esse ritmo é confortável e prazeroso para você é o principal ponto de atenção nesse cenário.",
  "Mastigar de forma muito pausada pode, em alguns casos, estar relacionado a questões de saúde bucal, como sensibilidade dentária, que vale a pena investigar caso esse padrão seja acompanhado de algum desconforto ao mastigar.",
  "Seu ritmo muito lento ao comer favorece bastante a saciedade e o controle das porções, mas vale observar se as refeições estão confortáveis dentro da sua rotina diária de tempo disponível.",
  "Comer com um ritmo bastante pausado é positivo para a digestão, mas caso esse padrão esteja associado a pouco apetite ou dificuldade em concluir as refeições, vale conversar sobre esse ponto com mais detalhes.",
  "Seu padrão de mastigação muito lenta pode refletir uma relação cuidadosa com a comida, o que é positivo, desde que esse ritmo não esteja associado a desconforto físico ou emocional durante as refeições.",
  "Mastigar muito devagar favorece a digestão de forma significativa, mas vale a pena observar se esse padrão permite que você consuma a quantidade de energia e nutrientes adequada às suas necessidades diárias.",
  "Seu ritmo bastante pausado ao comer é um hábito que, em geral, favorece a saúde digestiva, mas merece atenção caso esteja relacionado a menor apetite ou dificuldade em finalizar as refeições no tempo disponível.",
  "Comer de forma muito lenta pode ser simplesmente uma característica pessoal e prazerosa da sua relação com a comida, o que é totalmente válido, desde que não gere desconforto ou dificuldade na rotina.",
  "Seu padrão de mastigação muito pausada favorece a digestão e a saciedade, mas vale observar o contexto: se esse ritmo é natural e confortável, ou se está relacionado a algum desafio específico que merece mais atenção.",
  "Mastigar de forma muito lenta pode, em algumas situações, estar relacionado a menor apetite geral. Vale a pena observar se isso reflete na quantidade total de nutrientes consumidos ao longo do dia.",
  "Seu ritmo muito pausado ao comer é um ponto que vale conversar com mais detalhes, para entender se esse padrão é uma escolha consciente e confortável ou se está relacionado a algum fator que precisa de atenção específica.",
];

// ---------------------------------------------------------------------------
// Elogios (pontos fortes) — cada função representa UMA situação e retorna
// null quando ela não se aplica ao paciente. As variantes vêm da Biblioteca
// Clínica Oficial (biblioteca_clinica_nutri_em_casa.md), Módulos 3-9.
// ---------------------------------------------------------------------------

function elogiarSono(qualidadeSono: number | null, horasSono: string | null | undefined, insonia: boolean, numeroConsulta: number): string | null {
  if (insonia) return null;
  if (horasSono === "< 4 horas") return null;
  const qualidadeBoa = qualidadeSono != null && qualidadeSono >= 4;
  if (!qualidadeBoa) return null;
  const duracaoBoa = horasSono === "6 a 8 horas" || horasSono === "> 8 horas";
  return duracaoBoa
    ? escolherVariante(TEXTOS_SONO_EXCELENTE, "sono_excelente", numeroConsulta)
    : escolherVariante(TEXTOS_SONO_BOM, "sono_bom", numeroConsulta);
}

function elogiarHidratacao(ingestaoAguaCopos: string | null | undefined, metaAguaMl: number, numeroConsulta: number): string | null {
  const copos = ingestaoAguaCopos != null ? parseInt(ingestaoAguaCopos, 10) : NaN;
  if (Number.isNaN(copos)) return null;
  const ratio = (copos * 250) / metaAguaMl;
  if (ratio < 0.85) return null;
  return ratio >= 1.15
    ? escolherVariante(TEXTOS_AGUA_EXCELENTE, "agua_excelente", numeroConsulta)
    : escolherVariante(TEXTOS_AGUA_ADEQUADA, "agua_adequada", numeroConsulta);
}

function elogiarAtividadeFisica(nivelAtividade: NivelAtividade, numeroConsulta: number): string | null {
  if (nivelAtividade === "moderado") return escolherVariante(TEXTOS_ATIVIDADE_MODERADO, "atividade_moderado", numeroConsulta);
  if (nivelAtividade === "intenso") return escolherVariante(TEXTOS_ATIVIDADE_MUITOATIVO, "atividade_muitoativo", numeroConsulta);
  if (nivelAtividade === "atleta") return escolherVariante(TEXTOS_ATIVIDADE_ATLETA, "atividade_atleta", numeroConsulta);
  return null;
}

function elogiarAlcool(consumo: ConsumoAlcool, numeroConsulta: number): string | null {
  if (consumo !== "nunca") return null;
  return escolherVariante(TEXTOS_ALCOOL_NUNCA, "alcool_nunca", numeroConsulta);
}

function elogiarTabagismo(status: StatusTabagismo, numeroConsulta: number): string | null {
  if (status === "nunca") return escolherVariante(TEXTOS_TABACO_NUNCA, "tabagismo_nunca", numeroConsulta);
  if (status === "ex_fumante") return escolherVariante(TEXTOS_TABACO_EXFUMANTE, "tabagismo_exfumante", numeroConsulta);
  return null;
}

function elogiarEstresse(nivelEstresse: number | null, numeroConsulta: number): string | null {
  if (nivelEstresse == null) return null;
  if (nivelEstresse === 1) return escolherVariante(TEXTOS_ESTRESSE_MUITOBAIXO, "estresse_muitobaixo", numeroConsulta);
  if (nivelEstresse === 2) return escolherVariante(TEXTOS_ESTRESSE_BAIXO, "estresse_baixo", numeroConsulta);
  return null;
}

function elogiarMastigacao(mastigacao: string | null | undefined, numeroConsulta: number): string | null {
  if (mastigacao === "Normal, aprecio a comida com atenção plena.") {
    return escolherVariante(TEXTOS_MASTIGACAO_NORMAL, "mastigacao_normal", numeroConsulta);
  }
  if (mastigacao === "Lenta, sempre termino por último.") {
    return escolherVariante(TEXTOS_MASTIGACAO_LENTA, "mastigacao_lenta", numeroConsulta);
  }
  return null;
}

const VARIANTES_ELOGIO_DISPOSICAO = [
  "Sua disposição física está boa ao longo de todo o dia — um bom sinal de que seu corpo está respondendo bem à sua rotina atual.",
  "Você relatou boa disposição em todos os períodos do dia, o que costuma refletir um bom equilíbrio entre sono, alimentação e rotina — um sinal positivo de que as coisas estão funcionando bem juntas.",
  "Manter boa energia do início ao fim do dia como você tem feito é um reflexo de que seu corpo está bem ajustado — isso facilita bastante manter a consistência nos próximos passos.",
  "Sua disposição constante ao longo do dia é um ótimo indicador — geralmente reflete que sono, alimentação e rotina estão bem equilibrados entre si.",
  "Ter disposição estável de manhã, tarde e noite é um sinal e tanto de que seu corpo está bem regulado — isso deixa qualquer ajuste na alimentação ainda mais eficaz.",
];

const VARIANTES_ELOGIO_ROTINA_ALIMENTAR = [
  "Você raramente depende de restaurante ou delivery, o que facilita bastante manter o controle da sua alimentação no dia a dia.",
  "Preparar suas próprias refeições com a frequência que você tem é uma vantagem grande — dá muito mais controle sobre ingredientes, temperos e porções do que comer fora com frequência.",
  "O fato de você não depender de delivery ou restaurante na maior parte do tempo facilita bastante o acompanhamento do seu plano alimentar.",
  "Sua rotina de comer em casa com frequência ajuda demais no controle da alimentação — dá para ajustar quantidades e ingredientes com muito mais precisão do que comendo fora.",
  "Você mantém uma rotina alimentar bem caseira, o que é uma vantagem real: mais controle sobre o que entra no prato e menos surpresas de sal, açúcar e óleo escondidos.",
];

function elogiarDisposicao(
  manha: string | null | undefined,
  tarde: string | null | undefined,
  noite: string | null | undefined,
  numeroConsulta: number
): string | null {
  if (manha !== "Boa" || tarde !== "Boa" || noite !== "Boa") return null;
  return escolherVariante(VARIANTES_ELOGIO_DISPOSICAO, "elogio_disposicao", numeroConsulta);
}

function elogiarRotinaAlimentar(frequenciaRestaurante: string | null | undefined, numeroConsulta: number): string | null {
  if (frequenciaRestaurante !== "Não tenho esse costume") return null;
  return escolherVariante(VARIANTES_ELOGIO_ROTINA_ALIMENTAR, "elogio_rotina_alimentar", numeroConsulta);
}


// ---------------------------------------------------------------------------
// Condições de saúde (TEXTOS_CONDICAO) — cada condição agora tem várias
// variantes de texto, mantendo o mesmo título e prioridade de antes.
// ---------------------------------------------------------------------------

const TEXTOS_CONDICAO: Partial<Record<CondicaoSaude, { titulo: string; textos: string[]; prioridade: number }>> = {
  diabetes_tipo1: {
    titulo: "Diabetes tipo 1",
    prioridade: 2,
    textos: [
      "Um dos pontos que pede atenção especial é o controle da diabetes. Vamos cuidar da distribuição dos carboidratos ao longo do dia para ajudar a manter sua glicemia mais estável — o acompanhamento com seu médico continua sendo essencial junto com a alimentação.",
      "Sua diabetes é um ponto central da sua consulta. Organizar os carboidratos ao longo do dia, em vez de concentrá-los em poucas refeições, ajuda bastante a manter a glicemia mais previsível — sempre em conjunto com seu acompanhamento médico.",
      "Cuidar da diabetes passa bastante pela forma como os carboidratos são distribuídos nas refeições, não só pela quantidade total — é nisso que vamos focar, sem substituir o acompanhamento com seu médico.",
      "A diabetes pede uma atenção contínua: vamos equilibrar os carboidratos ao longo do dia para ajudar no controle glicêmico, sempre alinhado com as orientações do seu médico.",
      "Manter a glicemia estável é um dos focos principais aqui — a forma como os carboidratos são distribuídos nas refeições faz bastante diferença nisso, em conjunto com o acompanhamento médico que você já tem.",
    ],
  },
  diabetes_tipo2: {
    titulo: "Diabetes tipo 2",
    prioridade: 2,
    textos: [
      "Um dos pontos que pede atenção especial é o controle da diabetes. Vamos cuidar da distribuição dos carboidratos ao longo do dia para ajudar a manter sua glicemia mais estável — o acompanhamento com seu médico continua sendo essencial junto com a alimentação.",
      "Sua diabetes é um ponto central da sua consulta. Organizar os carboidratos ao longo do dia, em vez de concentrá-los em poucas refeições, ajuda bastante a manter a glicemia mais previsível — sempre em conjunto com seu acompanhamento médico.",
      "Cuidar da diabetes passa bastante pela forma como os carboidratos são distribuídos nas refeições, não só pela quantidade total — é nisso que vamos focar, sem substituir o acompanhamento com seu médico.",
      "A diabetes pede uma atenção contínua: vamos equilibrar os carboidratos ao longo do dia para ajudar no controle glicêmico, sempre alinhado com as orientações do seu médico.",
      "Manter a glicemia estável é um dos focos principais aqui — a forma como os carboidratos são distribuídos nas refeições faz bastante diferença nisso, em conjunto com o acompanhamento médico que você já tem.",
    ],
  },
  hipertensao: {
    titulo: "Pressão arterial",
    prioridade: 3,
    textos: [
      "Um dos pontos que merece atenção é sua pressão arterial. Como você tem hipertensão, pequenos ajustes — como moderar o sal e os industrializados — podem contribuir bastante para um melhor controle ao longo do tempo.",
      "Sua hipertensão é um ponto que vamos acompanhar de perto — reduzir sal e alimentos industrializados no dia a dia costuma trazer bons resultados no controle da pressão, aos poucos e sem radicalismo.",
      "Com hipertensão, vale prestar atenção especial ao sódio escondido em molhos prontos, embutidos e temperos industrializados — pequenas trocas nesse sentido já ajudam bastante no controle da pressão.",
      "Cuidar da pressão arterial passa bastante pela alimentação: reduzir gradualmente o sal e os industrializados tende a fazer diferença real no controle, sempre junto com o acompanhamento médico.",
      "Sua pressão é um dos pontos de atenção da consulta — moderar sódio e priorizar temperos naturais no lugar de prontos industrializados costuma ajudar bastante nesse controle.",
    ],
  },
  doenca_renal: {
    titulo: "Saúde renal",
    prioridade: 4,
    textos: [
      "Sua condição renal pede um cuidado extra com a quantidade de proteína e sódio na alimentação. Vamos trabalhar com valores mais conservadores, e o ideal é sempre alinhar isso de perto com seu nefrologista.",
      "Cuidar dos rins passa por controlar bem a proteína e o sódio da alimentação — vamos manter esses valores mais conservadores, sempre em conjunto com o acompanhamento do seu nefrologista.",
      "Sua saúde renal pede atenção redobrada com proteína e sódio — trabalharemos com margens mais seguras nesses dois pontos, sempre alinhado com seu médico.",
      "Com a condição renal que você relatou, vamos ajustar a proteína e o sódio para valores mais conservadores — o acompanhamento nefrológico continua sendo indispensável nesse processo.",
      "A saúde dos rins pede cuidado específico com proteína e sódio na dieta — vamos seguir critérios mais conservadores, sempre de acordo com o que seu nefrologista já orienta.",
    ],
  },
  hipotireoidismo: {
    titulo: "Tireoide",
    prioridade: 6,
    textos: [
      "Alterações de tireoide pedem atenção especial porque afetam seu metabolismo de um jeito que a alimentação sozinha não resolve completamente. Vamos priorizar iodo e fibra na sua rotina, e o acompanhamento médico continua importante.",
      "Sua tireoide influencia bastante o seu metabolismo — vamos incluir boas fontes de iodo e fibra na sua rotina alimentar, sempre lembrando que o acompanhamento médico é essencial nesse cuidado.",
      "Com o hipotireoidismo, o metabolismo tende a ficar mais lento — a alimentação ajuda bastante com boas fontes de iodo e fibra, mas o tratamento médico continua sendo a base do cuidado.",
      "Cuidar da tireoide passa por incluir iodo e fibra na alimentação de forma consistente — é um complemento importante ao tratamento que você já faz com seu médico.",
      "Sua condição de tireoide pede atenção contínua: vamos ajustar a alimentação priorizando iodo e fibra, sempre junto com o acompanhamento médico que você já mantém.",
    ],
  },
  hipertireoidismo: {
    titulo: "Tireoide",
    prioridade: 6,
    textos: [
      "Alterações de tireoide pedem atenção especial porque afetam seu metabolismo de um jeito que a alimentação sozinha não resolve completamente. Nesse caso, vamos garantir calorias e proteína suficientes para evitar perda de massa muscular, e o acompanhamento médico continua importante.",
      "Sua tireoide acelera o metabolismo, então vamos garantir calorias e proteína suficientes para evitar perda de massa — sempre em conjunto com o acompanhamento médico do hipertireoidismo.",
      "Com o hipertireoidismo, o corpo gasta mais energia do que o normal — por isso vamos cuidar para que a alimentação tenha calorias e proteína suficientes, sem substituir o tratamento médico.",
      "Cuidar da tireoide nesse caso significa garantir energia e proteína o bastante para não perder massa muscular — um complemento importante ao tratamento que você já faz.",
      "Sua condição de tireoide pede atenção redobrada com calorias e proteína — vamos ajustar isso na alimentação, sempre acompanhado de perto pelo seu médico.",
    ],
  },
  colesterol_alto: {
    titulo: "Colesterol",
    prioridade: 6,
    textos: [
      "Seu colesterol é outro ponto que vamos cuidar juntos — priorizando gorduras boas (azeite, castanhas, peixes) e moderando frituras e gordura saturada no dia a dia.",
      "Para cuidar do colesterol, vamos priorizar gorduras boas como azeite, castanhas e peixes, reduzindo aos poucos frituras e gordura saturada — mudanças graduais que costumam fazer diferença real.",
      "Seu colesterol pede atenção ao tipo de gordura consumida — trocar frituras e gordura saturada por azeite, castanhas e peixes tende a ajudar bastante ao longo do tempo.",
      "Cuidar do colesterol passa por escolher melhor as gorduras: mais azeite, castanhas e peixes, menos frituras e industrializados — um ajuste gradual que rende bons resultados.",
      "O colesterol é um dos pontos que vamos acompanhar — priorizando fontes de gordura boa e reduzindo aos poucos frituras e ultraprocessados no dia a dia.",
    ],
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
  numeroConsulta: number;
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
    blocos.push({
      chave: condicao,
      titulo: info.titulo,
      prioridade: info.prioridade,
      categoria: "condicao_saude",
      texto: escolherVariante(info.textos, `condicao_${condicao}`, params.numeroConsulta),
    });
  }

  if (params.classificacaoImc === "Obesidade grau II" || params.classificacaoImc === "Obesidade grau III") {
    blocos.push({
      chave: "peso_corporal",
      titulo: "Peso corporal",
      prioridade: 5,
      categoria: "condicao_saude",
      texto: escolherVariante(VARIANTES_PESO_CORPORAL_ACIMA, "peso_corporal_acima", params.numeroConsulta),
    });
  } else if (params.classificacaoImc === "Abaixo do peso") {
    blocos.push({
      chave: "peso_corporal",
      titulo: "Peso corporal",
      prioridade: 5,
      categoria: "condicao_saude",
      texto: escolherVariante(VARIANTES_PESO_CORPORAL_ABAIXO, "peso_corporal_abaixo", params.numeroConsulta),
    });
  }

  if (params.perdaPesoNaoIntencional && params.perdaPesoNaoIntencional.trim()) {
    blocos.push({
      chave: "mudanca_peso",
      titulo: "Perda de peso recente",
      prioridade: 2,
      categoria: "condicao_saude",
      texto: escolherVariante(VARIANTES_PERDA_PESO_NAO_INTENCIONAL, "perda_peso", params.numeroConsulta),
    });
  }
  if (params.ganhoPesoNaoIntencional && params.ganhoPesoNaoIntencional.trim()) {
    blocos.push({
      chave: "mudanca_peso",
      titulo: "Ganho de peso recente",
      prioridade: 2,
      categoria: "condicao_saude",
      texto: escolherVariante(VARIANTES_GANHO_PESO_NAO_INTENCIONAL, "ganho_peso", params.numeroConsulta),
    });
  }

  return blocos;
}

const VARIANTES_PESO_CORPORAL_ACIMA = [
  "Seu peso atual está numa faixa que pede atenção redobrada — mas isso não muda o caminho: pequenas mudanças consistentes na alimentação, mantidas ao longo do tempo, costumam trazer resultados reais e duradouros nesse cenário.",
  "Seu peso pede um acompanhamento mais próximo neste momento — o caminho continua sendo o mesmo: consistência em pequenas mudanças, sem pressa, costuma trazer os melhores resultados a longo prazo.",
  "Nessa faixa de peso, vale reforçar: o processo tende a ser mais gradual, e isso é normal — o foco em pequenas mudanças sustentáveis é o que traz resultado de verdade, sem desgastar o corpo nem a mente.",
  "Seu peso atual pede cuidado redobrado, mas a estratégia continua simples: mudanças pequenas e constantes na alimentação, sustentadas ao longo do tempo, tendem a gerar resultados sólidos.",
  "Essa faixa de peso pede atenção especial — o mais importante é lembrar que progresso gradual e consistente costuma ser bem mais duradouro do que mudanças bruscas.",
];

const VARIANTES_PESO_CORPORAL_ABAIXO = [
  "Seu peso atual está abaixo da faixa considerada saudável para sua altura. Vamos focar em ganhar peso de forma gradual e segura, e recomendamos fortemente somar isso a um acompanhamento presencial.",
  "Seu peso está abaixo do que seria esperado para sua altura — vamos trabalhar num ganho de peso gradual e seguro, e um acompanhamento presencial é fortemente recomendado nesse processo.",
  "Estando abaixo da faixa de peso saudável para sua altura, o foco será ganhar peso aos poucos e com segurança — vale muito somar isso a um acompanhamento nutricional presencial.",
  "Seu peso atual pede atenção: vamos priorizar um ganho de peso gradual e bem estruturado, sempre recomendando um acompanhamento presencial junto a esse processo.",
  "Como seu peso está abaixo do recomendado para sua altura, o caminho é ganhar peso de forma gradual e segura — reforçamos a importância de um acompanhamento presencial nesse momento.",
];

const VARIANTES_PERDA_PESO_NAO_INTENCIONAL = [
  "Você mencionou ter perdido peso recentemente sem intenção de fazer isso — vale a pena investigar essa mudança com um médico ou nutricionista presencialmente, mesmo que o restante da consulta não tenha apontado nada preocupante.",
  "A perda de peso não intencional que você relatou merece uma investigação com um profissional presencialmente — é sempre importante entender a causa, mesmo quando o resto da avaliação parece tranquilo.",
  "Perder peso sem ter buscado isso é algo que vale a pena conversar com um médico ou nutricionista pessoalmente — só para garantir que não haja nada por trás dessa mudança.",
  "Como você perdeu peso sem intenção, recomendamos investigar isso com acompanhamento presencial — é uma mudança que merece ser entendida com calma por um profissional.",
  "Notamos que você teve uma perda de peso não intencional — vale conversar sobre isso com um médico ou nutricionista presencialmente para entender melhor o que pode estar por trás.",
];

const VARIANTES_GANHO_PESO_NAO_INTENCIONAL = [
  "Você mencionou ter ganhado peso recentemente sem intenção de fazer isso — vale comentar com um médico ou nutricionista presencialmente, principalmente se não conseguir associar isso a uma mudança clara de rotina.",
  "O ganho de peso não intencional que você relatou merece ser conversado com um profissional presencialmente, principalmente se não houver uma explicação clara de rotina por trás disso.",
  "Ganhar peso sem ter buscado isso é algo que vale investigar com um médico ou nutricionista pessoalmente — ainda mais se não estiver ligado a uma mudança óbvia de hábitos.",
  "Como você ganhou peso sem intenção, vale a pena conversar com um profissional presencialmente para entender melhor essa mudança, principalmente se ela não tiver uma causa clara.",
  "Notamos um ganho de peso não intencional na sua resposta — recomendamos comentar isso com um médico ou nutricionista presencialmente, especialmente sem uma causa evidente de rotina.",
];

const VARIANTES_DELIVERY = [
  "Percebemos que boa parte das suas refeições acontece através de restaurante, bar ou delivery. Isso é muito comum na rotina atual e não precisa ser um problema — o mais importante é fazer escolhas mais equilibradas nesses momentos, priorizando grelhados, legumes e saladas, e reduzindo bebidas açucaradas.",
  "Boa parte das suas refeições vem de restaurante ou delivery, o que é bem comum hoje em dia — o segredo está em escolher melhor nesses momentos: grelhados, saladas e legumes tendem a ser opções mais equilibradas do que frituras e refrigerantes.",
  "Comer fora ou pedir delivery com frequência é a realidade de muita gente — o que mais ajuda é escolher com um pouco mais de atenção nesses momentos, priorizando grelhados e vegetais e evitando bebidas açucaradas.",
  "Sua rotina inclui bastante restaurante e delivery, o que não precisa ser encarado como um problema — pequenas escolhas mais conscientes nesses momentos, como preferir grelhados e saladas, já fazem bastante diferença.",
  "Você depende bastante de restaurante ou delivery no dia a dia, algo cada vez mais comum — o foco não precisa ser eliminar isso, mas escolher melhor: grelhados, legumes e saladas no lugar de frituras e bebidas açucaradas.",
];

const VARIANTES_ROTINA_TRABALHO = [
  "Sua rotina parece incluir turno noturno ou horários irregulares, o que está associado a mais risco metabólico. Manter horários de refeição o mais fixos possível dentro da sua escala ajuda bastante, mesmo que não sejam horários 'convencionais'.",
  "Trabalhar em turnos ou horários irregulares, como parece ser o seu caso, está associado a mais risco metabólico — manter horários de refeição fixos dentro da sua própria escala ajuda bastante a reduzir esse impacto.",
  "Sua rotina de trabalho parece incluir horários fora do padrão, o que pode mexer com o metabolismo — fixar horários de refeição dentro da sua escala específica, mesmo que não convencionais, ajuda o corpo a se organizar melhor.",
  "Rotinas de trabalho noturnas ou em turnos, como a sua, pedem atenção extra ao metabolismo — manter uma rotina fixa de horários de refeição, adaptada à sua escala, é uma das formas mais eficazes de reduzir esse impacto.",
  "Sua escala de trabalho parece incluir horários irregulares, o que tende a mexer mais com o metabolismo — o quanto antes você conseguir fixar horários de refeição dentro dessa rotina, melhor o corpo se adapta.",
];

/**
 * Hábitos de vida — atividade física, água, sono, estresse, álcool,
 * tabagismo e mastigação agora usam os textos da Biblioteca Clínica Oficial
 * (Módulos 3, 6, 5, 8, 9 e 9). Delivery e rotina de trabalho não faziam
 * parte da biblioteca nova e continuam com o texto anterior. As chaves
 * (`chave`) de cada PontoAtencao foram mantidas idênticas às de antes para
 * não quebrar o FRASE_PRIORIDADE usado em montarPrioridades.
 *
 * Algumas variantes da biblioteca (Álcool "Raramente"/"Diariamente",
 * Tabagismo "leve"/"intenso", Sono "medicação"/"muitas horas", Estresse
 * "baixo"/"moderado", Mastigação "muito rápida"/"muito lenta") ainda não são
 * alcançáveis com as opções atuais do questionário — ficam prontas no código
 * para quando as perguntas forem ampliadas.
 */
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
  numeroConsulta: number;
}): PontoAtencao[] {
  const blocos: PontoAtencao[] = [];

  if (params.nivelAtividade === "sedentario" || params.nivelAtividade === "leve") {
    blocos.push({
      chave: "sedentarismo",
      titulo: "Atividade física",
      prioridade: 7,
      categoria: "habito_vida",
      texto:
        params.nivelAtividade === "sedentario"
          ? escolherVariante(TEXTOS_ATIVIDADE_SEDENTARIO, "atividade_sedentario", params.numeroConsulta)
          : escolherVariante(TEXTOS_ATIVIDADE_POUCOATIVO, "atividade_poucoativo", params.numeroConsulta),
    });
  }

  const copos = params.ingestaoAguaCopos != null ? parseInt(params.ingestaoAguaCopos, 10) : NaN;
  if (!Number.isNaN(copos)) {
    const ratio = (copos * 250) / params.aguaMl;
    if (ratio < 0.85) {
      blocos.push({
        chave: "agua",
        titulo: "Hidratação",
        prioridade: 8,
        categoria: "habito_vida",
        texto:
          ratio < 0.5
            ? escolherVariante(TEXTOS_AGUA_MUITOABAIXO, "agua_muitoabaixo", params.numeroConsulta)
            : escolherVariante(TEXTOS_AGUA_ABAIXO, "agua_abaixo", params.numeroConsulta),
      });
    }
  }

  if (params.insonia) {
    blocos.push({
      chave: "sono",
      titulo: "Sono",
      prioridade: 9,
      categoria: "habito_vida",
      texto: escolherVariante(TEXTOS_SONO_INSONIA, "sono_insonia", params.numeroConsulta),
    });
  } else if (params.horasSono === "< 4 horas") {
    blocos.push({
      chave: "sono",
      titulo: "Sono",
      prioridade: 9,
      categoria: "habito_vida",
      texto: escolherVariante(TEXTOS_SONO_POUCASHORAS, "sono_poucashoras", params.numeroConsulta),
    });
  } else if (params.qualidadeSono === 2) {
    blocos.push({
      chave: "sono",
      titulo: "Sono",
      prioridade: 9,
      categoria: "habito_vida",
      texto: escolherVariante(TEXTOS_SONO_RUIM, "sono_ruim", params.numeroConsulta),
    });
  } else if (params.qualidadeSono === 3 && params.horasSono === "4 a 6 horas") {
    blocos.push({
      chave: "sono",
      titulo: "Sono",
      prioridade: 9,
      categoria: "habito_vida",
      texto: escolherVariante(TEXTOS_SONO_RUIM, "sono_ruim", params.numeroConsulta),
    });
  } else if (params.qualidadeSono === 3) {
    blocos.push({
      chave: "sono",
      titulo: "Sono",
      prioridade: 9,
      categoria: "habito_vida",
      texto: escolherVariante(TEXTOS_SONO_REGULAR, "sono_regular", params.numeroConsulta),
    });
  }

  if (params.nivelEstresse === 4) {
    blocos.push({
      chave: "estresse",
      titulo: "Estresse",
      prioridade: 10,
      categoria: "habito_vida",
      texto: escolherVariante(TEXTOS_ESTRESSE_ALTO, "estresse_alto", params.numeroConsulta),
    });
  } else if (params.nivelEstresse === 5) {
    blocos.push({
      chave: "estresse",
      titulo: "Estresse",
      prioridade: 10,
      categoria: "habito_vida",
      texto: escolherVariante(TEXTOS_ESTRESSE_MUITOALTO, "estresse_muitoalto", params.numeroConsulta),
    });
  }

  if (params.consumoAlcool === "moderado" || params.consumoAlcool === "frequente") {
    blocos.push({
      chave: "alcool",
      titulo: "Álcool",
      prioridade: 11,
      categoria: "habito_vida",
      texto:
        params.consumoAlcool === "frequente"
          ? escolherVariante(TEXTOS_ALCOOL_FREQUENTE, "alcool_frequente", params.numeroConsulta)
          : escolherVariante(TEXTOS_ALCOOL_SOCIALMENTE, "alcool_socialmente", params.numeroConsulta),
    });
  }

  if (params.tabagismo === "fumante") {
    blocos.push({
      chave: "tabagismo",
      titulo: "Tabagismo",
      prioridade: 11,
      categoria: "habito_vida",
      texto: escolherVariante(TEXTOS_TABACO_MODERADO, "tabagismo_fumante", params.numeroConsulta),
    });
  }

  if (params.frequenciaRestaurante === "3 a 4 vezes por semana" || params.frequenciaRestaurante === "Sempre") {
    blocos.push({
      chave: "delivery",
      titulo: "Restaurante e delivery",
      prioridade: 12,
      categoria: "habito_vida",
      texto: escolherVariante(VARIANTES_DELIVERY, "delivery", params.numeroConsulta),
    });
  }

  if (params.mastigacao === "Rápida demais, sempre termino primeiro.") {
    blocos.push({
      chave: "mastigacao",
      titulo: "Mastigação",
      prioridade: 13,
      categoria: "habito_vida",
      texto: escolherVariante(TEXTOS_MASTIGACAO_RAPIDA, "mastigacao", params.numeroConsulta),
    });
  }

  const rotinaNormalizada = params.rotinaTrabalho ? normalizar(params.rotinaTrabalho) : "";
  if (["noturno", "turno", "madrugada", "plantao", "escala", "revezamento"].some((t) => rotinaNormalizada.includes(t))) {
    blocos.push({
      chave: "rotina_trabalho",
      titulo: "Rotina de trabalho",
      prioridade: 12,
      categoria: "habito_vida",
      texto: escolherVariante(VARIANTES_ROTINA_TRABALHO, "rotina_trabalho", params.numeroConsulta),
    });
  }

  return blocos;
}


// ---------------------------------------------------------------------------
// Alimentação
// ---------------------------------------------------------------------------

const VARIANTES_ALIMENTACAO_COM_HISTORICO = [
  "Pelo que você descreveu da sua rotina alimentar, já dá para montar um plano que se encaixa bem no seu dia a dia — vamos manter o que já funciona para você e ajustar só o que for necessário para bater suas metas.",
  "Com base no que você contou sobre sua alimentação, dá para montar um plano que respeita bastante a sua rotina — a ideia é ajustar só o necessário, mantendo o que já funciona bem para você.",
  "A partir do que você relatou sobre seus hábitos alimentares, já temos um bom ponto de partida — vamos preservar o que já faz sentido na sua rotina e ajustar apenas o que for preciso para alcançar suas metas.",
  "Pelo histórico que você compartilhou, conseguimos montar um plano que se encaixa naturalmente no seu dia a dia, mudando só o necessário para bater as metas calculadas.",
];

const VARIANTES_ALIMENTACAO_SEM_HISTORICO = [
  "Vamos montar seu plano alimentar já pensando em algo prático para a sua rotina.",
  "O plano alimentar será montado com foco em algo simples e prático de encaixar no seu dia a dia.",
  "Vamos construir seu plano priorizando praticidade — algo que caiba bem na sua rotina sem complicar.",
  "O foco na montagem do seu plano será a praticidade, para que ele se encaixe naturalmente na sua rotina.",
];

const VARIANTES_ALIMENTACAO_VEGANO = [
  "Como sua alimentação é vegana, vamos ficar de olho principalmente em vitamina B12 (que não existe em fontes vegetais e geralmente pede suplementação), além de ferro, cálcio, zinco e ômega-3 — vale conversar com um nutricionista sobre suplementação.",
  "Sendo sua alimentação vegana, o cuidado maior é com vitamina B12 — ela não existe em fontes vegetais e normalmente precisa de suplementação — além de ferro, cálcio, zinco e ômega-3, que merecem atenção extra no cardápio.",
  "Na alimentação vegana, os pontos de atenção nutricional são principalmente vitamina B12 (quase sempre precisa de suplemento), ferro, cálcio, zinco e ômega-3 — vale conversar com um profissional sobre a suplementação ideal para você.",
  "Como você segue uma alimentação vegana, vamos priorizar fontes que ajudem com ferro, cálcio, zinco e ômega-3, e reforçar a importância da suplementação de B12, que não existe em alimentos de origem vegetal.",
];

const VARIANTES_ALIMENTACAO_VEGETARIANO = [
  "Como sua alimentação é vegetariana, vamos dar atenção especial a ferro, cálcio e vitamina B12, principalmente se ovos e laticínios não estiverem sempre presentes — combinar fontes vegetais de ferro com vitamina C ajuda bastante na absorção.",
  "Sendo sua alimentação vegetariana, os nutrientes que merecem mais atenção são ferro, cálcio e vitamina B12 — especialmente se ovos e laticínios não fizerem parte da rotina com frequência. Combinar ferro vegetal com vitamina C ajuda bastante na absorção.",
  "Na alimentação vegetariana, vale reforçar ferro, cálcio e vitamina B12 — principalmente na ausência regular de ovos e laticínios. Uma dica simples é combinar fontes de ferro vegetal com alimentos ricos em vitamina C.",
  "Como você é vegetariano(a), vamos cuidar especialmente de ferro, cálcio e vitamina B12 — combinar ferro de origem vegetal com vitamina C na mesma refeição ajuda bastante a absorção desses nutrientes.",
];

const VARIANTES_ALIMENTACAO_DIETA_ANTERIOR = [
  "Como você já tentou outras dietas antes, vamos priorizar um ritmo mais gradual desta vez — mudanças pequenas e consistentes tendem a durar muito mais do que restrições radicais.",
  "Já que você já passou por outras dietas antes, dessa vez o foco será um ritmo mais gradual e sustentável — mudanças pequenas e constantes costumam durar muito mais do que cortes radicais.",
  "Considerando que você já tentou outras abordagens antes, vamos ir com calma dessa vez — consistência em pequenas mudanças tende a trazer resultados que realmente se sustentam ao longo do tempo.",
  "Pelo seu histórico com outras dietas, vamos priorizar um caminho mais gradual agora — mudanças pequenas e mantidas ao longo do tempo costumam funcionar muito melhor do que restrições radicais.",
];

function montarAlimentacao(params: {
  restricoesAlimentares: string[];
  historicoDietetico: string | null | undefined;
  dietaAnterior: string | null | undefined;
  numeroConsulta: number;
}): string {
  const normalizadas = params.restricoesAlimentares.map(normalizar);
  const eVegano = normalizadas.some((r) => r.includes("vegan"));
  const eVegetariano = !eVegano && normalizadas.some((r) => r.includes("vegetarian"));

  const partes: string[] = [];
  partes.push(
    params.historicoDietetico && params.historicoDietetico.trim()
      ? escolherVariante(VARIANTES_ALIMENTACAO_COM_HISTORICO, "alimentacao_com_historico", params.numeroConsulta)
      : escolherVariante(VARIANTES_ALIMENTACAO_SEM_HISTORICO, "alimentacao_sem_historico", params.numeroConsulta)
  );

  if (eVegano) {
    partes.push(escolherVariante(VARIANTES_ALIMENTACAO_VEGANO, "alimentacao_vegano", params.numeroConsulta));
  } else if (eVegetariano) {
    partes.push(escolherVariante(VARIANTES_ALIMENTACAO_VEGETARIANO, "alimentacao_vegetariano", params.numeroConsulta));
  }

  if (params.dietaAnterior && normalizar(params.dietaAnterior) !== "não") {
    partes.push(escolherVariante(VARIANTES_ALIMENTACAO_DIETA_ANTERIOR, "alimentacao_dieta_anterior", params.numeroConsulta));
  }

  return partes.join(" ");
}

// ---------------------------------------------------------------------------
// Prioridades e mensagem final
// ---------------------------------------------------------------------------

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

const VARIANTES_MENSAGEM_NENHUM_PONTO = [
  "Você já possui uma excelente base de hábitos saudáveis, exatamente o que serve de alicerce para alcançar seus objetivos. Agora vamos apenas ajustar alguns detalhes junto com o plano alimentar para potencializar ainda mais os seus resultados.",
  "Sua avaliação mostrou uma base de hábitos muito sólida — isso facilita bastante o caminho a partir daqui. Vamos usar o plano alimentar para refinar os últimos detalhes e potencializar seus resultados.",
  "Você chega nessa consulta com hábitos já muito bem estabelecidos, o que é uma grande vantagem. Daqui pra frente, é questão de ajustar detalhes finos junto com o plano alimentar para colher ainda mais resultado.",
  "Sua base de hábitos está excelente, e isso conta muito a seu favor. O plano alimentar agora entra para afinar os últimos ajustes e potencializar o que você já vem fazendo bem.",
  "Você já reúne praticamente tudo que é necessário em termos de hábitos — o que falta agora é só o ajuste fino que o plano alimentar vai trazer, para extrair o máximo desses fundamentos sólidos.",
];

const VARIANTES_MENSAGEM_RISCO_ALTO = [
  "Embora existam alguns pontos que mereçam mais atenção neste momento, cada pequena mudança já representa um avanço importante para sua saúde. Não é preciso mudar tudo de uma vez: vamos priorizar o que fará mais diferença primeiro e evoluir um passo de cada vez.",
  "Sua avaliação trouxe alguns pontos que pedem atenção mais próxima agora — mas cada mudança, por menor que seja, já é um avanço real. Vamos focar primeiro no que trará mais impacto e seguir daí, um passo de cada vez.",
  "Existem alguns pontos importantes para cuidar neste momento, e isso é normal — o caminho não precisa ser percorrido de uma vez só. Vamos priorizar o que fizer mais diferença agora e avançar aos poucos a partir daí.",
  "Alguns fatores identificados aqui merecem atenção redobrada, mas nenhuma mudança precisa acontecer de uma vez. O plano é começar pelo que trará o maior impacto e seguir evoluindo com calma e consistência.",
  "Sua consulta trouxe alguns pontos que pedem mais cuidado agora — e cada avanço, mesmo pequeno, já conta bastante. Vamos priorizar o que fará mais diferença primeiro, sem pressa, um passo de cada vez.",
];

const VARIANTES_MENSAGEM_MODERADO_SEM_FORTES = [
  "Esse é só o começo: pequenas mudanças consistentes costumam gerar resultados muito maiores do que mudanças radicais. Vamos trabalhar juntos, um passo de cada vez, nos pontos que mais importam agora.",
  "Esse é o ponto de partida da sua jornada — mudanças pequenas e consistentes tendem a render resultados muito mais duradouros do que radicais. Vamos avançar juntos, priorizando o que mais importa primeiro.",
  "Esse momento marca o início — e o caminho mais eficaz costuma ser o de mudanças graduais e constantes, não o de cortes bruscos. Vamos seguir juntos, focando primeiro no que faz mais diferença.",
  "Esse é apenas o primeiro passo de um processo — e processos que funcionam de verdade costumam ser feitos de pequenas mudanças sustentadas, não de reviravoltas radicais. Vamos avançar juntos, com calma.",
  "Você está no começo dessa jornada, e é bom lembrar: mudanças pequenas e constantes tendem a durar muito mais do que mudanças drásticas. Vamos caminhar juntos, priorizando o que importa mais primeiro.",
];

const VARIANTES_MENSAGEM_MODERADO_COM_FORTES = [
  "Sua avaliação mostrou diversos pontos positivos e algumas oportunidades de melhoria. O mais importante é focar em mudanças graduais e consistentes, pois são elas que costumam trazer os resultados mais duradouros.",
  "Você já traz bons hábitos para essa consulta, junto com algumas oportunidades claras de melhoria. O foco agora é seguir com mudanças graduais e consistentes, que costumam ser as que realmente se sustentam ao longo do tempo.",
  "Sua avaliação combina pontos fortes reais com alguns pontos de melhoria — uma boa base para seguir em frente. Mudanças graduais e constantes tendem a trazer os resultados mais duradouros a partir daqui.",
  "Você chega com uma boa mistura de hábitos positivos e pontos a desenvolver. O caminho mais eficaz a partir daqui é seguir com ajustes graduais e consistentes, que costumam durar muito mais do que mudanças bruscas.",
  "Sua consulta mostrou tanto pontos fortes quanto oportunidades de melhoria — um ótimo ponto de partida. Mudanças graduais e mantidas ao longo do tempo tendem a trazer os resultados mais sólidos e duradouros.",
];

/** Nível de risco combinado dos pontos de atenção, usado só pra escolher o
 *  tom certo da mensagem final — "alto" quando há algo clinicamente sério
 *  (prioridade <= 4, ou seja condição de saúde relevante / mudança de peso
 *  não intencional) ou quando há muitos pontos acumulados de uma vez. */
function calcularNivelRisco(pontosAtencao: PontoAtencao[]): "nenhum" | "moderado" | "alto" {
  if (pontosAtencao.length === 0) return "nenhum";
  const temFatorGrave = pontosAtencao.some((p) => p.prioridade <= 4);
  if (temFatorGrave || pontosAtencao.length >= 4) return "alto";
  return "moderado";
}

function montarMensagemFinal(pontosFortes: string[], pontosAtencao: PontoAtencao[], numeroConsulta: number): string {
  const risco = calcularNivelRisco(pontosAtencao);

  if (risco === "nenhum") {
    return escolherVariante(VARIANTES_MENSAGEM_NENHUM_PONTO, "mensagem_nenhum", numeroConsulta);
  }
  if (risco === "alto") {
    return escolherVariante(VARIANTES_MENSAGEM_RISCO_ALTO, "mensagem_alto", numeroConsulta);
  }
  if (pontosFortes.length === 0) {
    return escolherVariante(VARIANTES_MENSAGEM_MODERADO_SEM_FORTES, "mensagem_moderado_sem_fortes", numeroConsulta);
  }
  return escolherVariante(VARIANTES_MENSAGEM_MODERADO_COM_FORTES, "mensagem_moderado_com_fortes", numeroConsulta);
}

const TEXTOS_IMC: Record<string, string[]> = {
  "Abaixo do peso": TEXTOS_IMC_BAIXO,
  "Peso normal": TEXTOS_IMC_NORMAL,
  "Sobrepeso": TEXTOS_IMC_SOBREPESO,
  "Obesidade grau I": TEXTOS_IMC_OBESIDADE_I,
  "Obesidade grau II": TEXTOS_IMC_OBESIDADE_II,
  "Obesidade grau III": TEXTOS_IMC_OBESIDADE_III,
};

const TEXTOS_OBJETIVO: Record<ObjetivoNutricional, string[]> = {
  emagrecimento: TEXTOS_OBJETIVO_EMAGRECIMENTO,
  manutencao: TEXTOS_OBJETIVO_MANUTENCAO,
  ganho_massa: TEXTOS_OBJETIVO_HIPERTROFIA,
  saude_geral: TEXTOS_OBJETIVO_SAUDE,
  performance_esportiva: TEXTOS_OBJETIVO_PERFORMANCE,
};

/**
 * Resumo geral — a abertura agora vem da Biblioteca Clínica Oficial
 * (Módulo 1 = IMC, Módulo 2 = Objetivo): um parágrafo de cada, escolhido por
 * rotação, no lugar da frase fixa "Após analisar suas respostas...". O
 * fechamento (meta calórica / aviso de segurança) continua igual.
 */
function montarResumoGeral(
  imc: number,
  classificacaoImc: string,
  objetivo: ObjetivoNutricional,
  metaCalorica: number,
  avisoSeguranca: string | null,
  numeroConsulta: number
): string {
  const variantesImc = TEXTOS_IMC[classificacaoImc] ?? TEXTOS_IMC_NORMAL;
  const textoImc = escolherVariante(variantesImc, "resumo_imc", numeroConsulta);
  const textoObjetivo = escolherVariante(TEXTOS_OBJETIVO[objetivo], "resumo_objetivo", numeroConsulta);
  const base = `${textoImc} ${textoObjetivo}`;
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
  /** Número sequencial da consulta do paciente (1ª, 2ª, 3ª...) — usado só
   *  pra rotacionar as variantes de texto e evitar repetição entre
   *  consultas. Se não vier informado, assume 1 (sempre a primeira opção de
   *  cada lista de variantes). */
  numeroConsulta?: number;
}): RelatorioConsulta {
  const numeroConsulta = params.numeroConsulta ?? 1;

  const pontosFortes = [
    elogiarSono(params.qualidadeSono, params.horasSono, params.insonia, numeroConsulta),
    elogiarHidratacao(params.ingestaoAguaCopos, params.aguaMl, numeroConsulta),
    elogiarAtividadeFisica(params.nivelAtividade, numeroConsulta),
    elogiarAlcool(params.consumoAlcool, numeroConsulta),
    elogiarTabagismo(params.tabagismo, numeroConsulta),
    elogiarEstresse(params.nivelEstresse, numeroConsulta),
    elogiarMastigacao(params.mastigacao, numeroConsulta),
    elogiarDisposicao(params.disposicaoManha, params.disposicaoTarde, params.disposicaoNoite, numeroConsulta),
    elogiarRotinaAlimentar(params.frequenciaRestaurante, numeroConsulta),
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
    numeroConsulta,
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
    numeroConsulta,
  });

  const pontosAtencao = [...condicoesSaude, ...habitosVida].sort((a, b) => a.prioridade - b.prioridade);

  return {
    imc: params.imc,
    classificacaoImc: params.classificacaoImc,
    tmb: params.tmb,
    tdee: params.tdee,
    metaCalorica: params.metaCalorica,
    resumoGeral: montarResumoGeral(
      params.imc,
      params.classificacaoImc,
      params.objetivo,
      params.metaCalorica,
      params.avisoSeguranca,
      numeroConsulta
    ),
    pontosFortes,
    pontosAtencao,
    condicoesSaude,
    habitosVida,
    alimentacao: montarAlimentacao({
      restricoesAlimentares: params.restricoesAlimentares,
      historicoDietetico: params.historicoDietetico,
      dietaAnterior: params.dietaAnterior,
      numeroConsulta,
    }),
    prioridades: montarPrioridades(pontosAtencao),
    mensagemFinal: montarMensagemFinal(pontosFortes, pontosAtencao, numeroConsulta),
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
    // Número sequencial da consulta do paciente (1ª, 2ª, 3ª...) — usado só
    // pra rotacionar as variantes de texto do relatório e evitar repetição
    // entre consultas. Opcional: se não vier, o relatório usa a 1ª variante
    // de cada situação.
    numeroConsulta?: number;
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
    numeroConsulta: dados.numeroConsulta,
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
