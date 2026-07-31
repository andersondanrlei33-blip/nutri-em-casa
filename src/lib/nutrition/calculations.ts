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

import type { AvaliacaoFisicaExtraida, CondicaoSaude, ConsumoAlcool, Genero, NivelAtividade, ObjetivoNutricional, StatusTabagismo, PontoAtencao, RelatorioConsulta } from "../../types/domain.ts";
import { normalizar } from "./receitaMatching.ts";
import { avaliarComposicaoCorporal } from "./avaliacaoFisica.ts";

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

// ---------------------------------------------------------------------------
// Elogios (pontos fortes) — cada função representa UMA situação e retorna
// null quando ela não se aplica ao paciente. As variantes ficam num array
// logo acima de cada função, pra facilitar adicionar mais no futuro.
// ---------------------------------------------------------------------------

const VARIANTES_ELOGIO_SONO = [
  "Seu sono é um dos seus maiores aliados agora: dormir bem favorece a recuperação do organismo, melhora o controle do apetite e contribui tanto para o emagrecimento quanto para o ganho de massa muscular.",
  "Você está com uma rotina de sono muito boa, e isso vale mais do que parece: é durante o sono que o corpo repara os músculos, equilibra os hormônios da fome e recarrega a energia para o dia seguinte.",
  "Dormir bem como você tem feito é um dos pilares mais subestimados da saúde — ajuda o corpo a controlar melhor a fome, melhora o humor e potencializa qualquer esforço que você fizer na alimentação.",
  "Seu padrão de sono está muito bom, e isso é uma base estrutural real: sono de qualidade regula os hormônios que controlam a fome e a saciedade, então ele já está jogando a seu favor sem você nem perceber.",
  "Parabéns pela qualidade do seu sono — ela influencia diretamente sua disposição, seu humor e até a forma como seu corpo usa a energia dos alimentos, então esse hábito merece ser mantido com carinho.",
];

const VARIANTES_ELOGIO_HIDRATACAO = [
  "Sua hidratação está muito boa — beber água na quantidade certa ajuda até no controle do apetite e no desempenho físico, então vale muito continuar assim.",
  "Você está bem hidratado, e isso impacta mais coisas do que parece: digestão, disposição, pele, concentração e até a sensação de fome dependem de uma boa hidratação — ótimo hábito para manter.",
  "Sua ingestão de água está no ponto certo. É um hábito simples, mas que sustenta praticamente todas as funções do corpo, da digestão ao desempenho físico — vale a pena manter essa consistência.",
  "Você já bebe a quantidade de água recomendada, o que ajuda o corpo a funcionar melhor em praticamente tudo — do metabolismo à sensação de energia ao longo do dia. Continue assim.",
  "Sua hidratação está em dia, e isso conta bastante a seu favor: além de ajudar no desempenho físico, beber água o suficiente também ajuda a diferenciar fome de sede, o que facilita o controle da alimentação.",
];

const VARIANTES_ELOGIO_ATIVIDADE_FISICA = [
  "Seu nível de atividade física já é um excelente ponto de partida — agora o foco é potencializar esse esforço através da alimentação certa.",
  "Você já mantém uma rotina de atividade física consistente, o que é ótimo: isso ajuda a preservar massa muscular, melhora a sensibilidade à insulina e faz a alimentação render ainda mais.",
  "Seu nível de atividade física está muito bom — esse é um dos fatores que mais influenciam a composição corporal a longo prazo, então você já está no caminho certo.",
  "Manter-se ativo como você já faz é um dos hábitos mais poderosos para a saúde metabólica em geral — agora é só alinhar a alimentação para aproveitar ainda mais esse esforço.",
  "Sua rotina de atividade física já está em um bom nível, o que facilita bastante o alcance do seu objetivo — o corpo responde melhor à dieta quando já está em movimento com regularidade.",
];

