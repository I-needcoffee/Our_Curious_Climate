# Project Documentation: Static Preset Architecture

## The "Preset Grid" System
ClimateCompare has moved from a dynamic, drag-and-drop grid to a stable, preset-based layout system. This ensures a jitter-free experience and predictable scaling across all screen sizes.

### Core Layout Components:
1. **`SingleModeLayout.tsx`**: 
   - Handles the single-city dashboard view.
   - **Modes**:
     - `hero-left`: A large full-height card on the left with a 3x2 grid on the right.
     - `grid-4x2`: A uniform 4x2 grid of 8 cards.
     - `focus-deep`: A 2-column layout for detailed chart analysis.
   - **Pagination**: If more cards are added than a preset can hold, they cleanly overflow into a new "page" (a vertical continuation of the grid).

2. **`ComparisonModeLayout.tsx`**:
   - Handles the 2-city comparison view.
   - **Left Column**: A full-height Difference Chart (Baseline vs comparison).
   - **Right Column**: A horizontal scroller of "Category Columns". Each column stacks the Baseline and Comparison charts vertically for a specific chart type.

## Visual Design Standards
- **Standardized Proportions**: Desktop layouts target a 16:9 overall container aspect ratio.
- **ChartHeader Component**: Every chart card uses the `ChartHeader` component to ensure consistent titles, dropdowns, and removal buttons.
- **Export Mode**: A specialized UI state that strips away borders, shadows, and navigation chrome to prepare the dashboard for high-quality PDF/JPEG export.
- **Bar Charts**: Rendered with 60% opacity for a softer look, drawing from minimum to maximum values rather than from zero.
- **Surfaces**: No border lines. Cards, menus and modals separate from the page with the soft glow utilities in `index.css` (`glow-sm` / `glow-md` / `glow-lg` / `glow-xl`). Use tinted fills (`bg-gray-50`, `bg-gray-100`) for inner groupings instead of dividers.
- **Shape**: Controls, chips, segmented tracks and inputs are pill-shaped (`rounded-full`); cards are `rounded-2xl`, modals `rounded-3xl`.
- **Chart-first sizing**: Charts drive card layout; titles, legends and footnotes take the space left over and must stay compact (single-row headers, 14–18px legend bars, one-line truncating footnotes). Explorer SVGs keep a 350-unit width and pick a viewBox height from their box via `useExplorerSvgFrame`, so they always span the card width in grid, focus and side-by-side presets. The 4×2 stats sidebar is a left-aligned list of tight label–value pairs, not far-justified columns or hero numbers.
- **Typography**: Card titles and legends scale with the card via container queries (`@container` on slot shells); slide exports get a modest bump through the `export:` variant (`data-export-mode` on `#dashboard-area`). SVG text is sized in rendered px through `useSvgRenderScale` / `useExplorerSvgFrame` + `svgTextUnits` / `explorerSvgTypography`; on small renders it shrinks gently (to ~80%) rather than crowding the plot. Prefer thinning labels (strides, alternate legend labels via container queries) over shrinking text; heatmap cell values use `fitHeatmapCellLabels`.
- **Export clone safety**: html-to-image copies resolved px widths and margins into the clone, so avoid zero-slack rows built from `ml-auto` + `flex-wrap`; use a `grid-cols-[minmax(0,1fr)_auto]` row instead.
- **Chart text color**: Defaults to `CHART_TEXT_AUTO`: axes use one ink per theme (`chartAxisInk`). Heatmap cell values are always near-black (`heatmapCellInk`) in Inter Semibold (`HEATMAP_CELL_FONT_WEIGHT` 600) so the numbers stay readable on the cell color. Cell values stay on whenever they fit the cell (≤85% of row height) and render at ≥6px; they drop only when they would swallow the color.
- **Chart-internal annotations**: Sun path and wind rose rim labels share `ringLabels.ts`: the nearest edge of every label sits the same rendered gap off the outer ring (`text-anchor` / `dy` change with angle so N and E match). Cardinal points 9–13px, grid labels 7–10.5px in a muted grid ink. No text is drawn over the sun positions: the solstice/equinox arcs are explained in the legend footnote instead. The wind rose uses the same stepped pill `InteractiveLegend` as the other cards.

## State Management
- **`slots`**: An array of `ChartConfig` objects determining the order and type of charts in single-city mode.
- **`comparisonSlots`**: An array of `ChartConfig` objects for the comparison-mode columns.
- **Persistent Selection**: Chart type selections and variable choices are handled via unified `handleChangeType` and `handleRemoveChart` callbacks.

## Roadmap & Progress
**Completed:**
- [x] Removed `react-grid-layout` and `ScaledWrapper.tsx` redundancy.
- [x] Standardized all chart components (SunPath, DataExplorer, etc.) with `ChartHeader`.
- [x] Implemented `SingleModeLayout` presets and pagination.
- [x] Implemented `ComparisonModeLayout` with Difference/Stacked columns.
- [x] Fixed "Maximum update depth exceeded" errors by moving to static CSS grids.
- [x] Optimized export functionality for fixed-aspect-ratio containers.
- [x] Future Weather data support via zip loading and IndexedDB caching.

**Next Steps:**
- [ ] Refine the "Empty Slot" styling to be less intrusive.
- [ ] Implement a "Reset Layout" button for users to return to defaults.
- [ ] Expand Comparative view to support more than 2 files (if requested in future).
