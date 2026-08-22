import { useStore } from '../store';
import { NumberRow } from './NumberRow';

export function TeamPanel() {
  const estimate = useStore((s) => s.estimate);
  const update = useStore((s) => s.update);

  return (
    <details className="section">
      <summary>Team</summary>
      <div className="body">
        <NumberRow
          label="Concurrent developers"
          value={estimate.team.concurrentDevs}
          onChange={(n) => update((e) => ({ ...e, team: { ...e.team, concurrentDevs: n } }))}
        />
        <p className="help">Drives the number of DEV environments (one per developer).</p>
        <NumberRow
          label="Functional consultants"
          value={estimate.team.functionalConsultants}
          onChange={(n) =>
            update((e) => ({ ...e, team: { ...e.team, functionalConsultants: n } }))
          }
        />
        <NumberRow
          label="Solution architects"
          value={estimate.team.solutionArchitects}
          onChange={(n) =>
            update((e) => ({ ...e, team: { ...e.team, solutionArchitects: n } }))
          }
        />
        <p className="help">Consulting seats drive Azure DevOps license counts.</p>
      </div>
    </details>
  );
}
