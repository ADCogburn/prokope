import type { SubjectRow } from '../db/schema'
import './SubjectPickerModal.css'

interface SubjectPickerModalProps {
  subjects: SubjectRow[]
  onSelectSubject: (subjectId: string) => void
  onClose: () => void
}

/**
 * The app's first modal, per #56/#61: lists every subject in the class so a
 * teacher can jump straight to its curriculum. Per ADR 0003, this pattern is
 * reserved for picking among existing items -- data-entry keeps using the
 * inline-card pattern instead. Purely presentational: selecting a row and
 * closing (backdrop, close button) are both left to the caller.
 */
export function SubjectPickerModal({ subjects, onSelectSubject, onClose }: SubjectPickerModalProps) {
  return (
    <div className="subject-picker-modal__backdrop" onClick={onClose}>
      <div
        className="subject-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add lessons"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="subject-picker-modal__header">
          <h2>Add lessons</h2>
          <button type="button" aria-label="Close" className="subject-picker-modal__close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <ul className="subject-picker-modal__list">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <button
                type="button"
                className="subject-picker-modal__item"
                onClick={() => onSelectSubject(subject.id)}
              >
                {subject.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
