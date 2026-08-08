# Per-subject header colors use a curated palette, not free-form picking

_Superseded by [ADR-0014](0014-single-accent-color-replaces-subject-palette.md): the curated palette described below was never persisted and has been replaced by one fixed accent color for all subjects._

For per-subject header color customization, we considered a free-form color picker (any hex value) versus a curated set of ~8-10 preset swatches. We chose curated. A free-form picker opens a contrast problem — a light subject color paired with fixed white header text can become unreadable — which would require either a contrast-checking algorithm to flip text color automatically, or constraining the picker after the fact. A curated palette (pre-selected for contrast against header text) sidesteps the problem entirely while still giving teachers real customization.
