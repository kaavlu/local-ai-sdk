'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ProjectInsetPanel,
  ProjectSectionShell,
} from '@/app/projects/_components/project-detail-primitives'
import { cn } from '@/lib/utils'

interface ProjectIntegrationCardProps {
  sdkSnippet: string
  hasApiKeys: boolean
  className?: string
}

type CopyTarget = 'sdkSnippet'
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
    <div className="overflow-x-auto rounded-b-md bg-background/90 px-3 py-2 font-mono text-[12px] leading-6">
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
        <span key={`text-${lineIndex}-${cursor}`} className="text-foreground/90">
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
      <span key={`tail-${lineIndex}-${cursor}`} className="text-foreground/90">
        {line.slice(cursor)}
      </span>,
    )
  }
  if (!tokens.length) {
    tokens.push(
      <span key={`empty-${lineIndex}`} className="text-foreground/90">
        {' '}
      </span>,
    )
  }
  return tokens
}

function getTokenClass(token: string, language: CodeLanguage): string {
  if (token.startsWith('//') || token.startsWith('#')) return 'text-muted-foreground/75 italic'
  if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) return 'text-foreground/85'
  if (/^\d+(\.\d+)?$/.test(token)) return 'text-primary/80'
  if (language === 'shell' && /^--?[A-Za-z-]+$/.test(token)) return 'text-primary/80'
  if (language === 'shell' && token.startsWith('$')) return 'text-primary/90'
  if (language === 'typescript' && TS_KEYWORDS.has(token)) return 'text-primary/90'
  if (language === 'typescript' && /^[A-Z]/.test(token)) return 'text-foreground'
  return 'text-foreground/90'
}

export function ProjectIntegrationCard({
  sdkSnippet,
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
      description="Primary path: @dynosdk/ts GA methods (`Dyno.init`, `embedText`/`embedTexts`, `getStatus`, `shutdown`) with local-first execution."
      className={cn(className)}
    >
      <div className="space-y-3">
        <ProjectInsetPanel className="p-0">
          <div className="flex items-center justify-between border-b border-border/45 px-3 py-2">
            <p className="font-mono text-[10px] text-muted-foreground/80">TypeScript (@dynosdk/ts)</p>
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
        </ProjectInsetPanel>

        <ProjectInsetPanel>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Authentication</p>
          <p className="mt-1 text-[11px] text-foreground/90">
            Set DYNO_PROJECT_API_KEY for SDK requests.
            {hasNoApiKeys ? ' No active keys exist yet, so requests will fail authentication until you create one.' : ''}
          </p>
        </ProjectInsetPanel>
      </div>
    </ProjectSectionShell>
  )
}
