import "server-only";

import OpenAI from "openai";

import { getOpenAIApiKey } from "@/lib/config/env";

let client: OpenAI | undefined;

export function getOpenAI() {
  client ??= new OpenAI({ apiKey: getOpenAIApiKey() });
  return client;
}

export async function embedTexts(texts: string[]) {
  if (texts.length === 0) return [];
  const result: number[][] = [];
  for (let index = 0; index < texts.length; index += 64) {
    const batch = texts.slice(index, index + 64);
    const response = await getOpenAI().embeddings.create({
      model: "text-embedding-3-small",
      dimensions: 1536,
      encoding_format: "float",
      input: batch,
    });
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== batch.length || ordered.some((item) => item.embedding.length !== 1536)) {
      throw new Error("Embedding response shape mismatch");
    }
    result.push(...ordered.map((item) => item.embedding));
  }
  return result;
}
