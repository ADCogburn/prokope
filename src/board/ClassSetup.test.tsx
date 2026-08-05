import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ClassSetup } from './ClassSetup'
import { db } from '../db/schema'

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('ClassSetup', () => {
  it('creates a class for the given user and calls onCreated with it', async () => {
    const onCreated = vi.fn()

    render(<ClassSetup userId="user-1" onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText(/class name/i), {
      target: { value: "Ms. Alvarez's Class" },
    })
    fireEvent.click(screen.getByRole('button', { name: /create class/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    const created = onCreated.mock.calls[0][0]
    expect(created.user_id).toBe('user-1')
    expect(created.name).toBe("Ms. Alvarez's Class")

    const rows = await db.class.toArray()
    expect(rows).toHaveLength(1)
  })

  it('does not submit a blank name', async () => {
    const onCreated = vi.fn()

    render(<ClassSetup userId="user-1" onCreated={onCreated} />)
    fireEvent.click(screen.getByRole('button', { name: /create class/i }))

    expect(onCreated).not.toHaveBeenCalled()
    expect(await db.class.count()).toBe(0)
  })

  it('trims whitespace from the name', async () => {
    const onCreated = vi.fn()

    render(<ClassSetup userId="user-1" onCreated={onCreated} />)
    fireEvent.change(screen.getByLabelText(/class name/i), {
      target: { value: '  Homeroom  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create class/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated.mock.calls[0][0].name).toBe('Homeroom')
  })
})