const VARIANTES_ELOGIO_ALCOOL = [
  "O fato de você não consumir bebidas alcoólicas também é uma vantagem importante: além de evitar calorias extras, isso favorece a recuperação do organismo e melhora a qualidade do sono.",
  "Não beber é um hábito que traz benefícios silenciosos: menos calorias líquidas, sono de melhor qualidade e uma recuperação muscular mais eficiente — tudo trabalhando a seu favor.",
  "Manter-se longe do álcool ajuda bastante o seu objetivo, mesmo sem você perceber diretamente: o corpo recupera melhor, o sono fica mais estável e não sobram calorias soltas à toa no seu dia.",
  "Você não consome álcool, o que é ótimo — isso evita um dos fatores que mais atrapalham o sono e a recuperação do corpo sem que a pessoa perceba a relação.",
  "Ficar longe do álcool é uma escolha que rende bons frutos: melhora a qualidade do sono, ajuda na recuperação muscular e evita calorias que não contam para nada no seu plano.",
];

const VARIANTES_ELOGIO_TABAGISMO_NUNCA = [
  "Não fumar é extremamente positivo para sua saúde cardiovascular e metabólica — um dos hábitos que mais protege seu coração a longo prazo.",
  "O fato de você nunca ter fumado é uma vantagem e tanto: reduz bastante o risco cardiovascular e ajuda o corpo a usar oxigênio com mais eficiência durante os exercícios.",
  "Nunca ter fumado é um dos maiores fatores de proteção à saúde que existem — impacta o coração, os pulmões e até a forma como o corpo se recupera do esforço físico.",
  "Manter-se longe do cigarro é uma das decisões mais impactantes para a saúde a longo prazo — protege o coração, os pulmões e a capacidade física de forma geral.",
  "Você nunca fumou, o que é excelente: isso preserva sua capacidade respiratória e cardiovascular, dois fatores que fazem bastante diferença tanto na saúde quanto no desempenho físico.",
];

const VARIANTES_ELOGIO_TABAGISMO_EX = [
  "Ter parado de fumar já é uma conquista enorme para sua saúde cardiovascular — seu corpo agradece esse esforço todos os dias.",
  "Parar de fumar é uma das mudanças mais impactantes que alguém pode fazer pela própria saúde — o corpo começa a se recuperar já nas primeiras semanas, e esse benefício só cresce com o tempo.",
  "O fato de ter deixado o cigarro para trás é motivo de orgulho: sua capacidade cardiovascular e respiratória vem melhorando desde então, mesmo que de forma gradual.",
  "Ter conseguido parar de fumar mostra um comprometimento real com a própria saúde — e os benefícios continuam se acumulando quanto mais tempo passa.",
  "Deixar o cigarro foi uma decisão que já está trazendo retorno para sua saúde cardiovascular e pulmonar, mesmo que os efeitos completos apareçam aos poucos.",
];

const VARIANTES_ELOGIO_ESTRESSE = [
  "Seu nível de estresse está bem controlado, e isso é uma vantagem real: estresse crônico costuma dificultar tanto o emagrecimento quanto o ganho de massa, então esse equilíbrio já está jogando a seu favor.",
  "Manter o estresse sob controle como você faz ajuda mais do que parece: cortisol elevado por muito tempo atrapalha o sono, aumenta a fome por alimentos calóricos e dificulta os resultados — você já está à frente nesse ponto.",
  "Seu equilíbrio emocional está bom, e isso conta bastante: o corpo responde melhor à alimentação e ao treino quando o estresse está sob controle.",
  "Você está lidando bem com o estresse do dia a dia, o que é um fator protetor importante — níveis altos de estresse costumam sabotar até os melhores planos alimentares.",
  "Seu nível de estresse controlado é um ponto a seu favor que passa despercebido: ele influencia diretamente o apetite, o sono e a forma como o corpo estoca gordura.",
];

const VARIANTES_ELOGIO_MASTIGACAO = [
  "Você já mastiga com calma e atenção — isso ajuda bastante o cérebro a reconhecer o sinal de saciedade na hora certa, um detalhe pequeno que faz diferença.",
  "Sua forma de comer com calma é um hábito valioso: dá tempo do corpo perceber a saciedade, o que naturalmente ajuda a comer as quantidades certas sem esforço.",
  "Mastigar com atenção como você faz é um daqueles hábitos simples com grande impacto — melhora a digestão e ajuda a evitar exageros nas porções.",
  "Comer devagar e com atenção, como você já faz, é uma vantagem real: o cérebro precisa de tempo para registrar que o corpo está satisfeito, e você já dá esse tempo a ele.",
  "Sua relação tranquila com a comida na hora de mastigar ajuda o processo digestivo inteiro e facilita o reconhecimento da saciedade — vale muito manter.",
];

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

