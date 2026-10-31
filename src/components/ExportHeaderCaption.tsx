/** Prefer category for compact export titles; use the variable name when category is missing or generic. */
export function exportCaptionShort(category: string | undefined, fullName: string): string {
  const c = category?.trim();
  return !c || c === 'Other' ? fullName : c;
}

/** Export card title lines: same short/long pattern as `ExportHeaderCaption`, with display unit appended. */
export function exportCaptionLinesWithUnit(
  category: string | undefined,
  variableName: string,
  displayUnit: string
): { short: string; long: string } {
  const u = displayUnit?.trim();
  const suffix = u ? ` (${u})` : '';
  return {
    short: `${exportCaptionShort(category, variableName)}${suffix}`,
    long: `${variableName}${suffix}`,
  };
}

const EXPORT_TITLE_CLASS =
  'text-sm font-bold leading-tight text-gray-900 @sm:text-[15px] @2xl:text-base';
const EXPORT_SUBTITLE_CLASS = 'text-xs font-semibold leading-tight text-gray-600 @2xl:text-[13px]';

/**
 * Slide-ready export card title. The first line is the bold card title; any further lines are
 * quieter subtitles. Wide cards (`@md`) show the full variable name, compact cards the category.
 */
export function ExportHeaderCaption({
  lines,
}: {
  lines: readonly { short: string; long: string }[];
}) {
  return (
    <div className="min-w-0 flex-1 text-left">
      {lines.map((line, i) => (
        <p
          key={i}
          className={`min-w-0 truncate ${i === 0 ? EXPORT_TITLE_CLASS : EXPORT_SUBTITLE_CLASS}`}
          title={line.long !== line.short ? line.long : undefined}
        >
          {line.long !== line.short ? (
            <>
              <span className="@md:hidden">{line.short}</span>
              <span className="hidden @md:inline">{line.long}</span>
            </>
          ) : (
            line.short
          )}
        </p>
      ))}
    </div>
  );
}
