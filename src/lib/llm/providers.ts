export type ProviderId = "groq" | "mistral" | "cerebras" | "mafaltti";

export interface ProviderConfig {
  id: ProviderId;
  baseURL: string;
  model: string;
  keys: string[];
}

interface ProviderDefaults {
  baseURL: string;
  model: string;
  keysEnv: string;
  modelEnv: string;
  required: boolean;
}

const PROVIDER_DEFAULTS: Record<ProviderId, ProviderDefaults> = {
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    keysEnv: "GROQ_API_KEYS",
    modelEnv: "GROQ_MODEL",
    required: true,
  },
  mistral: {
    baseURL: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    keysEnv: "MISTRAL_API_KEYS",
    modelEnv: "MISTRAL_MODEL",
    required: false,
  },
  cerebras: {
    baseURL: "https://api.cerebras.ai/v1",
    model: "gpt-oss-120b",
    keysEnv: "CEREBRAS_API_KEYS",
    modelEnv: "CEREBRAS_MODEL",
    required: false,
  },
  mafaltti: {
    baseURL: "https://llm-arm02.danilocarneiro.com/v1",
    model: "llama3.1:8b-instruct-q4_K_M",
    keysEnv: "MAFALTTI_API_KEYS",
    modelEnv: "MAFALTTI_MODEL",
    required: false,
  },
};

const providerCache = new Map<ProviderId, ProviderConfig>();

const keyIndexes = new Map<ProviderId, number>();

export function getProvider(id: ProviderId): ProviderConfig {
  const cached = providerCache.get(id);
  if (cached) return cached;

  const defaults = PROVIDER_DEFAULTS[id];
  const raw = process.env[defaults.keysEnv];

  if (!raw) {
    if (defaults.required) {
      throw new Error(`Missing env var ${defaults.keysEnv}`);
    }
    throw new Error(
      `Provider "${id}" not configured — set ${defaults.keysEnv}`,
    );
  }

  const keys = raw.split(",").filter(Boolean);
  if (keys.length === 0) {
    throw new Error(`${defaults.keysEnv} is empty`);
  }

  const model = process.env[defaults.modelEnv] || defaults.model;

  const config: ProviderConfig = {
    id,
    baseURL: defaults.baseURL,
    model,
    keys,
  };

  providerCache.set(id, config);
  return config;
}

export function nextApiKey(provider: ProviderConfig): string {
  const idx = keyIndexes.get(provider.id) ?? 0;
  const key = provider.keys[idx % provider.keys.length];
  keyIndexes.set(provider.id, (idx + 1) % provider.keys.length);
  return key;
}
