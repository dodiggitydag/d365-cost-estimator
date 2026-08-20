import { useStore } from '../store';

export function CopilotPanel() {
  const estimate = useStore((s) => s.estimate);
  const update = useStore((s) => s.update);

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
              onChange={(ev) =>
                update((e) => ({
                  ...e,
                  copilotAgents: e.copilotAgents.map((x) =>
                    x.id === a.id ? { ...x, name: ev.target.value } : x,
                  ),
                }))
              }
            />
            <input
              type="number"
              min={0}
              value={a.creditsPerMonth}
              onChange={(ev) =>
                update((e) => ({
                  ...e,
                  copilotAgents: e.copilotAgents.map((x) =>
                    x.id === a.id
                      ? { ...x, creditsPerMonth: Math.max(0, parseInt(ev.target.value) || 0) }
                      : x,
                  ),
                }))
              }
            />
            <input
              type="number"
              min={1}
              value={a.fromMonth}
              onChange={(ev) =>
                update((e) => ({
                  ...e,
                  copilotAgents: e.copilotAgents.map((x) =>
                    x.id === a.id ? { ...x, fromMonth: parseInt(ev.target.value) || 1 } : x,
                  ),
                }))
              }
            />
            <input
              type="number"
              min={1}
              value={a.toMonth}
              onChange={(ev) =>
                update((e) => ({
                  ...e,
                  copilotAgents: e.copilotAgents.map((x) =>
                    x.id === a.id ? { ...x, toMonth: parseInt(ev.target.value) || 1 } : x,
                  ),
                }))
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
        <div className="row">
          <label>Packs already owned</label>
          <input
            type="number"
            min={0}
            value={estimate.copilotPacksOwned}
            onChange={(ev) =>
              update((e) => ({
                ...e,
                copilotPacksOwned: Math.max(0, parseInt(ev.target.value) || 0),
              }))
            }
          />
        </div>
      </div>
    </details>
  );
}
