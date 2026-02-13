import type { SessionState, ChatMessage } from "@/lib/db";
import type { NormalizedMessage } from "@/lib/shared";

export interface FlowContext {
  state: SessionState;
  message: NormalizedMessage;
  chatHistory: ChatMessage[];
  correlationId: string;
}

export interface StepResult {
  reply: string;
  nextStep: string;
  data?: Record<string, unknown>;
  done?: boolean;
}

export type StepHandler = (ctx: FlowContext) => Promise<StepResult>;

export interface FlowSubrouteDefinition {
  entryStep: string;
  steps: Record<string, StepHandler>;
}

export interface FlowDefinition {
  id: string;
  version: string;
  active: boolean;
  steps: Record<string, StepHandler>;
  subroutes?: Record<string, FlowSubrouteDefinition>;
}

export interface FlowExecutionResult {
  reply: string;
  nextState: {
    activeFlow: string | null;
    activeSubroute: string | null;
    step: string;
    data: Record<string, unknown>;
  };
  done: boolean;
}
