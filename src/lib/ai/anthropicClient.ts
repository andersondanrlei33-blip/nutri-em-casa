import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Lazily instantiate the Anthropic client only when an API key is configured. */
export function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const NUTRI_MODEL = "claude-sonnet-4-5";
