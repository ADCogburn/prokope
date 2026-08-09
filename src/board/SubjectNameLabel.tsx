import { useState } from 'react'
import type { SubjectRow } from '../db/schema'
import { renameSubject } from '../db'
import { ContextMenu } from './ContextMenu'
import { InlineRenameField } from './InlineRenameField'
import './SubjectNameLabel.css'

interface SubjectNameLabelProps {
  subject: SubjectRow
  tag?: 'h1' | 'span'
  className?: string
  showPencil?: boolean
  onNavigateToCurriculum?: () => void
  onRequestRemove?: () => void
}

/**
 * A subject's name wherever it's shown as a plain label rather than inside
 * an already-editable list -- the class-board carousel's per-panel header,
 * and the Curriculum page's own header. Right-click -> "Rename subject" ->
 * InlineRenameField, per #33/ADR-0006/ADR-0003. Shared between both call
 * sites so the rename behavior (validation, context-menu wiring, commit/
 * cancel) isn't duplicated; `tag` lets each site keep its own heading level
 * (Curriculum's <h1> vs. the board panel header's <span>).
 *
 * ContextMenu renders as a sibling, not a child, of the heading/span: both
 * h1 and span are phrasing/heading content and can't legally contain
 * ContextMenu's block-level markup, so this returns a Fragment (matching
 * how ProgressCell/StudentRosterRow already render their menu as a sibling
 * of the element that triggers it).
 *
 * `showPencil` (per #102) adds a visible pencil-icon button next to the name
 * as a second, discoverable way to reach the same edit mode -- for the
 * Curriculum page header, where right-click's hidden affordance is easy to
 * miss. It mirrors the pencil-toggle pattern used by SubjectReorder.
 *
 * `onNavigateToCurriculum`/`onRequestRemove` (#193) are optional so each call
 * site opts in independently: when present they append "Edit curriculum" /
 * "Remove subject" items, in that order, after "Rename subject" in the same
 * ContextMenu. Only the Class Board call site wires either in today; the
 * dialog itself stays owned by the caller (the same "child reports the
 * request up, parent owns the dialog" pattern as
 * StudentRosterRow/ProgressCell), so this component never imports
 * RemoveSubjectDialog.
 */
export function SubjectNameLabel({
  subject,
  tag = 'span',
  className,
  showPencil = false,
  onNavigateToCurriculum,
  onRequestRemove,
}: SubjectNameLabelProps) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const Tag = tag

  return (
    <>
      <Tag
        className={className}
        onContextMenu={(event) => {
          if (editing) return
          event.preventDefault()
          setMenuPosition({ x: event.clientX, y: event.clientY })
        }}
      >
        {editing ? (
          <InlineRenameField
            ariaLabel="Subject name"
            initialValue={subject.name}
            onSubmit={async (trimmed) => {
              await renameSubject(subject.id, trimmed)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          subject.name
        )}
      </Tag>
      {showPencil && !editing && (
        <button
          type="button"
          aria-label="Rename subject"
          className="subject-name-label__pencil"
          onClick={() => setEditing(true)}
        >
          <span aria-hidden="true">✎</span>
        </button>
      )}
      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          onClose={() => setMenuPosition(null)}
          items={[
            { label: 'Rename subject', onSelect: () => setEditing(true) },
            ...(onNavigateToCurriculum
              ? [{ label: 'Edit curriculum', onSelect: onNavigateToCurriculum }]
              : []),
            ...(onRequestRemove ? [{ label: 'Remove subject', onSelect: onRequestRemove }] : []),
          ]}
        />
      )}
    </>
  )
}
