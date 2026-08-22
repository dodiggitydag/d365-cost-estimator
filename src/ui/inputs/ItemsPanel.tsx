import { useStore } from '../store';
import { STANDARD_ITEMS } from '../../engine';
import { patchById } from '../../model/estimate';
import type { CustomCostItem, ItemCategory } from '../../engine/types';

const CATEGORIES: ItemCategory[] = ['payg-ms', 'licensing-ms', 'isv', 'custom'];

export function ItemsPanel() {
  const estimate = useStore((s) => s.estimate);
  const update = useStore((s) => s.update);

  const patchItem = (id: string, patch: Partial<CustomCostItem>) =>
    update((e) => ({ ...e, customItems: patchById(e.customItems, id, patch) }));

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
                onChange={(ev) => patchItem(item.id, { name: ev.target.value })}
              />
              <input
                type="number"
                min={0}
                value={item.monthlyAmount}
                onChange={(ev) =>
                  patchItem(item.id, {
                    monthlyAmount: Math.max(0, parseFloat(ev.target.value) || 0),
                  })
                }
              />
              <input
                type="number"
                min={1}
                value={item.fromMonth}
                onChange={(ev) =>
                  patchItem(item.id, { fromMonth: Math.max(1, parseInt(ev.target.value) || 1) })
                }
              />
              <input
                type="number"
                min={1}
                value={item.toMonth}
                onChange={(ev) =>
                  patchItem(item.id, { toMonth: Math.max(1, parseInt(ev.target.value) || 1) })
                }
              />
              <button
                className="small danger"
                title="Remove this cost item"
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
                  patchItem(item.id, { category: ev.target.value as ItemCategory })
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
          title="Add a monthly cost the catalog doesn't cover — ISV licensing, Fabric capacity, integration VMs…"
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
