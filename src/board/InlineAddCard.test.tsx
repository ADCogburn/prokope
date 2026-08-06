import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { InlineAddCard } from './InlineAddCard'

describe('InlineAddCard', () => {
  it('renders a collapsed "+" button with the given label', () => {
    render(<InlineAddCard addLabel="Add subject">{() => null}</InlineAddCard>)

    expect(screen.getByRole('button', { name: '+ Add subject' })).toBeInTheDocument()
  })

  it('expands to the render-prop content when clicked, replacing the button', () => {
    render(
      <InlineAddCard addLabel="Add subject">{() => <div>form content</div>}</InlineAddCard>,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }))

    expect(screen.getByText('form content')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add subject' })).not.toBeInTheDocument()
  })

  it('passes a collapse callback that returns to the collapsed button', () => {
    render(
      <InlineAddCard addLabel="Add subject">
        {({ collapse }) => (
          <button type="button" onClick={collapse}>
            Cancel
          </button>
        )}
      </InlineAddCard>,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: '+ Add subject' })).toBeInTheDocument()
  })

  it('calls the children render-prop with a fresh collapse each expand', () => {
    const renderProp = vi.fn(() => <div>content</div>)
    render(<InlineAddCard addLabel="Add subject">{renderProp}</InlineAddCard>)

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }))

    expect(renderProp).toHaveBeenCalledWith({ collapse: expect.any(Function) })
  })
})
