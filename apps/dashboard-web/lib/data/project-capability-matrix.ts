export type CapabilityState = 'active' | 'partial' | 'not_yet_active'

export type RuntimeControlKey =
  | 'strategyPreset'
  | 'fallbackEnabled'
  | 'upstreamProviderType'
  | 'upstreamBaseUrl'
  | 'upstreamModel'
  | 'upstreamApiKey'
  | 'localModel'
  | 'estimatedCloudCostPerRequestUsd'
  | 'batteryMinPercent'
  | 'idleMinSeconds'
  | 'requiresCharging'
  | 'wifiOnly'

export interface RuntimeControlCapability {
  key: RuntimeControlKey
  label: string
  state: CapabilityState
  note: string
}

export const PROJECT_RUNTIME_CONTROL_CAPABILITIES: Record<RuntimeControlKey, RuntimeControlCapability> = {
  strategyPreset: {
    key: 'strategyPreset',
    label: 'Strategy preset',
    state: 'active',
    note: 'Directly mapped to SDK scheduling behavior.',
  },
  fallbackEnabled: {
    key: 'fallbackEnabled',
    label: 'Fallback enabled',
    state: 'active',
    note: 'Directly controls whether cloud fallback is allowed.',
  },
  upstreamProviderType: {
    key: 'upstreamProviderType',
    label: 'Upstream provider type',
    state: 'active',
    note: 'Supported and persisted for hosted compatibility flow.',
  },
  upstreamBaseUrl: {
    key: 'upstreamBaseUrl',
    label: 'Upstream base URL',
    state: 'active',
    note: 'Used for hosted compatibility flow configuration.',
  },
  upstreamModel: {
    key: 'upstreamModel',
    label: 'Upstream model',
    state: 'active',
    note: 'Used for hosted compatibility flow configuration.',
  },
  upstreamApiKey: {
    key: 'upstreamApiKey',
    label: 'Upstream API key',
    state: 'active',
    note: 'Stored for hosted compatibility flow configuration.',
  },
  localModel: {
    key: 'localModel',
    label: 'Local model',
    state: 'partial',
    note: 'Stored in project config; broader runtime model mapping is still evolving.',
  },
  estimatedCloudCostPerRequestUsd: {
    key: 'estimatedCloudCostPerRequestUsd',
    label: 'Estimated cloud cost per request',
    state: 'active',
    note: 'Used in dashboard value estimates.',
  },
  batteryMinPercent: {
    key: 'batteryMinPercent',
    label: 'Battery minimum percent',
    state: 'not_yet_active',
    note: 'Displayed in config, but not yet enforced by the default SDK runtime path.',
  },
  idleMinSeconds: {
    key: 'idleMinSeconds',
    label: 'Idle minimum seconds',
    state: 'not_yet_active',
    note: 'Displayed in config, but not yet enforced by the default SDK runtime path.',
  },
  requiresCharging: {
    key: 'requiresCharging',
    label: 'Requires charging',
    state: 'not_yet_active',
    note: 'Displayed in config, but not yet enforced by the default SDK runtime path.',
  },
  wifiOnly: {
    key: 'wifiOnly',
    label: 'Wi-Fi only',
    state: 'not_yet_active',
    note: 'Displayed in config, but not yet enforced by the default SDK runtime path.',
  },
}

export const PROJECT_CAPABILITY_MATRIX_VERSION = 'phase5-capability-truth-audit-v1'

export function getProjectRuntimeControlCapability(key: RuntimeControlKey): RuntimeControlCapability {
  return PROJECT_RUNTIME_CONTROL_CAPABILITIES[key]
}

export function isCapabilityEditable(state: CapabilityState): boolean {
  return state === 'active' || state === 'partial'
}
