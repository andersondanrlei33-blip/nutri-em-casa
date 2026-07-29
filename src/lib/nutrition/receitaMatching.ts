/**
 * Filtro de receitas por alergia/restrição alimentar.
 *
 * Por que isso existe: alergia é informação de segurança, não deveria
 * depender só de um modelo de IA "seguir a instrução" num prompt. Aqui a
 * exclusão é feita em código, contra tags estruturadas (`alergenos` e
 * `dietas_atendidas`) gravadas em cada receita — determinístico e testável.
 */
import type { AvaliacaoNutricional, CategoriaReceita, CondicaoSaude, IndicacaoSaudeReceita, Receita } from "@/types/domain";

/** Vocabulário fechado de alérgenos reconhecidos. */
const MAPA_ALERGENOS: Record<string, string> = {
  amendoim: "amendoim",
  leite: "lactose",
  lactose: "lactose",
  laticinio: "lactose",
  laticinios: "lactose",
  gluten: "gluten",
  trigo: "gluten",
  ovo: "ovo",
  ovos: "ovo",
  castanha: "castanhas",
  castanhas: "castanhas",
  noz: "castanhas",
  nozes: "castanhas",
  amendoa: "castanhas",
  amendoas: "castanhas",
  peixe: "peixe",
  camarao: "frutos_do_mar",
  marisco: "frutos_do_mar",
  "frutos do mar": "frutos_do_mar",
  soja: "soja",
};

/** Vocabulário fechado de dietas/restrições reconhecidas. */
const MAPA_DIETAS: Record<string, string> = {
  vegetariano: "vegetariano",
  vegetariana: "vegetariano",
  vegano: "vegano",
  vegana: "vegano",
  "sem gluten": "sem_gluten",
  "sem glúten": "sem_gluten",
  celiaco: "sem_gluten",
  celíaco: "sem_gluten",
  "sem lactose": "sem_lactose",
  "intolerante a lactose": "sem_lactose",
  "intolerante à lactose": "sem_lactose",
};

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[̀-ͯ]", "g"), "")
    .trim();
}

function extrairTags(itens: string[], mapa: Record<string, string>): Set<string> {
  const normalizados = itens.map(normalizar);
  const tags = new Set<string>();
  for (const [chave, tag] of Object.entries(mapa)) {
    const chaveNorm = normalizar(chave);
    if (normalizados.some((item) => item.includes(chaveNorm))) tags.add(tag);
  }
  return tags;
}

/** Vocabulário fechado completo de indicações de receita — usado tanto pra
 *  validar o que a IA pode escolher pra "outra condição" quanto pra montar
 *  o filtro a partir das condições de saúde estruturadas abaixo. */
export const INDICACOES_SAUDE_VOCABULARIO: IndicacaoSaudeReceita[] = [
  "baixo_sodio",
  "baixo_indice_glicemico",
  "baixo_colesterol",
  "controle_renal",
  "alta_fibra",
];

/** Mapeia cada condição de saúde estruturada pra indicação(ões) de receita
 *  correspondente(s) — sinal de PRIORIDADE (nunca bloqueio duro, diferente
 *  de alergia): se não houver receita com a tag, ainda mostramos as outras
 *  seguras, só sem o bônus de prioridade. */
const MAPA_CONDICAO_INDICACAO: Record<CondicaoSaude, IndicacaoSaudeReceita[]> = {
  diabetes_tipo1: ["baixo_indice_glicemico"],
  diabetes_tipo2: ["baixo_indice_glicemico"],
  hipertensao: ["baixo_sodio"],
  doenca_renal: ["controle_renal"],
  hipotireoidismo: [],
  hipertireoidismo: [],
  colesterol_alto: ["baixo_colesterol"],
};

export interface FiltroReceitas {
  /** Alérgenos que NENHUMA receita sugerida pode conter (bloqueio duro). */
  alergiasBloqueadas: Set<string>;
  /** Dietas que TODA receita sugerida precisa atender (bloqueio duro). */
  dietasExigidas: Set<string>;
  /** Palavras de alimentos que o usuário disse não gostar (sinal fraco, só desempate). */
  alimentosEvitados: string[];
  /** Indicações de saúde preferidas (sinal fraco, só desempate) — derivadas
   *  das condições estruturadas; pode ganhar tags extras da classificação
   *  de "outra condição" em texto livre (ver mealPlanGenerator.ts). */
  indicacoesPreferidas: Set<IndicacaoSaudeReceita>;
}