function elogiarSono(qualidadeSono: number | null, horasSono: string | null | undefined, insonia: boolean, numeroConsulta: number): string | null {
  const duracaoBoa = horasSono === "6 a 8 horas" || horasSono === "> 8 horas";
  const qualidadeBoa = qualidadeSono != null && qualidadeSono >= 4;
  if (!duracaoBoa || !qualidadeBoa || insonia) return null;
  return escolherVariante(VARIANTES_ELOGIO_SONO, "elogio_sono", numeroConsulta);
}

function elogiarHidratacao(ingestaoAguaCopos: string | null | undefined, metaAguaMl: number, numeroConsulta: number): string | null {
  const copos = ingestaoAguaCopos != null ? parseInt(ingestaoAguaCopos, 10) : NaN;
  if (Number.isNaN(copos)) return null;
  if (copos * 250 < metaAguaMl) return null;
  return escolherVariante(VARIANTES_ELOGIO_HIDRATACAO, "elogio_hidratacao", numeroConsulta);
}

function elogiarAtividadeFisica(nivelAtividade: NivelAtividade, numeroConsulta: number): string | null {
  if (nivelAtividade === "sedentario" || nivelAtividade === "leve") return null;
  return escolherVariante(VARIANTES_ELOGIO_ATIVIDADE_FISICA, "elogio_atividade", numeroConsulta);
}

function elogiarAlcool(consumo: ConsumoAlcool, numeroConsulta: number): string | null {
  if (consumo !== "nunca") return null;
  return escolherVariante(VARIANTES_ELOGIO_ALCOOL, "elogio_alcool", numeroConsulta);
}

function elogiarTabagismo(status: StatusTabagismo, numeroConsulta: number): string | null {
  if (status === "nunca") return escolherVariante(VARIANTES_ELOGIO_TABAGISMO_NUNCA, "elogio_tabagismo_nunca", numeroConsulta);
  if (status === "ex_fumante") return escolherVariante(VARIANTES_ELOGIO_TABAGISMO_EX, "elogio_tabagismo_ex", numeroConsulta);
  return null;
}

function elogiarEstresse(nivelEstresse: number | null, numeroConsulta: number): string | null {
  if (nivelEstresse == null || nivelEstresse > 2) return null;
  return escolherVariante(VARIANTES_ELOGIO_ESTRESSE, "elogio_estresse", numeroConsulta);
}

function elogiarMastigacao(mastigacao: string | null | undefined, numeroConsulta: number): string | null {
  if (mastigacao !== "Normal, aprecio a comida com atenção plena.") return null;
  return escolherVariante(VARIANTES_ELOGIO_MASTIGACAO, "elogio_mastigacao", numeroConsulta);
}

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

function descreverHorasSono(horasSono: string): string {
  if (horasSono === "< 4 horas") return "menos de 4 horas";
  if (horasSono === "4 a 6 horas") return "entre 4 e 6 horas";
  return horasSono;
}

const VARIANTES_SEDENTARISMO = [
  "Seu nível de atividade física ainda está baixo para o seu objetivo. A recomendação é de 150 a 300 minutos por semana de atividade moderada (ou 75-150 minutos intensa), mais fortalecimento muscular 2x ou mais por semana — aumentar isso aos poucos tende a acelerar bastante o resultado, junto com a alimentação.",
  "Sua rotina de atividade física ainda está aquém do ideal para o seu objetivo — a meta é de 150 a 300 minutos semanais de atividade moderada, com fortalecimento muscular pelo menos 2x por semana. Começar aos poucos já faz diferença real nos resultados.",
  "Aumentar gradualmente sua atividade física vai potencializar bastante os resultados da alimentação — o ideal é buscar entre 150 e 300 minutos semanais de atividade moderada, incluindo fortalecimento muscular ao menos 2x por semana.",
  "Seu nível de atividade ainda pode evoluir bastante para o seu objetivo — a referência é de 150 a 300 minutos semanais de atividade moderada mais fortalecimento muscular 2x ou mais por semana, e cada passo nessa direção já ajuda.",
  "Incluir mais movimento na sua rotina vai acelerar bastante seus resultados — a meta recomendada é de 150 a 300 minutos semanais de atividade moderada, com fortalecimento muscular pelo menos 2x por semana, começando no ritmo que for possível.",
];

