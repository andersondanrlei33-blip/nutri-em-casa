/**
 * Domain types shared across the app. These mirror the Supabase schema
 * defined in supabase/migrations/0001_init.sql — keep both in sync.
 */
export type Genero = "feminino" | "masculino" | "outro";
export type NivelAtividade =
  | "sedentario"
  | "leve"
  | "moderado"
  | "intenso"
  | "atleta";
export type ObjetivoNutricional =
  | "emagrecimento"
  | "manutencao"
  | "ganho_massa"
  | "saude_geral"
  | "performance_esportiva";
export type PlanoAssinatura = "gratuito" | "premium" | "anual" | "trial";
export type StatusAssinatura =
  | "ativa"
  | "trial"
  | "cancelada"
  | "expirada"
  | "inadimplente";
export type ProvedorPagamento =
  | "stripe"
  | "mercadopago"
  | "asaas"
  | "hotmart"
  | "kiwify";
/** Lista fechada (não texto livre) — cada uma tem um ajuste clínico
 *  associado em lib/nutrition/calculations.ts::avaliarCondicoesSaude. */
export type CondicaoSaude =
  | "diabetes_tipo1"
  | "diabetes_tipo2"
  | "hipertensao"
  | "doenca_renal"
  | "hipotireoidismo"
  | "hipertireoidismo"
  | "colesterol_alto";
/** Frequência de consumo de álcool informada na consulta — usada em
 *  lib/nutrition/calculations.ts::avaliarConsumoAlcool. */
export type ConsumoAlcool = "nunca" | "raramente" | "moderado" | "frequente";
/** Status de tabagismo informado na consulta — usado em
 *  lib/nutrition/calculations.ts::avaliarTabagismo. */
export type StatusTabagismo = "nunca" | "ex_fumante" | "fumante";
/** Um item da lista "pontos que merecem atenção" do relatório da consulta —
 *  ver lib/nutrition/calculations.ts::montarRelatorioConsulta. `prioridade`
 *  é um número (menor = mais importante) usado só pra ordenar a exibição. */
export interface PontoAtencao {
  chave: string;
  titulo: string;
  prioridade: number;
  categoria: "condicao_saude" | "habito_vida";
  texto: string;
}
/** Dados extraídos por IA de uma foto do documento de avaliação física
 *  (bioimpedância, dobras cutâneas, antropometria etc.) anexado na consulta —
 *  ver lib/nutrition/avaliacaoFisica.ts::extrairAvaliacaoFisica. A IA só lê e
 *  organiza o que está escrito no documento; nunca decide nada com base
 *  nesses dados (isso é avaliarComposicaoCorporal, também nesse arquivo).
 *  Qualquer campo pode vir null quando o documento não trouxer aquele dado. */
export interface AvaliacaoFisicaExtraida {
  dataAvaliacao: string | null;
  metodo: string | null;
  percentualGordura: number | null;
  massaGordaKg: number | null;
  massaMagraKg: number | null;
  aguaCorporalPercentual: number | null;
  tmbMedidoKcal: number | null;
  idadeMetabolica: number | null;
  dobrasCutaneasMm: Record<string, number> | null;
  circunferenciasCm: Record<string, number> | null;
  classificacaoAvaliador: string | null;
  observacoesAvaliador: string | null;
  resumoTexto: string;
}
/** Resultado de cruzar o % de gordura da avaliação física com a
 *  classificação de IMC já calculada — ver
 *  lib/nutrition/avaliacaoFisica.ts::avaliarComposicaoCorporal.
 *  `textoComparativo` só vem preenchido quando os dois indicadores divergem
 *  o bastante pra merecer uma nota no relatório; do contrário é null. */
export interface ComposicaoCorporalResultado {
  percentualGordura: number;
  massaMagraKg: number | null;
  massaGordaKg: number | null;
  classificacaoPercentualGordura: string;
  textoComparativo: string | null;
}
/** Relatório da consulta em blocos, gerado por
 *  lib/nutrition/calculations.ts::montarRelatorioConsulta e salvo em
 *  avaliacoes_nutricionais.relatorio (jsonb). Usado pela tela de resultado
 *  da consulta e pelo Histórico. */
