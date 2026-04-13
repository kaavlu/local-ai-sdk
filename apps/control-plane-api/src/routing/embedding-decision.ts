import type { StrategyPreset } from '../project-context.js';

export type DynoExecution = 'local' | 'cloud';

export type EmbeddingDecisionReason =
  | 'local_ready'
  | 'cloud_preferred'
  | 'agent_unreachable'
  | 'not_ready'
  | 'cloud_fallback';

export interface EmbeddingDecision {
  execution: DynoExecution;
  reason: EmbeddingDecisionReason;
}

export interface DetermineEmbeddingExecutionInput {
  strategyPreset: StrategyPreset;
  agentReachable: boolean;
  localReady: boolean;
}

export function determineEmbeddingExecution(
  input: DetermineEmbeddingExecutionInput,
): EmbeddingDecision {
  if (input.strategyPreset === 'cloud_first') {
    return { execution: 'cloud', reason: 'cloud_preferred' };
  }
  if (!input.agentReachable) {
    return { execution: 'cloud', reason: 'agent_unreachable' };
  }
  if (!input.localReady) {
    return { execution: 'cloud', reason: 'not_ready' };
  }
  return { execution: 'local', reason: 'local_ready' };
}