function variantesAgua(litrosMeta: string, litrosFaltando: string): string[] {
  return [
    `Sua recomendação diária é de aproximadamente ${litrosMeta} litros. Pela sua resposta, ainda faltam cerca de ${litrosFaltando} litro por dia para chegar lá. Uma boa estratégia é distribuir esse volume ao longo do dia, mantendo sempre uma garrafa por perto — uma boa hidratação favorece o funcionamento do organismo, melhora o desempenho físico e ajuda até na recuperação muscular.`,
    `Notamos que sua ingestão de água está um pouco abaixo do ideal: a meta é por volta de ${litrosMeta} litros por dia, e faltam cerca de ${litrosFaltando} litro na sua rotina atual. Associar cada copo a um momento fixo do dia (ao acordar, antes das refeições) costuma ajudar bastante a criar o hábito.`,
    `Sua meta de hidratação é de aproximadamente ${litrosMeta} litros por dia, e ainda faltam cerca de ${litrosFaltando} litro pra chegar lá. Aumentar aos poucos, com uma garrafa sempre à vista, tende a funcionar melhor do que tentar mudar tudo de uma vez.`,
    `Você está bebendo menos água do que o recomendado — a meta gira em torno de ${litrosMeta} litros por dia, faltando cerca de ${litrosFaltando} litro. Beber um copo a cada intervalo fixo do dia é uma forma simples de fechar essa diferença aos poucos.`,
    `Sua ingestão de água está abaixo da meta de aproximadamente ${litrosMeta} litros por dia — faltam cerca de ${litrosFaltando} litro. Água em quantidade adequada ajuda o corpo em praticamente tudo, do metabolismo à disposição, então vale a pena priorizar esse ajuste.`,
  ];
}

const VARIANTES_INSONIA = [
  "Você relatou insônia, e isso interfere bastante no apetite e na composição corporal — vale a pena investigar isso com um profissional se persistir, além de tentar manter horários de sono mais regulares.",
  "A insônia que você relatou merece atenção: ela afeta diretamente o apetite e a forma como o corpo lida com a composição corporal — se persistir, vale conversar com um profissional, além de tentar manter horários de sono mais fixos.",
  "Insônia costuma ter um impacto maior do que parece no apetite e no metabolismo — vale tentar fixar horários de sono mais regulares, e buscar apoio profissional se o quadro continuar.",
  "Como você relatou insônia, vale reforçar: ela mexe bastante com o apetite e a composição corporal ao longo do tempo — manter uma rotina de sono mais regular ajuda, e um profissional pode ser útil se persistir.",
  "A insônia relatada é um ponto que merece cuidado — além de afetar o apetite, ela dificulta a recuperação do corpo como um todo. Regularizar os horários de sono é um bom primeiro passo, com apoio profissional se necessário.",
];

function variantesSonoRuim(trechoHoras: string): string[] {
  const sufixo =
    "A referência para adultos é de 7 a 9 horas por noite, com boa qualidade — dormir menos do que isso costuma " +
    "aumentar a fome, reduzir a disposição ao longo do dia e dificultar tanto o emagrecimento quanto o ganho de " +
    "massa muscular. Melhorar gradualmente a duração e a qualidade do sono pode trazer benefícios tão importantes " +
    "quanto um ajuste na dieta.";
  return [
    `${trechoHoras}${sufixo}`,
    `${trechoHoras}Adultos costumam precisar de 7 a 9 horas de sono por noite para uma boa recuperação — dormir menos que isso tende a aumentar a fome ao longo do dia e deixar a disposição mais baixa. Melhorar o sono aos poucos pode fazer tanta diferença quanto um ajuste na alimentação.`,
    `${trechoHoras}Dormir menos do que as 7 a 9 horas recomendadas costuma mexer com os hormônios que controlam a fome e a saciedade, além de reduzir a energia disponível para o dia. Priorizar o sono, mesmo aos poucos, tende a potencializar os resultados da alimentação.`,
    `${trechoHoras}O sono insuficiente é um dos fatores que mais passam despercebidos no processo — ele afeta o apetite, a disposição e até a recuperação muscular. Buscar chegar perto das 7 a 9 horas recomendadas pode ser tão importante quanto qualquer ajuste na dieta.`,
    `${trechoHoras}Dormir bem (7 a 9 horas, com boa qualidade) é uma das bases mais importantes para qualquer objetivo — sono insuficiente aumenta a fome e reduz a disposição. Ir ajustando aos poucos a rotina de sono pode acelerar bastante seus resultados.`,
  ];
}