export interface RelatorioConsulta {
  imc: number;
  classificacaoImc: string;
  tmb: number;
  tdee: number;
  metaCalorica: number;
  resumoGeral: string;
  pontosFortes: string[];
  pontosAtencao: PontoAtencao[];
  condicoesSaude: PontoAtencao[];
  habitosVida: PontoAtencao[];
  alimentacao: string;
  prioridades: string[];
  mensagemFinal: string;
  avisoMetaPeso: string | null;
  /** Preenchido só quando o paciente anexou avaliação física com % de
   *  gordura legível na consulta atual — null nos demais casos (inclusive
   *  em relatórios de consultas anteriores a essa coluna). */
  composicaoCorporal: ComposicaoCorporalResultado | null;
}
export interface Perfil {
  id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  data_nascimento: string | null;
  genero: Genero | null;
  criado_em: string;
  atualizado_em: string;
}
export interface AvaliacaoNutricional {
  id: string;
  usuario_id: string;
  peso_kg: number;
  altura_cm: number;
  idade: number;
  genero: Genero;
  nivel_atividade: NivelAtividade;
  objetivo: ObjetivoNutricional;
  peso_meta_kg: number | null;
  restricoes_alimentares: string[];
  alergias: string[];
  /** Lista fechada — ver tipo CondicaoSaude. */
  condicoes_saude: CondicaoSaude[];
  /** Condições relevantes não cobertas pela lista fechada — só registro, sem ajuste automático. */
  condicoes_saude_outras: string | null;
  /** Só registro/contexto — não ajusta cálculo automaticamente, mas gera um
   *  disclaimer genérico pra checar interações com um profissional. */
  medicamentos_em_uso: string[];
  /** Ver ConsumoAlcool. */
  consumo_alcool: ConsumoAlcool;
  /** Ver StatusTabagismo. */
  tabagismo: StatusTabagismo;
  refeicoes_por_dia: number;
  preferencias_alimentares: string[];
  alimentos_evitados: string[];
  qualidade_sono: number | null;
  nivel_estresse: number | null;
  observacoes: string | null;
  /** Sinalizadores de segurança clínica: quando true, o motor de cálculo
   *  nunca aplica déficit/superávit automático (ver lib/nutrition/calculations.ts). */
  gestante: boolean;
  lactante: boolean;
  historico_transtorno_alimentar: boolean;
  /** Explicação de qualquer ajuste de segurança aplicado à meta calórica. */
  ajuste_seguranca: string | null;
  /** Resumo em texto corrido da consulta (calculations.ts::montarResumoConsulta),
   *  salvo no momento da geração pra exibir depois no Histórico exatamente
   *  como foi mostrado na hora. Null em consultas anteriores a essa coluna. */
  resumo: string | null;
  /** Relatório da consulta em blocos (resumo geral, pontos fortes, pontos de
   *  atenção priorizados, condições de saúde, hábitos de vida, alimentação,
   *  prioridades e mensagem final) — ver lib/nutrition/calculations.ts::
   *  RelatorioConsulta. Null em avaliações anteriores a essa coluna. */
  relatorio: RelatorioConsulta | null;
  imc: number;
  classificacao_imc: string;
  tmb: number;
  tdee: number;
  meta_calorica: number;
  meta_proteina_g: number;
  meta_carboidrato_g: number;
  meta_gordura_g: number;
  meta_fibra_g: number;
  meta_agua_ml: number;
  criado_em: string;
  // Campos da Consulta Nutricional de 40 perguntas (anamnese completa) —
  // todos opcionais/nulos em avaliações antigas, que só tinham os campos acima.
  profissao: string | null;
  tipo_suporte_esperado: string | null;
  horas_sono: string | null;
  insonia: boolean | null;
  medicacao_sono: string | null;
  disposicao_manha: string | null;
  disposicao_tarde: string | null;
  disposicao_noite: string | null;
  concentracao: string | null;
  memoria_recente: string | null;
  memoria_antiga: string | null;
  rotina_trabalho: string | null;
  /** Histórico FAMILIAR de doenças — diferente de condicoes_saude, que é da própria pessoa. */
  doencas_familiares: string[];
  /** Também escaneado por identificarCondicaoClinicaComplexa junto com condicoes_saude_outras. */
  historico_cirurgias: string | null;
  suplementos_em_uso: string | null;
  dieta_anterior: string | null;
  ingestao_agua_copos: string | null;
  quem_prepara_comida: string | null;
  refeicao_sozinho_ou_acompanhado: string | null;
  horario_mais_fome: string[];
  mastigacao: string | null;
  preferencia_sabor: string[];
  frequencia_restaurante: string | null;
  historico_dietetico: string | null;
  /** Preenchidos só quando nivel_atividade !== "sedentario" (pergunta
   *  condicional no ConsultaWizard) — null pra quem é sedentário ou pra
   *  avaliações anteriores a essa coluna. */
  horario_treino: string | null;
  /** Se true, mealPlanGenerator.ts inclui refeições de pré-treino/pós-treino
   *  no plano (categorias "pre_treino"/"pos_treino" da biblioteca). */
  quer_pre_pos_treino: boolean | null;
  /** Gera aviso automático — ver avaliarMudancaPesoNaoIntencional. */
  perda_peso_nao_intencional: string | null;
  ganho_peso_nao_intencional: string | null;
  como_conheceu: string | null;
  /** Texto explicando as escolhas do plano alimentar gerado junto com essa
   *  consulta (mealPlanGenerator.ts::observacoes_nutricionista) — salvo pra
   *  o Histórico mostrar exatamente o mesmo texto exibido na hora, em vez de
   *  ele se perder depois da tela de resultado. Null em consultas anteriores
   *  a essa coluna. */
  observacoes_plano: string | null;
  /** Caminho do arquivo no bucket privado avaliacoes-fisicas (não é URL
   *  pública — precisa de signed URL pra visualizar). Null quando o
   *  paciente não anexou avaliação física nessa consulta. */
  avaliacao_fisica_arquivo_url: string | null;
  /** Nome original do arquivo enviado, só pra exibição no Histórico. */
  avaliacao_fisica_arquivo_nome: string | null;
  /** Dados extraídos do documento pela IA — ver AvaliacaoFisicaExtraida.
   *  Null quando não há anexo ou a extração falhou (nesse caso o arquivo
   *  ainda fica salvo, só não tem os dados estruturados). */
  avaliacao_fisica_dados: AvaliacaoFisicaExtraida | null;
}
export interface Receita {
  id: string;
  usuario_id: string | null;
  nome: string;
  descricao: string | null;
  categoria: CategoriaReceita;
  ingredientes: IngredienteReceita[];
  modo_preparo: string[];
  tempo_preparo_min: number;
  porcoes: number;
  calorias: number;
  proteina_g: number;
  carboidrato_g: number;
  gordura_g: number;
  fibra_g: number;
  imagem_url: string | null;
  favorito: boolean;
  /** Vocabulário fechado: lactose, gluten, amendoim, ovo, castanhas, peixe, frutos_do_mar, soja. */
  alergenos: string[];
  /** Vocabulário fechado: vegetariano, vegano, sem_gluten, sem_lactose. */
  dietas_atendidas: string[];
  /** Vocabulário fechado: ver IndicacaoSaudeReceita. Usado pra priorizar
   *  (não bloquear) receitas pra condições de saúde — ver receitaMatching.ts. */
  indicacoes_saude: IndicacaoSaudeReceita[];
  /** Ver CustoReceita. Usado pra priorizar (não bloquear) receitas mais
   *  acessíveis — ver receitaMatching.ts. */
  custo: CustoReceita;
  criado_em: string;
  atualizado_em: string;
}
/** Indicações de saúde por receita — vocabulário FECHADO, nunca livre.
 *  Usado tanto pras condições estruturadas (diabetes, hipertensão...) quanto
 *  pra classificação da IA do campo "outra condição" (sempre escolhendo
 *  dentro dessa lista, nunca inventando uma tag nova). */
