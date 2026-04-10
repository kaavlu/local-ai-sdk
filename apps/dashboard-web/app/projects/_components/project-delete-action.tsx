'use client'

import { useActionState, useState } from 'react'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type DeleteProjectState = {
  status: 'idle' | 'error'
  message?: string
}

const initialState: DeleteProjectState = { status: 'idle' }

interface ProjectDeleteActionProps {
  projectName: string
  action: (state: DeleteProjectState) => Promise<DeleteProjectState>
}

export function ProjectDeleteAction({ projectName, action }: ProjectDeleteActionProps) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState(action, initialState)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="h-8 rounded-sm border-destructive/40 px-3 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          Delete Project
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-sm gap-3 border-border/50 bg-card p-4">
        <AlertDialogHeader className="gap-1.5">
          <AlertDialogTitle className="text-[13px] font-semibold tracking-tight">
            Delete project
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[11px] leading-relaxed text-muted-foreground/80">
            This will permanently remove <span className="text-foreground">{projectName}</span> and
            its configuration.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={formAction}>
          {state.status === 'error' && state.message ? (
            <p className="mb-2 rounded-sm border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
              {state.message}
            </p>
          ) : null}

          <AlertDialogFooter className="gap-2 sm:justify-end">
            <AlertDialogCancel
              disabled={isPending}
              className="h-8 rounded-sm px-3 text-[11px] font-medium"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="submit"
              variant="destructive"
              className="h-8 rounded-sm px-3 text-[11px] font-medium"
              disabled={isPending}
            >
              {isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