const VARIANTES_ESTRESSE = [
  "Seu nível de estresse está alto, e isso conta mais do que parece: o estresse crônico eleva o cortisol e pode dificultar tanto o emagrecimento quanto o ganho de massa. Vale cuidar disso em paralelo com a alimentação — mesmo pequenas pausas ao longo do dia já ajudam.",
  "Seu nível de estresse merece atenção. Quando ele permanece elevado por muito tempo, pode influenciar o apetite, aumentar a vontade de consumir alimentos mais calóricos e dificultar o alcance dos seus objetivos. Além da alimentação, vale a pena buscar estratégias que ajudem a tornar sua rotina mais leve.",
  "Seu estresse está em um nível alto, e isso tem um peso real nos resultados: o cortisol elevado por tempo prolongado interfere no apetite e na forma como o corpo estoca energia. Pequenas pausas ao longo do dia já ajudam a aliviar essa pressão.",
  "O estresse elevado que você relatou merece cuidado — ele influencia diretamente o apetite, o sono e até a forma como o corpo reage à alimentação. Buscar formas de aliviar a rotina, mesmo que pequenas, pode fazer bastante diferença nos resultados.",
  "Seu nível de estresse está alto, e vale a pena tratar isso como parte do plano, não como algo à parte: estresse crônico dificulta tanto o emagrecimento quanto o ganho de massa. Pequenos momentos de pausa ao longo do dia já ajudam a equilibrar isso.",
];

function variantesAlcoolFrequente(dicaReducao: string): string[] {
  return [
    `Seu consumo frequente de bebidas alcoólicas merece um pouco de atenção. Além das calorias extras, o álcool pode interferir na qualidade do sono, na recuperação muscular, aumentar o apetite e dificultar o controle do peso. Isso não significa que você precise deixar de consumir completamente, mas reduzir a frequência já costuma trazer benefícios importantes.${dicaReducao}`,
    `O consumo frequente de álcool que você relatou vale a pena repensar aos poucos — além das calorias extras que não entram no cálculo do plano, ele afeta a qualidade do sono e a recuperação do corpo. Reduzir gradualmente a frequência já traz ganhos importantes, sem precisar cortar de vez.${dicaReducao}`,
    `Beber com frequência tem um impacto que vai além das calorias: interfere no sono, na recuperação muscular e pode aumentar o apetite nos dias seguintes. Não é sobre eliminar completamente, mas reduzir aos poucos a frequência já costuma render bons resultados.${dicaReducao}`,
    `Seu consumo de álcool está frequente, e isso merece atenção — ele afeta o sono, a recuperação do corpo e pode dificultar o controle do peso a médio prazo. Diminuir a frequência gradualmente já traz benefícios reais, sem precisar de mudanças radicais.${dicaReducao}`,
    `A frequência atual do seu consumo de álcool é um ponto que vale a pena rever — além das calorias extras, ele pode atrapalhar o sono e a recuperação muscular. Reduzir aos poucos já costuma trazer resultados perceptíveis.${dicaReducao}`,
  ];
}

function variantesAlcoolModerado(dicaReducao: string): string[] {
  return [
    `Seu consumo de bebidas alcoólicas é moderado, o que já é um bom equilíbrio. Ainda assim vale lembrar que o álcool tem calorias que não entram no cálculo do seu plano e pode interferir um pouco na qualidade do sono e na recuperação — reduzir mais ainda a frequência tende a trazer ganhos extras.${dicaReducao}`,
    `Seu consumo de álcool está num nível moderado, o que já é positivo. Mesmo assim, vale lembrar que ele carrega calorias que não entram no cálculo do plano e pode afetar um pouco o sono — reduzir ainda mais, se fizer sentido para você, tende a trazer ganhos extras.${dicaReducao}`,
    `Beber com moderação como você faz já é um bom equilíbrio. Vale só lembrar que o álcool soma calorias fora do plano e pode interferir levemente na qualidade do sono — qualquer redução extra tende a somar pontos a mais no resultado.${dicaReducao}`,
    `Seu padrão de consumo de álcool é moderado, o que é positivo — ainda assim, essas calorias não entram no cálculo do plano e podem afetar um pouco a recuperação do sono. Reduzir mais, se possível, tende a ajudar ainda mais.${dicaReducao}`,
    `O consumo moderado de álcool que você relatou já indica um bom equilíbrio. Vale lembrar que essas calorias ficam de fora do cálculo do plano e podem interferir levemente no sono — qualquer redução adicional só tende a somar a favor do resultado.${dicaReducao}`,
  ];
}

