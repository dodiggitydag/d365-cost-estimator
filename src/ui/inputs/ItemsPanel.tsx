import { useStore } from '../store';
import { STANDARD_ITEMS } from '../../engine';
import type { ItemCategory } from '../../engine/types';

const CATEGORIES: ItemCategory[] = ['payg-ms', 'licensing-ms', 'isv', 'custom'];

export function ItemsPanel() {
  const estimate = useStore((s) => s.estimate);
  const update = useStore((s) => s.update);

  return (
    <details className="section">
      <summary>Other cost items</summary>
      <div className="body">
        <p className="help">Built-in tenant-level items:</p>
        {STANDARD_ITEMS.map((def) => (
          <div className="row" key={def.id}>
            <input
              type="checkbox"
              checked={estimate.standardItems[def.id]?.enabled ?? false}
              onChange={(ev) =>
                update((e) => ({
                  ...e,
                  standardItems: {
                    ...e.standardItems,
                    [def.id]: {
                      ...(e.standardItems[def.id] ?? {}),
                      enabled: ev.target.checked,
                    },
                  },
                }))
              }
            />
            <span>{def.label}</span>
          </div>
        ))}
        <p className="help" style={{ marginTop: 10 }}>
          Custom items — ISVs, Fabric capacity, integration VMs, anything with a monthly
          price. These are yours to define; the examples ship with $0.
        </p>
        <div className="item-row muted" style={{ fontSize: 12 }}>
          <span>Name</span>
          <span>$/mo</span>
          <span>From</span>
          <span>To</span>
          <span />
        </div>
        {estimate.customItems.map((item) => (
          <div key={item.id}>
            <div className="item-row">
              <input
                type="text"
                value={item.name}
                onChange={(ev) =>
                  update((e) => ({
                    ...e,
                    customItems: e.customItems.map((x) =>
                      x.id === item.id ? { ...x, name: ev.target.value } : x,
                    ),
                  }))
                }
              />
              <input
                type="number"
                min={0}
                value={item.monthlyAmount}
                onChange={(ev) =>
                  update((e) => ({
                    ...e,
                    customItems: e.customItems.map((x) =>
                      x.id === item.id
                        ? { ...x, monthlyAmount: Math.max(0, parseFloat(ev.target.value) || 0) }
                        : x,
                    ),
                  }))
                }
              />
              <input
                type="number"
                min={1}
                value={item.fromMonth}
                onChange={(ev) =>
                  update((e) => ({
                    ...e,
                    customItems: e.customItems.map((x) =>
                      x.id === item.id ? { ...x, fromMonth: parseInt(ev.target.value) || 1 } : x,
                    ),
                  }))
                }
              />
              <input
                type="number"
                min={1}
                value={item.toMonth}
                onChange={(ev) =>
                  update((e) => ({
                    ...e,
                    customItems: e.customItems.map((x) =>
                      x.id === item.id ? { ...x, toMonth: parseInt(ev.target.value) || 1 } : x,
                    ),
                  }))
                }
              />
              <button
                className="small danger"
                onClick={() =>
                  update((e) => ({
                    ...e,
                    customItems: e.customItems.filter((x) => x.id !== item.id),
                  }))
                }
              >
                ✕
              </button>
            </div>
            <div className="row" style={{ marginTop: 0 }}>
              <select
                value={item.category}
                onChange={(ev) =>
                  update((e) => ({
                    ...e,
                    customItems: e.customItems.map((x) =>
                      x.id === item.id
                        ? { ...x, category: ev.target.value as ItemCategory }
                        : x,
                    ),
                  }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <button
          className="small"
          onClick={() =>
            update((e) => ({
              ...e,
              customItems: [
                ...e.customItems,
                {
                  id: `item-${Date.now()}`,
                  name: 'New item',
                  category: 'payg-ms',
                  monthlyAmount: 0,
                  fromMonth: 1,
                  toMonth: e.horizonMonths,
                },
              ],
            }))
          }
        >
          + custom item
        </button>
      </div>
    </details>
  );
}
