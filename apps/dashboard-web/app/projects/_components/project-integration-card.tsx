'use client'

import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ProjectIntegrationCardProps {
  baseUrl: string
  logicalModel: string
  openAiSnippet: string
  curlSnippet: string
  hasApiKeys: boolean
  className?: string
}

type CopyTarget = 'baseUrl' | 'model' | 'openAiSnippet' | 'curlSnippet'

export function ProjectIntegrationCard({
  baseUrl,
  logicalModel,
  openAiSnippet,
  curlSnippet,
  hasApiKeys,
  className,
}: ProjectIntegrationCardProps) {
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null)

  const hasNoApiKeys = useMemo(() => !hasApiKeys, [hasApiKeys])

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
    <div className={cn('rounded-lg border border-border/40 bg-card p-5', className)}>
      <div className="mb-3">
        <h2 className="text-[12px] font-semibold text-foreground">Integration</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
          Use OpenAI-compatible embeddings with your project’s logical model and a Dyno API key.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-sm border border-border/40 bg-background/25 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Authentication</p>
          <p className="mt-1 text-[11px] text-foreground/90">
            Set <code className="font-mono">DYNO_API_KEY</code> to one of this project&apos;s Dyno API keys.
            {hasNoApiKeys ? ' No active keys exist yet, so requests will fail authentication until you create one.' : ''}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-foreground/90">Base URL</p>
              <Button
                type="button"
                variant="outline"
                className="h-6 rounded-sm px-2 text-[10px]"
                onClick={() => void handleCopy(baseUrl, 'baseUrl')}
              >
                {copiedTarget === 'baseUrl' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span className="ml-1">{copiedTarget === 'baseUrl' ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
            <code title={baseUrl} className="block truncate font-mono text-[11px] text-foreground/85">
              {baseUrl}
            </code>
          </div>

          <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-foreground/90">Embeddings Model</p>
              <Button
                type="button"
                variant="outline"
                className="h-6 rounded-sm px-2 text-[10px]"
                onClick={() => void handleCopy(logicalModel, 'model')}
              >
                {copiedTarget === 'model' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span className="ml-1">{copiedTarget === 'model' ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
            <code title={logicalModel} className="block truncate font-mono text-[11px] text-foreground/85">
              {logicalModel}
            </code>
          </div>
        </div>

        <div className="rounded-sm border border-border/40 bg-background/30">
          <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1.5">
            <p className="font-mono text-[10px] text-muted-foreground/80">TypeScript (OpenAI SDK)</p>
            <Button
              type="button"
              variant="outline"
              className="h-6 rounded-sm px-2 text-[10px]"
              onClick={() => void handleCopy(openAiSnippet, 'openAiSnippet')}
            >
              {copiedTarget === 'openAiSnippet' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copiedTarget === 'openAiSnippet' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground/85">
            <code>{openAiSnippet}</code>
          </pre>
        </div>

        <div className="rounded-sm border border-border/40 bg-background/30">
          <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1.5">
            <p className="font-mono text-[10px] text-muted-foreground/80">cURL</p>
            <Button
              type="button"
              variant="outline"
              className="h-6 rounded-sm px-2 text-[10px]"
              onClick={() => void handleCopy(curlSnippet, 'curlSnippet')}
            >
              {copiedTarget === 'curlSnippet' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copiedTarget === 'curlSnippet' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground/85">
            <code>{curlSnippet}</code>
          </pre>
        </div>

        <p className="text-[10px] text-muted-foreground/70">
          Dyno keeps your logical model stable while routing requests across local and cloud execution paths.
        </p>
      </div>
    </div>
  )
}
