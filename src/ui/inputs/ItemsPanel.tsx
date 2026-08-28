import { useStore } from '../store';
import { patchById } from '../../model/estimate';
import type { CustomCostItem, ItemCategory } from '../../engine/types';

const CATEGORIES: ItemCategory[] = ['payg-ms', 'licensing-ms', 'isv', 'custom'];

export function ItemsPanel() {
  const estimate = useStore((s) => s.estimate);
  const update = useStore((s) => s.update);

  const patchItem = (id: string, patch: Partial<CustomCostItem>) =>
    update((e) => ({ ...e, customItems: patchById(e.customItems, id, patch) }));

  const moveItem = (id: string, dir: -1 | 1) =>
    update((e) => {
      const idx = e.customItems.findIndex((x) => x.id === id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= e.customItems.length) return e;
      const items = [...e.customItems];
      [items[idx], items[to]] = [items[to], items[idx]];
      return { ...e, customItems: items };
    });

  return (
    <details className="section">
      <summary>Other cost items</summary>
      <div className="body">
        <p className="help">
          Every row here is yours: Azure DevOps tooling, ISVs, Fabric capacity, integration
          VMs — anything with a monthly price. A new estimate seeds the usual tenant items
          from the catalog and your team size; after that the amounts are flat, so revisit
          them if the team or agent count changes. Rows left at $0 bill nothing.
        </p>
        <div className="item-row muted" style={{ fontSize: 12 }}>
          <span>Name</span>
          <span>$/mo</span>
          <span>From</span>
          <span>To</span>
          <span />
          <span />
          <span />
        </div>
        {estimate.customItems.map((item, idx) => (
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
                className="small"
                title="Move this item up"
                disabled={idx === 0}
                onClick={() => moveItem(item.id, -1)}
              >
                ↑
              </button>
              <button
                className="small"
                title="Move this item down"
                disabled={idx === estimate.customItems.length - 1}
                onClick={() => moveItem(item.id, 1)}
              >
                ↓
              </button>
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
