import { useStore } from '../store';
import { patchById } from '../../model/estimate';
import type { CopilotAgent } from '../../engine/types';
import { NumberRow } from './NumberRow';

export function CopilotPanel() {
  const estimate = useStore((s) => s.estimate);
  const update = useStore((s) => s.update);

  const patchAgent = (id: string, patch: Partial<CopilotAgent>) =>
    update((e) => ({ ...e, copilotAgents: patchById(e.copilotAgents, id, patch) }));

  return (
    <details className="section">
      <summary>Copilot Studio agents</summary>
      <div className="body">
        <p className="help">
          Each agent consumes credits monthly. Packs required are rounded up; entitled
          credits from Premium/attach users and owned packs are netted out.
        </p>
        <div className="item-row muted" style={{ fontSize: 12 }}>
          <span>Agent</span>
          <span>Credits/mo</span>
          <span>From</span>
          <span>To</span>
          <span />
        </div>
        {estimate.copilotAgents.map((a) => (
          <div className="item-row" key={a.id}>
            <input
              type="text"
              value={a.name}
              onChange={(ev) => patchAgent(a.id, { name: ev.target.value })}
            />
            <input
              type="number"
              min={0}
              value={a.creditsPerMonth}
              onChange={(ev) =>
                patchAgent(a.id, {
                  creditsPerMonth: Math.max(0, parseInt(ev.target.value) || 0),
                })
              }
            />
            <input
              type="number"
              min={1}
              value={a.fromMonth}
              onChange={(ev) =>
                patchAgent(a.id, { fromMonth: Math.max(1, parseInt(ev.target.value) || 1) })
              }
            />
            <input
              type="number"
              min={1}
              value={a.toMonth}
              onChange={(ev) =>
                patchAgent(a.id, { toMonth: Math.max(1, parseInt(ev.target.value) || 1) })
              }
            />
            <button
              className="small danger"
              onClick={() =>
                update((e) => ({
                  ...e,
                  copilotAgents: e.copilotAgents.filter((x) => x.id !== a.id),
                }))
              }
            >
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <button
            className="small"
            onClick={() =>
              update((e) => ({
                ...e,
                copilotAgents: [
                  ...e.copilotAgents,
                  {
                    id: `agent-${Date.now()}`,
                    name: 'New agent',
                    creditsPerMonth: 10000,
                    fromMonth: 1,
                    toMonth: e.horizonMonths,
                  },
                ],
              }))
            }
          >
            + agent
          </button>
        </div>
        <NumberRow
          label="Packs already owned"
          value={estimate.copilotPacksOwned}
          onChange={(n) => update((e) => ({ ...e, copilotPacksOwned: n }))}
        />
      </div>
    </details>
  );
}
