'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Circle, CircleSlash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ProjectInlineAlert,
  ProjectInsetPanel,
  ProjectSectionShell,
  ProjectStatusBadge,
} from '@/app/projects/_components/project-detail-primitives'
import type { ProjectPageViewModel } from '@/lib/data/project-page-view-model'

interface ProjectSetupSummaryCardProps {
  summary: ProjectPageViewModel
}

function getStatusPresentation(status: ProjectPageViewModel['setupJourney']['steps'][number]['status']) {
  if (status === 'done') {
    return {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      badge: <ProjectStatusBadge tone="success">Done</ProjectStatusBadge>,
    }
  }
  if (status === 'ready') {
    return {
      icon: <Circle className="h-4 w-4 text-blue-300" />,
      badge: <ProjectStatusBadge tone="neutral">Ready</ProjectStatusBadge>,
    }
  }
  if (status === 'blocked') {
    return {
      icon: <CircleSlash className="h-4 w-4 text-amber-300" />,
      badge: <ProjectStatusBadge tone="warning">Blocked</ProjectStatusBadge>,
    }
  }
  return {
    icon: <Circle className="h-4 w-4 text-muted-foreground/60" />,
    badge: <ProjectStatusBadge tone="neutral">Todo</ProjectStatusBadge>,
  }
}

export function ProjectSetupSummaryCard({ summary }: ProjectSetupSummaryCardProps) {
  const { setupJourney } = summary
  const [collapsed, setCollapsed] = useState(setupJourney.allComplete)

  useEffect(() => {
    if (setupJourney.allComplete) {
      setCollapsed(true)
    }
  }, [setupJourney.allComplete])

  const scrollToSection = (actionHref: string) => {
    const targetId = actionHref.replace(/^#/, '')
    if (!targetId) {
      return
    }
    const target = document.getElementById(targetId)
    if (!target) {
      return
    }
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    window.history.replaceState(null, '', `#${targetId}`)
  }

  return (
    <ProjectSectionShell
      title="First Success Journey"
      description={
        setupJourney.allComplete
          ? 'Succeeded. Collapse this card and keep working.'
          : 'Follow this sequence to reach your first successful Dyno request.'
      }
      action={
        <div className="flex items-center gap-1.5">
          <ProjectStatusBadge tone={setupJourney.allComplete ? 'success' : 'neutral'}>
            {setupJourney.allComplete
              ? 'Succeeded'
              : `${setupJourney.completedCount}/${setupJourney.totalCount} required steps`}
          </ProjectStatusBadge>
          <Button
            type="button"
            variant="outline"
            className="h-6 rounded-md border-border/55 px-2 text-[10px]"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <>
                Expand
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Collapse
                <ChevronUp className="ml-1 h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      }
    >
      {collapsed ? (
        <ProjectInlineAlert tone="success">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            First success journey succeeded.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/85">
            You can re-open this checklist anytime from the Expand button.
          </p>
        </ProjectInlineAlert>
      ) : (
        <>
      <div className="space-y-2">
        {setupJourney.steps.map((step, index) => {
          const statusPresentation = getStatusPresentation(step.status)
          return (
            <div
              key={step.key}
              className="rounded-md border border-border/50 bg-background/30 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">{statusPresentation.icon}</span>
                  <div>
                    <p className="text-[11px] font-medium text-foreground">
                      {index + 1}. {step.title}{' '}
                      {step.optional ? <span className="text-muted-foreground/75">(optional)</span> : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/85">{step.description}</p>
                    {step.blockerReason ? (
                      <p className="mt-1 text-[10px] text-amber-200/90">{step.blockerReason}</p>
                    ) : null}
                  </div>
                </div>
                {statusPresentation.badge}
              </div>
              {(step.status === 'blocked' || step.status === 'ready' || step.status === 'todo') && step.actionHref ? (
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 rounded-md border-border/55 px-2.5 text-[10px] font-medium"
                    onClick={() => scrollToSection(step.actionHref)}
                  >
                    {step.actionLabel}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <ProjectInsetPanel className="mt-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Completion</p>
        {setupJourney.allComplete && setupJourney.completionMessage ? (
          <p className="mt-1 text-[11px] text-foreground/90">{setupJourney.completionMessage}</p>
        ) : (
          <p className="mt-1 text-[11px] text-foreground/90">
            Complete all required steps above, then send one successful request to finish first-success onboarding.
          </p>
        )}
      </ProjectInsetPanel>
        </>
      )}
    </ProjectSectionShell>
  )
}
