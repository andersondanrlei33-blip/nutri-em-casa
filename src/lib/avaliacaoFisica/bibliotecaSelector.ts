// ============================================================================
// bibliotecaSelector.ts
// Porta de acesso à Biblioteca Clínica (as interpretações já escritas em
// biblioteca_clinica_nutri_em_casa.md, mais os novos códigos AVALFISICA-*
// da Seção 8 da spec, que ainda precisam ser escritos/cadastrados).
//
// O motor de regras e o montador de consulta não sabem ONDE a biblioteca
// está guardada — só chamam esta interface. BibliotecaClinicaMock (abaixo)
// é só pra desenvolvimento/teste; trocar pela implementação real antes de
// ir pra produção (ex: buscando de uma tabela no Supabase).
// ============================================================================

export interface BibliotecaClinica {
  /**
   * Retorna um texto de interpretação de uma categoria específica (ex:
   * "AVALFISICA-IMC-MASCARADO-MUSCULO"), evitando repetir o mesmo código
   * pro mesmo paciente dentro da janela de dias informada — mesma lógica
   * descrita no Apêndice (Seção 20) da Biblioteca Clínica.
   */
  selecionarInterpretacao(params: {
    codigoCategoria: string;
    pacienteId: string;
    janelaDias?: number;
  }): Promise<string>;

  selecionarElogio(params: { pacienteId: string; janelaDias?: number }): Promise<string>;

  selecionarMotivacional(params: { pacienteId: string; janelaDias?: number }): Promise<string>;

  /** Curiosidade educativa opcional (Módulo 18), relacionada a um tema. */
  selecionarEducativa?(params: { tema?: string }): Promise<string>;
}

/**
 * Implementação de referência para desenvolvimento e testes locais, com
 * um punhado de textos de exemplo (só o suficiente para rodar o caso de
 * teste do InBody do Anderson).
 *
 * SUBSTITUIR por uma implementação real que busque no banco/arquivo onde
 * a Biblioteca Clínica de fato mora no projeto. Sugestão de implementação
 * real via Supabase, caso a biblioteca seja migrada para uma tabela:
 *
 *   async selecionarInterpretacao({ codigoCategoria, pacienteId, janelaDias = 90 }) {
 *     const { data } = await supabase.rpc("selecionar_interpretacao_sem_repeticao", {
 *       p_codigo_categoria: codigoCategoria,
 *       p_paciente_id: pacienteId,
 *       p_janela_dias: janelaDias,
 *     });
 *     return data.texto;
 *   }
 */
export class BibliotecaClinicaMock implements BibliotecaClinica {
  private textos: Record<string, string[]> = {
    "AVALFISICA-IMC-MASCARADO-MUSCULO": [
      "Seu IMC aparece um pouco acima da faixa considerada padrão, mas esse número sozinho não conta a história toda. Como sua massa muscular está acima da média e o percentual de gordura está dentro da faixa esperada, o peso a mais vem principalmente de músculo, não de gordura.",
    ],
    "AVALFISICA-GORDURA-CONCENTRADA-TRONCO": [
      "O percentual de gordura geral está em uma faixa saudável, mas os dados por região do corpo mostram uma concentração maior na área do tronco em comparação aos braços e pernas. Vale olhar para esse ponto específico, mesmo com o resultado geral sendo positivo.",
    ],
    "AVALFISICA-GORDURA-VISCERAL-ATENCAO": [
      "O nível de gordura visceral está dentro da faixa considerada normal, mas já na parte de cima dela. Esse é um bom momento para reforçar hábitos como reduzir ultraprocessados e manter a atividade física regular, sem que isso represente um problema no momento.",
    ],
    "AVALFISICA-RECOMPOSICAO-FAVORAVEL": [
      "Com o percentual de gordura já em uma faixa saudável e a massa muscular acima da média, o caminho mais indicado agora não é um ganho de peso agressivo nem um corte calórico intenso, e sim uma recomposição corporal gradual: calorias próximas da manutenção, boa quantidade de proteína e treino de força consistente.",
    ],
    "AVALFISICA-MASSA-MUSCULAR-ABAIXO-HIPERTROFIA": [
      "Sua massa muscular ainda tem espaço para crescer em relação à faixa esperada. Como o foco é hipertrofia, vale reforçar a quantidade de proteína distribuída ao longo do dia e a consistência do treino de força.",
    ],
    "AVALFISICA-PERCENTUAL-GORDURA-ACIMA-EMAGRECIMENTO": [
      "O percentual de gordura está acima da faixa esperada, o que é um bom ponto de partida para o trabalho de emagrecimento. Pequenos ajustes graduais no total calórico costumam trazer resultados mais consistentes do que mudanças bruscas.",
    ],
    "AVALFISICA-PESO-IDEAL-NAO-E-A-META": [
      "O peso calculado como ideal pelo aparelho já está bem próximo do seu peso atual. Isso sugere que a meta pode não ser exatamente pesar menos, e sim melhorar a distribuição entre músculo e gordura no corpo.",
    ],
    "AVALFISICA-ASSIMETRIA-MUSCULAR": [
      "Os dados por segmento mostram uma diferença perceptível de massa muscular entre os dois lados do corpo. Vale observar esse ponto ao longo do tempo, e conversar com um educador físico pode ajudar a entender melhor essa distribuição.",
    ],
    "AVALFISICA-EVOLUCAO-RECOMPOSICAO-POSITIVA": [
      "Comparando com a avaliação anterior, o resultado é o melhor cenário possível: o percentual de gordura caiu e a massa muscular aumentou ao mesmo tempo. Isso mostra que a estratégia atual está funcionando bem para o objetivo de recomposição corporal.",
    ],
  };

  async selecionarInterpretacao({
    codigoCategoria,
  }: {
    codigoCategoria: string;
    pacienteId: string;
    janelaDias?: number;
  }): Promise<string> {
    const opcoes = this.textos[codigoCategoria];
    if (!opcoes || opcoes.length === 0) {
      return `[Sem interpretação cadastrada para "${codigoCategoria}" — adicionar na Biblioteca Clínica, Módulo 19]`;
    }
    return opcoes[Math.floor(Math.random() * opcoes.length)];
  }

  async selecionarElogio(): Promise<string> {
    return "Sua pontuação geral no exame já mostra um bom equilíbrio na composição corporal — vale reconhecer esse resultado.";
  }

  async selecionarMotivacional(): Promise<string> {
    return "Grandes resultados normalmente surgem da soma de pequenas mudanças consistentes.";
  }

  async selecionarEducativa(): Promise<string> {
    return "A hidratação adequada influencia praticamente todos os processos do organismo.";
  }
}