export function construirFiltro(avaliacao: AvaliacaoNutricional): FiltroReceitas {
  const indicacoesPreferidas = new Set<IndicacaoSaudeReceita>();
  for (const condicao of avaliacao.condicoes_saude ?? []) {
    for (const tag of MAPA_CONDICAO_INDICACAO[condicao] ?? []) {
      indicacoesPreferidas.add(tag);
    }
  }

  return {
    alergiasBloqueadas: extrairTags(avaliacao.alergias, MAPA_ALERGENOS),
    dietasExigidas: extrairTags(avaliacao.restricoes_alimentares, MAPA_DIETAS),
    alimentosEvitados: avaliacao.alimentos_evitados.map(normalizar).filter(Boolean),
    indicacoesPreferidas,
  };
}

/** Uma receita é segura se não contém nenhum alérgeno bloqueado e atende a todas as dietas exigidas. */
export function receitaEhSegura(receita: Receita, filtro: FiltroReceitas): boolean {
  const alergenos = new Set(receita.alergenos ?? []);
  for (const bloqueado of filtro.alergiasBloqueadas) {
    if (alergenos.has(bloqueado)) return false;
  }
  const dietas = new Set(receita.dietas_atendidas ?? []);
  for (const exigida of filtro.dietasExigidas) {
    if (!dietas.has(exigida)) return false;
  }
  return true;
}

function receitaContemAlimentoEvitado(receita: Receita, filtro: FiltroReceitas): boolean {
  if (filtro.alimentosEvitados.length === 0) return false;
  return receita.ingredientes.some((ing) =>
    filtro.alimentosEvitados.some((evitado) => normalizar(ing.nome).includes(evitado))
  );
}

/** Também usado para checar o texto livre gerado por IA contra alergias reais do usuário
 *  (segunda camada de segurança, além do filtro estrutural por tags). */
export function textoContemAlergiaDoUsuario(texto: string, alergias: string[]): boolean {
  const textoNorm = normalizar(texto);
  return alergias.some((a) => {
    const termo = normalizar(a);
    return termo.length > 2 && textoNorm.includes(termo);
  });
}

/** Receitas da categoria pedida que respeitam alergias/restrições, priorizando
 *  as que também evitam o que o usuário disse não gostar. */
export function filtrarReceitasCompativeis(
  receitas: Receita[],
  categoria: CategoriaReceita,
  filtro: FiltroReceitas
): Receita[] {
  const daCategoria = receitas.filter((r) => r.categoria === categoria);
  const seguras = daCategoria.filter((r) => receitaEhSegura(r, filtro));
  const preferidas = seguras.filter((r) => !receitaContemAlimentoEvitado(r, filtro));
  const pool = preferidas.length > 0 ? preferidas : seguras;

  // Última camada, só desempate: entre as receitas já seguras/preferidas,
  // dá prioridade às que batem com alguma indicação de saúde do paciente
  // (ex: baixo_sodio pra hipertensão). Nunca reduz o pool a zero — se
  // nenhuma bater, segue com o pool normal.
  if (filtro.indicacoesPreferidas.size > 0) {
    const comIndicacao = pool.filter((r) =>
      (r.indicacoes_saude ?? []).some((tag) => filtro.indicacoesPreferidas.has(tag))
    );
    if (comIndicacao.length > 0) return comIndicacao;
  }

  return pool;
}

/** Escolhe a receita com calorias mais próximas do alvo, evitando repetir
 *  uma já usada recentemente na semana quando há alternativa. */
export function escolherReceita(
  candidatas: Receita[],
  caloriasAlvo: number,
  usadasRecentemente: Set<string>
): Receita | null {
  if (candidatas.length === 0) return null;
  const naoRepetidas = candidatas.filter((r) => !usadasRecentemente.has(r.id));
  const pool = naoRepetidas.length > 0 ? naoRepetidas : candidatas;
  return pool.reduce((melhor, atual) =>
    Math.abs(atual.calorias - caloriasAlvo) < Math.abs(melhor.calorias - caloriasAlvo) ? atual : melhor
  );
}
