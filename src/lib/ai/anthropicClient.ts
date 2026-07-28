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