const VARIANTES_TABAGISMO_FUMANTE = [
  "Fumar aumenta a necessidade de vitamina C pelo estresse oxidativo do cigarro — vale incluir mais frutas cítricas, acerola, goiaba e vegetais crus na rotina. E se um dia fizer sentido buscar apoio para parar, isso teria um impacto na sua saúde maior do que qualquer ajuste na dieta.",
  "O cigarro aumenta o estresse oxidativo do corpo, o que eleva a necessidade de vitamina C — vale reforçar frutas cítricas, acerola, goiaba e vegetais crus na alimentação. Se em algum momento fizer sentido buscar apoio para parar, esse seria o ajuste com maior impacto na sua saúde.",
  "Fumar exige mais vitamina C do corpo por causa do estresse oxidativo do cigarro — incluir frutas cítricas, acerola, goiaba e vegetais crus ajuda a compensar um pouco isso. Parar de fumar, quando fizer sentido para você, continua sendo a mudança de maior impacto possível.",
  "O tabagismo eleva bastante a necessidade de vitamina C no organismo — vale reforçar fontes como frutas cítricas, acerola, goiaba e vegetais crus. Se buscar apoio para parar fizer sentido no seu momento, seria o passo com maior retorno para sua saúde.",
  "Fumar aumenta o desgaste oxidativo do corpo, então a necessidade de vitamina C sobe — frutas cítricas, acerola, goiaba e vegetais crus ajudam nesse sentido. De todas as mudanças possíveis, parar de fumar seria a de maior impacto na sua saúde geral.",
];

const VARIANTES_DELIVERY = [
  "Percebemos que boa parte das suas refeições acontece através de restaurante, bar ou delivery. Isso é muito comum na rotina atual e não precisa ser um problema — o mais importante é fazer escolhas mais equilibradas nesses momentos, priorizando grelhados, legumes e saladas, e reduzindo bebidas açucaradas.",
  "Boa parte das suas refeições vem de restaurante ou delivery, o que é bem comum hoje em dia — o segredo está em escolher melhor nesses momentos: grelhados, saladas e legumes tendem a ser opções mais equilibradas do que frituras e refrigerantes.",
  "Comer fora ou pedir delivery com frequência é a realidade de muita gente — o que mais ajuda é escolher com um pouco mais de atenção nesses momentos, priorizando grelhados e vegetais e evitando bebidas açucaradas.",
  "Sua rotina inclui bastante restaurante e delivery, o que não precisa ser encarado como um problema — pequenas escolhas mais conscientes nesses momentos, como preferir grelhados e saladas, já fazem bastante diferença.",
  "Você depende bastante de restaurante ou delivery no dia a dia, algo cada vez mais comum — o foco não precisa ser eliminar isso, mas escolher melhor: grelhados, legumes e saladas no lugar de frituras e bebidas açucaradas.",
];

const VARIANTES_MASTIGACAO_RAPIDA = [
  "Sua mastigação acontece de forma bastante rápida. Comer com mais calma pode ajudar o organismo a reconhecer melhor a saciedade, reduzindo a chance de exagerar nas quantidades e tornando as refeições mais prazerosas — o corpo leva de 15 a 20 minutos para sentir esse sinal.",
  "Você relatou que come rápido, e vale a pena desacelerar um pouco: o cérebro leva de 15 a 20 minutos para reconhecer a saciedade, então comer mais devagar ajuda naturalmente a comer as quantidades certas.",
  "Comer rápido, como você relatou, costuma dificultar o reconhecimento da saciedade — o corpo precisa de 15 a 20 minutos pra perceber que já está satisfeito. Tentar pausar entre garfadas pode ajudar bastante nisso.",
  "Sua velocidade ao comer está bem acelerada — como o cérebro leva de 15 a 20 minutos para registrar a saciedade, ir mais devagar tende a ajudar a comer as porções certas sem esforço extra.",
  "Comer rápido demais tende a atrapalhar o reconhecimento da saciedade, que leva de 15 a 20 minutos para acontecer. Pausar um pouco entre as garfadas pode tornar as refeições mais agradáveis e ajudar a comer as quantidades certas.",
];

