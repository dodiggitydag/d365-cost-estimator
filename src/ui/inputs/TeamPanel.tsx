import { useStore } from '../store';
import { money, priceEntry } from '../../engine';
import { NumberRow } from './NumberRow';

export function TeamPanel() {
  const estimate = useStore((s) => s.estimate);
  const config = useStore((s) => s.config);
  const update = useStore((s) => s.update);

  const agentPrice = config.pricing.entries.find((e) => e.id === 'ado.pipelines')
    ? priceEntry(config.pricing, 'ado.pipelines').value
    : 0;
  const agents = estimate.team.hostedAgents;

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
        <NumberRow
          label="Microsoft-hosted ADO agents"
          value={agents}
          onChange={(n) => update((e) => ({ ...e, team: { ...e.team, hostedAgents: n } }))}
          help="parallel build jobs"
        />
        <p className="help">
          Consulting seats and agents size the Azure DevOps rows in Other cost items —{' '}
          {agents} × {money(agentPrice)}/mo = <strong>{money(agents * agentPrice)}/mo</strong>{' '}
          for agents. Those rows are flat once seeded, so update the amount there if you
          change these numbers.
        </p>
      </div>
    </details>
  );
}
