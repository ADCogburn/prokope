/**
 * How many unit columns fit within a container of `containerWidth`, given
 * each column is `columnWidth` wide, per #109 (prefactor for #106). Plain
 * width-fitting math, no ResizeObserver/DOM -- callers own measuring the
 * container the same way ClassBoard already measures its own panel width.
 * Always at least 1: a container narrower than a single column still shows
 * one (possibly overflowing) column rather than showing none.
 */
export function countVisibleUnitColumns(containerWidth: number, columnWidth: number): number {
  if (columnWidth <= 0 || containerWidth <= 0) return 1
  return Math.max(1, Math.floor(containerWidth / columnWidth))
}