export type IndicacaoSaudeReceita =
  | "baixo_sodio"
  | "baixo_indice_glicemico"
  | "baixo_colesterol"
  | "controle_renal"
  | "alta_fibra";
/** Nível de custo estimado do ingrediente principal da receita — usado em
 *  lib/nutrition/receitaMatching.ts pra priorizar receitas acessíveis (o
 *  público-alvo do app é majoritariamente sensível a preço; sem essa tag,
 *  uma receita com salmão podia entrar no plano de qualquer paciente). */
export type CustoReceita = "baixo" | "medio" | "alto";
export type CategoriaReceita =
  | "cafe_da_manha"
  | "almoco"
  | "jantar"
  | "lanche"
  | "sobremesa"
  | "pre_treino"
  | "pos_treino";
export interface IngredienteReceita {
  nome: string;
  quantidade: number;
  unidade: string;
}
export interface PlanoAlimentar {
  id: string;
  usuario_id: string;
  nome: string;
  data_inicio: string;
  ativo: boolean;
  criado_em: string;
}
export type DiaSemana =
  | "segunda"
  | "terca"
  | "quarta"
  | "quinta"
  | "sexta"
  | "sabado"
  | "domingo";
export interface RefeicaoPlano {
  id: string;
  plano_id: string;
  receita_id: string | null;
  dia_semana: DiaSemana;
  nome_refeicao: string;
  horario: string;
  quantidade_porcoes: number;
  ordem: number;
  /** @deprecated não usar mais — foi substituído por registros_consumo, que
   *  guarda o consumo real por data específica (não por dia da semana
   *  genérico, que nunca resetava). Mantido só porque a coluna ainda existe
   *  no banco. */
  consumida: boolean;
  criado_em: string;
  /** Categoria da refeição (café da manhã, almoço, lanche...) — null em
   *  registros antigos gerados antes dessa coluna existir. */
  categoria: CategoriaReceita | null;
}
export interface RegistroConsumo {
  id: string;
  usuario_id: string;
  refeicao_plano_id: string | null;
  data: string;
  /** Receita realmente registrada nessa data/refeição — pode ser diferente
   *  da sugerida em RefeicaoPlano.receita_id quando o paciente troca
   *  avulsamente pela tela de Receitas (ver lib/nutrition/registrarConsumo.ts). */
  receita_id: string | null;
  calorias: number;
  proteina_g: number;
  carboidrato_g: number;
  gordura_g: number;
  criado_em: string;
}
export interface RegistroPeso {
  id: string;
  usuario_id: string;
  peso_kg: number;
  data: string;
  observacoes: string | null;
  criado_em: string;
}
export interface RegistroMedidas {
  id: string;
  usuario_id: string;
  data: string;
  cintura_cm: number | null;
  quadril_cm: number | null;
  peito_cm: number | null;
  braco_cm: number | null;
  coxa_cm: number | null;
  pescoco_cm: number | null;
  percentual_gordura: number | null;
  criado_em: string;
}
export interface RegistroAgua {
  id: string;
  usuario_id: string;
  data: string;
  quantidade_ml: number;
  criado_em: string;
}
export interface RegistroSono {
  id: string;
  usuario_id: string;
  data: string;
  horas: number;
  qualidade: number;
  criado_em: string;
}
export interface RegistroHumor {
  id: string;
  usuario_id: string;
  data: string;
  humor: number;
  energia: number;
  observacoes: string | null;
  criado_em: string;
}
export interface RegistroExercicio {
  id: string;
  usuario_id: string;
  data: string;
  tipo: string;
  duracao_min: number;
  calorias_estimadas: number | null;
  intensidade: "leve" | "moderada" | "intensa";
  observacoes: string | null;
  criado_em: string;
}
export interface Assinatura {
  id: string;
  usuario_id: string;
  plano: PlanoAssinatura;
  status: StatusAssinatura;
  provedor: ProvedorPagamento | null;
  id_externo: string | null;
  inicio_em: string;
  renovacao_em: string | null;
  trial_termina_em: string | null;
  cancelada_em: string | null;
  criado_em: string;
}
