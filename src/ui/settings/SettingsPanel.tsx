import { useState } from 'react';
import { useStore } from '../store';
import { defaultConfig, type ConfigOverrides } from '../../model/config';
import { downloadJson, parseOverridesJson } from '../../model/persistence';
import {
  environmentTypeSchema,
  licenseCatalogSchema,
  pricingCatalogSchema,
  scheduleRuleSchema,
} from '../../model/schemas';
import { z } from 'zod';

type SectionKey = 'pricing' | 'licenses' | 'environments' | 'rules';

const SECTIONS: { key: SectionKey; label: string; help: string }[] = [
  {
    key: 'pricing',
    label: 'Prices',
    help: 'Every price with its licensing-guide citation. Update when Microsoft publishes a new guide.',
  },
  {
    key: 'licenses',
    label: 'License types & entitlements',
    help: 'Per-user storage accruals, tenant base entitlements, Copilot credits.',
  },
  {
    key: 'environments',
    label: 'Environment plan',
    help: 'Environment types, methodology descriptions, cost components, default storage demand.',
  },
  {
    key: 'rules',
    label: 'Scheduling rules',
    help: 'When each environment turns on/off relative to phases and go-live.',
  },
];

const validators: Record<SectionKey, (data: unknown) => void> = {
  pricing: (d) => pricingCatalogSchema.parse(d),
  licenses: (d) => licenseCatalogSchema.parse(d),
  environments: (d) => z.array(environmentTypeSchema).parse(d),
  rules: (d) => z.array(scheduleRuleSchema).parse(d),
};

export function SettingsPanel() {
  const config = useStore((s) => s.config);
  const overrides = useStore((s) => s.overrides);
  const setOverrides = useStore((s) => s.setOverrides);

  return (
    <div>
      <p className="help">
        These are the editable defaults. Changes apply immediately, persist in this
        browser, and can be exported as a <code>config-overrides.json</code> to share —
        no rebuild needed. Rebuilders can instead edit <code>src/catalog/*.json</code>.
      </p>
      <div className="row">
        <button
          onClick={() => downloadJson('config-overrides.json', overrides ?? config)}
        >
          Export overrides
        </button>
        <ImportOverrides />
        <button
          className="danger"
          onClick={() => {
            if (confirm('Discard all config customizations and restore defaults?'))
              setOverrides(null);
          }}
        >
          Restore defaults
        </button>
        {overrides ? (
          <span className="badge override">customized</span>
        ) : (
          <span className="badge">defaults</span>
        )}
      </div>
      {SECTIONS.map((s) => (
        <SectionEditor key={s.key} section={s} />
      ))}
    </div>
  );
}

function ImportOverrides() {
  const setOverrides = useStore((s) => s.setOverrides);
  return (
    <label className="small" style={{ cursor: 'pointer' }}>
      <button className="small" style={{ pointerEvents: 'none' }}>
        Import overrides…
      </button>
      <input
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={async (ev) => {
          const file = ev.target.files?.[0];
          if (!file) return;
          try {
            setOverrides(parseOverridesJson(await file.text()));
          } catch (err) {
            alert(`Invalid config-overrides.json:\n${String(err)}`);
          }
          ev.target.value = '';
        }}
      />
    </label>
  );
}

function SectionEditor({
  section,
}: {
  section: { key: SectionKey; label: string; help: string };
}) {
  const config = useStore((s) => s.config);
  const overrides = useStore((s) => s.overrides);
  const setOverrides = useStore((s) => s.setOverrides);
  const current = config[section.key];
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    if (text === null) return;
    try {
      const data = JSON.parse(text);
      validators[section.key](data);
      const next: ConfigOverrides = { ...(overrides ?? {}), [section.key]: data };
      setOverrides(next);
      setError(null);
      setText(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const revert = () => {
    if (!overrides) return;
    const next = { ...overrides };
    delete next[section.key];
    setOverrides(Object.keys(next).length ? next : null);
    setText(null);
    setError(null);
  };

  const isOverridden = overrides?.[section.key] !== undefined;
  const defaults = defaultConfig()[section.key];

  const importSection = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      validators[section.key](data);
      const next: ConfigOverrides = { ...(overrides ?? {}), [section.key]: data };
      setOverrides(next);
      setError(null);
      setText(null);
    } catch (err) {
      setError(`Import failed: ${String(err)}`);
    }
  };

  return (
    <details className="section">
      <summary>
        {section.label} {isOverridden && <span className="badge override">customized</span>}
      </summary>
      <div className="body">
        <p className="help">{section.help}</p>
        <textarea
          className="json-editor"
          value={text ?? JSON.stringify(current, null, 2)}
          onChange={(ev) => setText(ev.target.value)}
          spellCheck={false}
        />
        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button className="primary" onClick={apply} disabled={text === null}>
            Validate &amp; apply
          </button>
          <button onClick={() => setText(null)} disabled={text === null}>
            Discard edits
          </button>
          <button onClick={revert} disabled={!isOverridden}>
            Revert to bundled default
          </button>
          <button
            className="small"
            onClick={() => setText(JSON.stringify(defaults, null, 2))}
          >
            Load default into editor
          </button>
        </div>
        <div className="row">
          <button
            className="small"
            onClick={() => downloadJson(`${section.key}.json`, current)}
          >
            Export JSON
          </button>
          <label style={{ minWidth: 0 }}>
            <button className="small" style={{ pointerEvents: 'none' }}>
              Import JSON…
            </button>
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (file) void importSection(file);
                ev.target.value = '';
              }}
            />
          </label>
          <span className="help">
            share just this section (e.g. your environment plan) as a file
          </span>
        </div>
      </div>
    </details>
  );
}
