import type { ScheduleWarning } from '../engine/types';

/**
 * Schedule problems that produce no error and no cost — an empty environment row
 * looks identical to one the user turned off, so it has to be called out.
 */
export function Warnings({
  warnings,
  title = 'Check the schedule',
}: {
  warnings: ScheduleWarning[];
  title?: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <div className="warnings" role="status">
      <strong>
        ⚠ {title} ({warnings.length})
      </strong>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>{w.message}</li>
        ))}
      </ul>
    </div>
  );
}
