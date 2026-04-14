import type { UseCaseType } from '@/lib/data/dashboard-types'

export const SUPPORTED_USE_CASES: readonly UseCaseType[] = ['embeddings', 'text_generation']

export const SUPPORTED_USE_CASE_OPTIONS: ReadonlyArray<{
  value: UseCaseType
  label: string
}> = [
  {
    value: 'embeddings',
    label: 'text_embeddings',
  },
  {
    value: 'text_generation',
    label: 'chat_completions',
  },
]

export function isSupportedUseCase(value: string): value is UseCaseType {
  return SUPPORTED_USE_CASES.includes(value as UseCaseType)
}

