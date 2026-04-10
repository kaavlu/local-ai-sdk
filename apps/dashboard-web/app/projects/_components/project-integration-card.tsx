'use client'

import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StrategyPreset, UseCaseType } from '@/lib/data/dashboard-types'

interface ProjectIntegrationCardProps {
  projectId: string
  useCaseType: UseCaseType
  strategyPreset: StrategyPreset
  localModel: string | null
  cloudModel: string | null
}

type CopyTarget = 'projectId' | 'snippet'

function buildSnippet({
  projectId,
  useCaseType,
  strategyPreset,
  localModel,
  cloudModel,
}: ProjectIntegrationCardProps) {
  const lines = [
    "import {",
    '  createDemoProjectSdkContext,',
    '  deriveSchedulingFromDemoProject,',
    '  HttpDemoConfigProvider',
    "} from '@dyno/sdk-ts'",
    '',
    `const projectId = '${projectId}'`,
    '',
    'const context = await createDemoProjectSdkContext({',
    '  projectId,',
    '  sdkOptions: {',
    "    baseUrl: process.env.DYNO_AGENT_URL ?? 'http://127.0.0.1:8787'",
    '  },',
    '  configProvider: new HttpDemoConfigProvider({',
    "    configResolverUrl: process.env.DYNO_CONFIG_RESOLVER_URL ?? 'http://127.0.0.1:3000',",
    '    resolverSecret: process.env.DYNO_CONFIG_RESOLVER_SECRET',
    '  })',
    '})',
    '',
    '// Optional: inspect resolved dashboard config',
    `// use_case_type=${useCaseType}, strategy_preset=${strategyPreset}`,
    `// local_model=${localModel ?? 'not set'}, cloud_model=${cloudModel ?? 'not set'}`,
    '',
  ]

  if (useCaseType === 'embeddings') {
    lines.push(
      'const scheduling = deriveSchedulingFromDemoProject(context.projectConfig)',
      '',
      'const job = await context.sdk.createJob({',
      "  taskType: 'embed_text',",
      "  payload: { text: 'Hello world' },",
      '  executionPolicy: scheduling.executionPolicy,',
      '  localMode: scheduling.localMode',
      '})',
      '',
      'const finalJob = await context.sdk.waitForJobCompletion(job.id, {',
      '  pollIntervalMs: 300,',
      '  timeoutMs: 60_000',
      '})',
      '',
      "if (finalJob.state === 'completed') {",
      '  const result = await context.sdk.getJobResult(job.id)',
      '  console.log(result)',
      '}',
    )

    return lines.join('\n')
  }

  lines.push('// This use case is not supported by the current SDK runtime yet.')
  return lines.join('\n')
}

export function ProjectIntegrationCard({
  projectId,
  useCaseType,
  strategyPreset,
  localModel,
  cloudModel,
}: ProjectIntegrationCardProps) {
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null)

  const snippet = useMemo(
    () => buildSnippet({ projectId, useCaseType, strategyPreset, localModel, cloudModel }),
    [cloudModel, localModel, projectId, strategyPreset, useCaseType],
  )

  async function handleCopy(value: string, target: CopyTarget) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedTarget(target)
      window.setTimeout(() => {
        setCopiedTarget((current) => (current === target ? null : current))
      }, 1500)
    } catch {
      setCopiedTarget(null)
    }
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card p-5">
      <div className="mb-3">
        <h2 className="text-[12px] font-semibold text-foreground">Integration</h2>
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
          Use this project with projectId-based config resolution
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-foreground/90">Project ID</p>
            <Button
              type="button"
              variant="outline"
              className="h-6 rounded-sm px-2 text-[10px]"
              onClick={() => void handleCopy(projectId, 'projectId')}
            >
              {copiedTarget === 'projectId' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copiedTarget === 'projectId' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          <code
            title={projectId}
            className="block truncate font-mono text-[11px] text-foreground/85"
          >
            {projectId}
          </code>
        </div>

        <div className="rounded-sm border border-border/40 bg-background/30">
          <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1.5">
            <p className="font-mono text-[10px] text-muted-foreground/80">TypeScript</p>
            <Button
              type="button"
              variant="outline"
              className="h-6 rounded-sm px-2 text-[10px]"
              onClick={() => void handleCopy(snippet, 'snippet')}
            >
              {copiedTarget === 'snippet' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copiedTarget === 'snippet' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground/85">
            <code>{snippet}</code>
          </pre>
        </div>

        <p className="text-[10px] text-muted-foreground/70">
          Developers only pass a projectId (and resolver URL for this demo bridge). Dyno resolves
          project config on the server.
        </p>
      </div>
    </div>
  )
}
