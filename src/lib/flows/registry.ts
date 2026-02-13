import { logger } from "@/lib/shared";
import { FLOW_VALUES } from "@/lib/llm/schemas";
import type { FlowDefinition } from "./types";
import { unknownFlowV1 } from "./unknown/v1/flow";
import { generalSupportFlowV1 } from "./generalSupport/v1/flow";
import { digitalCertificateFlowV1 } from "./digitalCertificate/v1/flow";
import { billingFlowV1 } from "./billing/v1/flow";

// --- Registry: flat array of all flow versions ---

const FLOW_REGISTRY: FlowDefinition[] = [
  unknownFlowV1,
  generalSupportFlowV1,
  digitalCertificateFlowV1,
  billingFlowV1,
];

// --- Env-driven version overrides ---

function parseVersionOverrides(): Record<string, string> {
  const raw = process.env.FLOW_VERSION_OVERRIDES;
  if (!raw) return {};

  const overrides: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && value) overrides[key] = value;
  }
  return overrides;
}

// --- Registry validation (runs at module load) ---

function validateRegistry(): void {
  const overrides = parseVersionOverrides();

  // Group by flow id
  const byId = new Map<string, FlowDefinition[]>();
  for (const flow of FLOW_REGISTRY) {
    const existing = byId.get(flow.id) ?? [];
    existing.push(flow);
    byId.set(flow.id, existing);
  }

  // Check: no two versions of the same flow both active
  for (const [id, versions] of byId) {
    const activeVersions = versions.filter((v) => v.active);
    if (activeVersions.length > 1) {
      throw new Error(
        `Flow registry error: "${id}" has ${activeVersions.length} active versions ` +
          `(${activeVersions.map((v) => v.version).join(", ")}). Only one may be active.`,
      );
    }
  }

  // Check: every FLOW_VALUES entry has at least one registered version
  for (const flowId of FLOW_VALUES) {
    if (!byId.has(flowId)) {
      throw new Error(
        `Flow registry error: "${flowId}" is in FLOW_VALUES but has no registered version.`,
      );
    }
  }

  // Check: every flow has an active version (or env override)
  for (const [id, versions] of byId) {
    const hasActive = versions.some((v) => v.active);
    const hasOverride = id in overrides;
    if (!hasActive && !hasOverride) {
      throw new Error(
        `Flow registry error: "${id}" has no active version and no env override.`,
      );
    }
    if (hasOverride) {
      const overrideVersion = overrides[id];
      const match = versions.find((v) => v.version === overrideVersion);
      if (!match) {
        throw new Error(
          `Flow registry error: FLOW_VERSION_OVERRIDES sets "${id}=${overrideVersion}" ` +
            `but no version "${overrideVersion}" is registered.`,
        );
      }
    }
  }

  // Log summary
  const summary = [...byId.entries()].map(([id, versions]) => {
    const resolved = overrides[id]
      ? `${overrides[id]} (override)`
      : versions.find((v) => v.active)?.version ?? "none";
    return `${id}=${resolved}`;
  });

  logger.info({
    event: "flow_registry_validated",
    flows: summary.join(", "),
    overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  });
}

validateRegistry();

// --- Public API ---

export function getFlowDefinition(flowId: string): FlowDefinition | null {
  const overrides = parseVersionOverrides();
  const overrideVersion = overrides[flowId];

  if (overrideVersion) {
    return (
      FLOW_REGISTRY.find(
        (f) => f.id === flowId && f.version === overrideVersion,
      ) ?? null
    );
  }

  return FLOW_REGISTRY.find((f) => f.id === flowId && f.active) ?? null;
}
