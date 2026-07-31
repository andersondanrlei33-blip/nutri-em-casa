function descreverHorasSono(horasSono: string): string {
  if (horasSono === "< 4 horas") return "menos de 4 horas";
  if (horasSono === "4 a 6 horas") return "entre 4 e 6 horas";
  return horasSono;
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
          `resposta, ainda faltam cerca de ${litrosFaltando.toFixed(1)} litro por dia para chegar lá. Uma boa ` +
          "estratégia é distribuir esse volume ao longo do dia, mantendo sempre uma garrafa por perto — uma boa " +
          "hidratação favorece o funcionamento do organismo, melhora o desempenho físico e ajuda até na " +
          "recuperação muscular.",
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
        ? "Você relatou insônia, e isso interfere bastante no apetite e na composição corporal — vale a pena " +
          "investigar isso com um profissional se persistir, além de tentar manter horários de sono mais regulares."
        : `${trechoHoras}A referência para adultos é de 7 a 9 horas por noite, com boa qualidade — dormir menos ` +
          "do que isso costuma aumentar a fome, reduzir a disposição ao longo do dia e dificultar tanto o " +
          "emagrecimento quanto o ganho de massa muscular. Melhorar gradualmente a duração e a qualidade do sono " +
          "pode trazer benefícios tão importantes quanto um ajuste na dieta.",
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
        ? " Se for continuar bebendo, evitar misturadores açucarados e petiscos salgados já reduz bastante o impacto."
        : "";
    const textoFrequente =
      "Seu consumo frequente de bebidas alcoólicas merece um pouco de atenção. Além das calorias extras, o " +
      "álcool pode interferir na qualidade do sono, na recuperação muscular, aumentar o apetite e dificultar o " +
      "controle do peso. Isso não significa que você precise deixar de consumir completamente, mas reduzir a " +
      `frequência já costuma trazer benefícios importantes.${dicaReducao}`;
    const textoModerado =
      "Seu consumo de bebidas alcoólicas é moderado, o que já é um bom equilíbrio. Ainda assim vale lembrar que " +
      "o álcool tem calorias que não entram no cálculo do seu plano e pode interferir um pouco na qualidade do " +
      `sono e na recuperação — reduzir mais ainda a frequência tende a trazer ganhos extras.${dicaReducao}`;
    blocos.push({
      chave: "alcool",
      titulo: "Álcool",
      prioridade: 11,
      categoria: "habito_vida",
      texto: params.consumoAlcool === "frequente" ? textoFrequente : textoModerado,
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
        "Percebemos que boa parte das suas refeições acontece através de restaurante, bar ou delivery. Isso é " +
        "muito comum na rotina atual e não precisa ser um problema — o mais importante é fazer escolhas mais " +
        "equilibradas nesses momentos, priorizando grelhados, legumes e saladas, e reduzindo bebidas açucaradas.",
    });
  }

  if (params.mastigacao === "Rápida demais, sempre termino primeiro.") {
    blocos.push({
      chave: "mastigacao",
      titulo: "Mastigação",
      prioridade: 13,
      categoria: "habito_vida",
      texto:
        "Sua mastigação acontece de forma bastante rápida. Comer com mais calma pode ajudar o organismo a " +
        "reconhecer melhor a saciedade, reduzindo a chance de exagerar nas quantidades e tornando as refeições " +
        "mais prazerosas — o corpo leva de 15 a 20 minutos para sentir esse sinal.",
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

function montarMensagemFinal(pontosFortes: string[], pontosAtencao: PontoAtencao[]): string {
  const risco = calcularNivelRisco(pontosAtencao);

  if (risco === "nenhum") {
    return (
      "Você já possui uma excelente base de hábitos saudáveis, exatamente o que serve de alicerce para alcançar " +
      "seus objetivos. Agora vamos apenas ajustar alguns detalhes junto com o plano alimentar para potencializar " +
      "ainda mais os seus resultados."
    );
  }

  if (risco === "alto") {
    return (
      "Embora existam alguns pontos que mereçam mais atenção neste momento, cada pequena mudança já representa " +
      "um avanço importante para sua saúde. Não é preciso mudar tudo de uma vez: vamos priorizar o que fará mais " +
      "diferença primeiro e evoluir um passo de cada vez."
    );
  }

  if (pontosFortes.length === 0) {
    return (
      "Esse é só o começo: pequenas mudanças consistentes costumam gerar resultados muito maiores do que " +
      "mudanças radicais. Vamos trabalhar juntos, um passo de cada vez, nos pontos que mais importam agora."
    );
  }
  return (
    "Sua avaliação mostrou diversos pontos positivos e algumas oportunidades de melhoria. O mais importante é " +
    "focar em mudanças graduais e consistentes, pois são elas que costumam trazer os resultados mais duradouros."
  );
}

function montarResumoGeral(
  imc: number,
  classificacaoImc: string,
  objetivo: ObjetivoNutricional,
  metaCalorica: number,
  avisoSeguranca: string | null
): string {
  // Só a primeira letra vira minúscula (a frase começa no meio: "...está na
  // faixa de X") — preserva o algarismo romano em "Obesidade grau II/III".
  const classificacaoLower = classificacaoImc.charAt(0).toLowerCase() + classificacaoImc.slice(1);
  const objetivoTexto = OBJETIVO_TEXTO[objetivo];
  const base =
    classificacaoImc === "Peso normal"
      ? `Após analisar suas respostas, seu IMC está na faixa de ${classificacaoLower} e o foco a partir de agora ` +
        `vai ser ${objetivoTexto}.`
      : `Após analisar suas respostas, seu IMC está na faixa de ${classificacaoLower}. Esse é apenas um dos ` +
        "indicadores usados na avaliação e não define sozinho seu estado de saúde — considerando seus hábitos e " +
        `seu objetivo, o foco a partir de agora vai ser ${objetivoTexto}.`;
  if (avisoSeguranca) return `${base} ${avisoSeguranca}`;
  return `${base} Sua meta calórica foi definida em ${metaCalorica} kcal por dia, buscando um resultado gradual e seguro.`;
}
