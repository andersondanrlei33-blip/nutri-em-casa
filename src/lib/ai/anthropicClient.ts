import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Lazily instantiate the Anthropic client only when an API key is configured. */
export function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Haiku: melhor custo-benefício para gerar plano alimentar estruturado e
// responder dúvidas nutricionais simples — não precisa do raciocínio mais
// caro do Sonnet/Opus para essas tarefas.
export const NUTRI_MODEL = "claude-haiku-4-5-20251001";

// Sonnet: usado só onde a IA precisa LER uma imagem com precisão (foto de
// laudo de avaliação física — ver lib/nutrition/avaliacaoFisica.ts::
// extrairAvaliacaoFisica). Laudos de bioimpedância têm vários números
// parecidos e próximos uns dos outros (ex: IMC e % de gordura) — o Haiku
// já confundiu esses dois campos num teste real, mesmo com o prompt
// deixando isso explícito. É a única chamada de IA do app onde um erro de
// leitura tem efeito clínico direto (um % de gordura errado muda toda a
// interpretação do relatório), então vale o custo maior só aqui — todas as
// outras tarefas (plano alimentar, classificação de texto) continuam no
// NUTRI_MODEL (Haiku), sem mudança de custo.
export const NUTRI_MODEL_VISAO = "claude-sonnet-5";
