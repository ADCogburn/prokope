const PHYSICAL_DIGITS = 15
const LOGICAL_DIGITS = 10

interface HlcState {
  physical: number
  logical: number
}

function encode(state: HlcState): string {
  return `${state.physical.toString().padStart(PHYSICAL_DIGITS, '0')}-${state.logical.toString().padStart(LOGICAL_DIGITS, '0')}`
}

/**
 * Creates a Hybrid-Logical-Clock generator: physical time plus a logical
 * counter, monotonic within the returned generator's own state. Never
 * produces a value that sorts earlier than the previous one it issued, even
 * if the system clock doesn't advance or moves backwards.
 */
export function createHlcGenerator(): () => string {
  let last: HlcState = { physical: 0, logical: 0 }

  return function nextHlc(): string {
    const physicalNow = Date.now()
    last =
      physicalNow > last.physical
        ? { physical: physicalNow, logical: 0 }
        : { physical: last.physical, logical: last.logical + 1 }
    return encode(last)
  }
}

export const nextHlc = createHlcGenerator()
