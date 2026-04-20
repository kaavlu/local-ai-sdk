'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectSectionShell } from '@/app/projects/_components/project-detail-primitives'
import { cn } from '@/lib/utils'

interface ProjectIntegrationCardProps {
  sdkSnippet: string
  baseUrl: string
  openAiSnippet: string
  curlSnippet: string
  hasApiKeys: boolean
  className?: string
}

type CopyTarget = 'sdkSnippet' | 'baseUrl' | 'openAiSnippet' | 'curlSnippet'
type CodeLanguage = 'typescript' | 'shell'

const TS_KEYWORDS = new Set([
  'import',
  'from',
  'const',
  'let',
  'var',
  'new',
  'await',
  'return',
  'if',
  'else',
  'for',
  'while',
  'true',
  'false',
  'null',
  'undefined',
])

function renderHighlightedCode(code: string, language: CodeLanguage): ReactNode {
  const lines = code.split('\n')
  return (
    <div className="overflow-x-auto rounded-b-lg bg-[#050712] px-3 py-2.5 font-mono text-[12px] leading-7">
      {lines.map((line, index) => (
        <div key={`${language}-${index}`} className="grid grid-cols-[2ch_1fr] gap-4 whitespace-pre">
          <span className="select-none text-right text-[#5c6177]">{index + 1}</span>
          <span>{tokenizeCodeLine(line, language, index)}</span>
        </div>
      ))}
    </div>
  )
}

function tokenizeCodeLine(line: string, language: CodeLanguage, lineIndex: number): ReactNode[] {
  const tokens: ReactNode[] = []
  const pattern =
    /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`|\/\/.*|#[^\n]*|\b\d+(\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|--?[A-Za-z-]+|\$[A-Za-z_][A-Za-z0-9_]*)/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) {
      tokens.push(
        <span key={`text-${lineIndex}-${cursor}`} className="text-[#d6def8]">
          {line.slice(cursor, match.index)}
        </span>,
      )
    }
    const token = match[0]
    tokens.push(
      <span key={`token-${lineIndex}-${match.index}`} className={getTokenClass(token, language)}>
        {token}
      </span>,
    )
    cursor = match.index + token.length
  }
  if (cursor < line.length) {
    tokens.push(
      <span key={`tail-${lineIndex}-${cursor}`} className="text-[#d6def8]">
        {line.slice(cursor)}
      </span>,
    )
  }
  if (!tokens.length) {
    tokens.push(
      <span key={`empty-${lineIndex}`} className="text-[#d6def8]">
        {' '}
      </span>,
    )
  }
  return tokens
}

function getTokenClass(token: string, language: CodeLanguage): string {
  if (token.startsWith('//') || token.startsWith('#')) return 'text-[#6e738a] italic'
  if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) return 'text-[#84b8ff]'
  if (/^\d+(\.\d+)?$/.test(token)) return 'text-[#ff9f66]'
  if (language === 'shell' && /^--?[A-Za-z-]+$/.test(token)) return 'text-[#ff9f66]'
  if (language === 'shell' && token.startsWith('$')) return 'text-[#c792ea]'
  if (language === 'typescript' && TS_KEYWORDS.has(token)) return 'text-[#c792ea]'
  if (language === 'typescript' && /^[A-Z]/.test(token)) return 'text-[#82aaff]'
  return 'text-[#d6def8]'
}

export function ProjectIntegrationCard({
  sdkSnippet,
  baseUrl,
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
    <ProjectSectionShell
      title="Integration"
      description="Primary path: @dyno/sdk-ts GA methods (`Dyno.init`, `embedText`/`embedTexts`, `getStatus`, `shutdown`) with local-first execution. Below: optional OpenAI-compatible HTTP API for sandbox, demos, and tooling."
      className={cn(className)}
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-border/45 bg-background/35">
          <div className="flex items-center justify-between border-b border-border/45 px-3 py-2">
            <p className="font-mono text-[10px] text-muted-foreground/80">TypeScript (@dyno/sdk-ts)</p>
            <Button
              type="button"
              variant="outline"
              className="h-6 rounded-md border-border/55 px-2 text-[10px]"
              onClick={() => void handleCopy(sdkSnippet, 'sdkSnippet')}
            >
              {copiedTarget === 'sdkSnippet' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copiedTarget === 'sdkSnippet' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          {renderHighlightedCode(sdkSnippet, 'typescript')}
        </div>

        <div className="rounded-lg border border-border/45 bg-background/30 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Authentication</p>
          <p className="mt-1 text-[11px] text-foreground/90">
            For the GA SDK path, set DYNO_PROJECT_API_KEY.
            {' '}DYNO_API_KEY below is only for the optional hosted OpenAI-compatible snippets.
            {hasNoApiKeys ? ' No active keys exist yet, so requests will fail authentication until you create one.' : ''}
          </p>
        </div>

        <div className="rounded-lg border border-border/45 bg-background/30 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Optional hosted compatibility</p>
          <p className="mt-1 text-[11px] text-foreground/90">
            Use these OpenAI-compatible snippets only for sandbox, demos, or tooling compatibility checks.
          </p>
        </div>

        <div className="rounded-lg border border-border/45 bg-background/35 px-3 py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-foreground/90">Base URL</p>
            <Button
              type="button"
              variant="outline"
              className="h-6 rounded-md border-border/55 px-2 text-[10px]"
              onClick={() => void handleCopy(baseUrl, 'baseUrl')}
            >
              {copiedTarget === 'baseUrl' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copiedTarget === 'baseUrl' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          <code title={baseUrl} className="block truncate font-mono text-[11px] text-foreground/90">
            {baseUrl}
          </code>
        </div>

        <div className="rounded-lg border border-border/45 bg-background/35">
          <div className="flex items-center justify-between border-b border-border/45 px-3 py-2">
            <p className="font-mono text-[10px] text-muted-foreground/80">
              TypeScript (OpenAI SDK, optional)
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-6 rounded-md border-border/55 px-2 text-[10px]"
              onClick={() => void handleCopy(openAiSnippet, 'openAiSnippet')}
            >
              {copiedTarget === 'openAiSnippet' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copiedTarget === 'openAiSnippet' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          {renderHighlightedCode(openAiSnippet, 'typescript')}
        </div>

        <div className="rounded-lg border border-border/45 bg-background/35">
          <div className="flex items-center justify-between border-b border-border/45 px-3 py-2">
            <p className="font-mono text-[10px] text-muted-foreground/80">cURL (optional)</p>
            <Button
              type="button"
              variant="outline"
              className="h-6 rounded-md border-border/55 px-2 text-[10px]"
              onClick={() => void handleCopy(curlSnippet, 'curlSnippet')}
            >
              {copiedTarget === 'curlSnippet' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copiedTarget === 'curlSnippet' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          {renderHighlightedCode(curlSnippet, 'shell')}
        </div>

        <p className="text-[10px] text-muted-foreground/72">
          Local vs cloud execution is decided in the SDK/runtime on the user&apos;s device. Low-level runtime client calls are advanced/internal; the default contract is the GA SDK surface shown above.
        </p>
      </div>
    </ProjectSectionShell>
  )
}
