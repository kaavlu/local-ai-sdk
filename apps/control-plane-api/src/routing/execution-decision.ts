import type { StrategyPreset } from '../project-context.js';
import { determineEmbeddingExecution, type EmbeddingDecisionReason } from './embedding-decision.js';

export type DynoUseCase = 'embeddings' | 'chat';
export type DynoExecution = 'local' | 'cloud';

export type ExecutionDecisionReason = EmbeddingDecisionReason | 'local_not_supported';

export interface ExecutionDecision {
  execution: DynoExecution;
  reason: ExecutionDecisionReason;
}

interface DetermineExecutionInput {
  useCase: DynoUseCase;
  strategyPreset: StrategyPreset;
  agentReachable: boolean;
  localReady: boolean;
}

export function determineExecution(input: DetermineExecutionInput): ExecutionDecision {
  if (input.useCase === 'chat') {
    return {
      execution: 'cloud',
      reason: 'local_not_supported',
    };
  }
  return determineEmbeddingExecution({
    strategyPreset: input.strategyPreset,
    agentReachable: input.agentReachable,
    localReady: input.localReady,
  });
}