const VARIANTES_ROTINA_TRABALHO = [
  "Sua rotina parece incluir turno noturno ou horários irregulares, o que está associado a mais risco metabólico. Manter horários de refeição o mais fixos possível dentro da sua escala ajuda bastante, mesmo que não sejam horários 'convencionais'.",
  "Trabalhar em turnos ou horários irregulares, como parece ser o seu caso, está associado a mais risco metabólico — manter horários de refeição fixos dentro da sua própria escala ajuda bastante a reduzir esse impacto.",
  "Sua rotina de trabalho parece incluir horários fora do padrão, o que pode mexer com o metabolismo — fixar horários de refeição dentro da sua escala específica, mesmo que não convencionais, ajuda o corpo a se organizar melhor.",
  "Rotinas de trabalho noturnas ou em turnos, como a sua, pedem atenção extra ao metabolismo — manter uma rotina fixa de horários de refeição, adaptada à sua escala, é uma das formas mais eficazes de reduzir esse impacto.",
  "Sua escala de trabalho parece incluir horários irregulares, o que tende a mexer mais com o metabolismo — o quanto antes você conseguir fixar horários de refeição dentro dessa rotina, melhor o corpo se adapta.",
];

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

  if (params.objetivo === "emagrecimento" && (params.nivelAtividade === "sedentario" || params.nivelAtividade === "leve")) {
    blocos.push({
      chave: "sedentarismo",
      titulo: "Atividade física",
      prioridade: 7,
      categoria: "habito_vida",
      texto: escolherVariante(VARIANTES_SEDENTARISMO, "sedentarismo", params.numeroConsulta),
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
        texto: escolherVariante(
          variantesAgua((params.aguaMl / 1000).toFixed(1), litrosFaltando.toFixed(1)),
          "agua",
          params.numeroConsulta
        ),
      });
    }
  }

  const duracaoRuim = params.horasSono === "< 4 horas" || params.horasSono === "4 a 6 horas";
  const qualidadeRuim = params.qualidadeSono != null && params.qualidadeSono <= 2;
  if (duracaoRuim || qualidadeRuim || params.insonia) {
    const trechoHoras = params.horasSono ? `Você relatou dormir ${descreverHorasSono(params.horasSono)} por noite. ` : "";
    blocos.push({
      chave: "sono",
      titulo: "Sono",
      prioridade: 9,
      categoria: "habito_vida",
      texto: params.insonia
        ? escolherVariante(VARIANTES_INSONIA, "sono_insonia", params.numeroConsulta)
        : escolherVariante(variantesSonoRuim(trechoHoras), "sono_ruim", params.numeroConsulta),
    });
  }

  if (params.nivelEstresse != null && params.nivelEstresse >= 4) {
    blocos.push({
      chave: "estresse",
      titulo: "Estresse",
      prioridade: 10,
      categoria: "habito_vida",
      texto: escolherVariante(VARIANTES_ESTRESSE, "estresse", params.numeroConsulta),
    });
  }

  if (params.consumoAlcool === "moderado" || params.consumoAlcool === "frequente") {
    const dicaReducao =
      params.objetivo === "emagrecimento"
        ? " Se for continuar bebendo, evitar misturadores açucarados e petiscos salgados já reduz bastante o impacto."
        : "";
    blocos.push({
      chave: "alcool",
      titulo: "Álcool",
      prioridade: 11,
      categoria: "habito_vida",
      texto:
        params.consumoAlcool === "frequente"
          ? escolherVariante(variantesAlcoolFrequente(dicaReducao), "alcool_frequente", params.numeroConsulta)
          : escolherVariante(variantesAlcoolModerado(dicaReducao), "alcool_moderado", params.numeroConsulta),
    });
  }

  if (params.tabagismo === "fumante") {
    blocos.push({
      chave: "tabagismo",
      titulo: "Tabagismo",
      prioridade: 11,
      categoria: "habito_vida",
      texto: escolherVariante(VARIANTES_TABAGISMO_FUMANTE, "tabagismo_fumante", params.numeroConsulta),
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
      texto: escolherVariante(VARIANTES_MASTIGACAO_RAPIDA, "mastigacao", params.numeroConsulta),
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

const VARIANTES_RESUMO_ABERTURA = [
  "Após analisar suas respostas, ",
  "Com base em tudo que você respondeu, ",
  "Analisando o conjunto das suas respostas, ",
  "A partir da sua avaliação, ",
];

const VARIANTES_RESUMO_IMC_ACOLHIMENTO = [
  "Esse é apenas um dos indicadores usados na avaliação e não define sozinho seu estado de saúde — considerando seus hábitos e seu objetivo, ",
  "Esse número é só um entre vários indicadores que olhamos na consulta, e não conta a história toda sozinho — considerando seus hábitos e seu objetivo, ",
  "Vale lembrar que esse é apenas um indicador entre outros, e não define seu estado de saúde isoladamente — levando em conta seus hábitos e objetivo, ",
  "Esse dado é só uma parte do quadro geral avaliado na consulta, não a história completa — considerando seus hábitos e o que você busca, ",
];

function montarResumoGeral(
  imc: number,
  classificacaoImc: string,
  objetivo: ObjetivoNutricional,
  metaCalorica: number,
  avisoSeguranca: string | null,
  numeroConsulta: number
): string {
  // Só a primeira letra vira minúscula (a frase começa no meio: "...está na
  // faixa de X") — preserva o algarismo romano em "Obesidade grau II/III".
  const classificacaoLower = classificacaoImc.charAt(0).toLowerCase() + classificacaoImc.slice(1);
  const objetivoTexto = OBJETIVO_TEXTO[objetivo];
  const abertura = escolherVariante(VARIANTES_RESUMO_ABERTURA, "resumo_abertura", numeroConsulta);
  const base =
    classificacaoImc === "Peso normal"
      ? `${abertura}seu IMC está na faixa de ${classificacaoLower} e o foco a partir de agora vai ser ${objetivoTexto}.`
      : `${abertura}seu IMC está na faixa de ${classificacaoLower}. ` +
        `${escolherVariante(VARIANTES_RESUMO_IMC_ACOLHIMENTO, "resumo_imc_acolhimento", numeroConsulta)}` +
        `o foco a partir de agora vai ser ${objetivoTexto}.`;
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
  /** Gênero do paciente — só usado pra classificar o % de gordura da
   *  avaliação física (as faixas de referência são diferentes por gênero). */
  genero: Genero;
  /** Dados extraídos da avaliação física anexada nessa consulta, quando
   *  houver — ver AvaliacaoFisicaExtraida. Null/undefined quando não há
   *  anexo ou a extração falhou. */
  avaliacaoFisicaDados?: AvaliacaoFisicaExtraida | null;
  /** Texto de interpretação já pronto, gerado pelo motor de interpretação
   *  (lib/avaliacaoFisica/) ANTES desta chamada — calculations.ts é
   *  deliberadamente síncrono/puro (sem I/O), então quem chama esta função
   *  (route.ts) já resolveu a parte assíncrona (que envolve a Biblioteca
   *  Clínica) e só passa o resultado pronto pra cá. Null/undefined quando
   *  não há avaliação física, ou o motor não gerou nada aproveitável. */
  avaliacaoFisicaTextoMotor?: string | null;
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
    composicaoCorporal: avaliarComposicaoCorporal(
      params.avaliacaoFisicaDados ?? null,
      params.classificacaoImc,
      params.genero,
      params.avaliacaoFisicaTextoMotor ?? null
    ),
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
    // Dados extraídos por IA da avaliação física anexada nessa consulta,
    // quando houver (ver lib/nutrition/avaliacaoFisica.ts). Opcional/null
    // quando não há anexo ou a extração falhou.
    avaliacaoFisicaDados?: AvaliacaoFisicaExtraida | null;
    // Texto de interpretação já pronto vindo do motor novo (lib/avaliacaoFisica/),
    // calculado de forma assíncrona em route.ts antes desta chamada — ver
    // comentário em montarRelatorioConsulta.
    avaliacaoFisicaTextoMotor?: string | null;
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
    genero: dados.genero,
    avaliacaoFisicaDados: dados.avaliacaoFisicaDados,
    avaliacaoFisicaTextoMotor: dados.avaliacaoFisicaTextoMotor,
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
