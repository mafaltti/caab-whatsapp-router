import type { ProviderId } from "./providers";

export type LlmTask =
  | "classify_flow"
  | "classify_subroute"
  | "detect_topic_shift"
  | "extract_data"
  | "conversational_reply"
  | "summarize";

const DEFAULT_PROVIDER: ProviderId = "groq";

let routingMap: Map<LlmTask, ProviderId> | null = null;

function parseRouting(): Map<LlmTask, ProviderId> {
  const map = new Map<LlmTask, ProviderId>();
  const raw = process.env.LLM_TASK_ROUTING;
  if (!raw) return map;

  for (const pair of raw.split(",")) {
    const [task, provider] = pair.trim().split("=");
    if (task && provider) {
      map.set(task.trim() as LlmTask, provider.trim() as ProviderId);
    }
  }

  return map;
}

export function getProviderForTask(task?: LlmTask): ProviderId {
  if (!task) return DEFAULT_PROVIDER;

  if (!routingMap) {
    routingMap = parseRouting();
  }

  return routingMap.get(task) ?? DEFAULT_PROVIDER;
}
