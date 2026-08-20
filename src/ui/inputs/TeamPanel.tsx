import { useStore } from '../store';

export function TeamPanel() {
  const estimate = useStore((s) => s.estimate);
  const update = useStore((s) => s.update);

  const num = (
    label: string,
    value: number,
    set: (n: number) => void,
    help?: string,
  ) => (
    <div className="row">
      <label>{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(ev) => set(Math.max(0, parseInt(ev.target.value) || 0))}
      />
      {help && <span className="muted">{help}</span>}
    </div>
  );

  return (
    <details className="section" open>
      <summary>Team &amp; settings</summary>
      <div className="body">
        {num('Concurrent developers', estimate.team.concurrentDevs, (n) =>
          update((e) => ({ ...e, team: { ...e.team, concurrentDevs: n } })),
        )}
        <p className="help">Drives the number of DEV environments (one per developer).</p>
        {num('Functional consultants', estimate.team.functionalConsultants, (n) =>
          update((e) => ({ ...e, team: { ...e.team, functionalConsultants: n } })),
        )}
        {num('Solution architects', estimate.team.solutionArchitects, (n) =>
          update((e) => ({ ...e, team: { ...e.team, solutionArchitects: n } })),
        )}
        <p className="help">Consulting seats drive Azure DevOps license counts.</p>
        {num('PROD lead time (months)', estimate.settings.prodLeadMonths, (n) =>
          update((e) => ({ ...e, settings: { ...e.settings, prodLeadMonths: n } })),
          'before first go-live',
        )}
      </div>
    </details>
  );
}
