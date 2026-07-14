import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  // Supabase 인증/관리 화면은 OpenAI 설정 전에도 사용할 수 있어야 한다.
  // 실제 AI 호출 시 getOpenAIApiKey에서 엄격히 검증한다.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_RESPONSE_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  CRON_SECRET: z.string().min(32),
  RAG_MAX_FILE_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
  RAG_WORKER_ID: z.string().min(1).default("worker"),
  RAG_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(5).default(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}

const openAIApiKeySchema = z.string().min(20).refine(
  (value) => !value.includes("REPLACE_ME"),
  "OPENAI_API_KEY must be a real API key",
);

function normalizeSecret(value: string | undefined) {
  return value?.trim().replace(/^\uFEFF/, "");
}

export function hasOpenAIConfig() {
  return openAIApiKeySchema.safeParse(normalizeSecret(process.env.OPENAI_API_KEY)).success;
}

export function getOpenAIApiKey() {
  return openAIApiKeySchema.parse(normalizeSecret(getServerEnv().OPENAI_API_KEY));
}

export function serverConfigStatus() {
  return {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    openAiApiKey: hasOpenAIConfig(),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };
}
