import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { defaultConfig, type ConfigOverrides } from '../../model/config';
import { downloadJson, parseOverridesJson } from '../../model/persistence';
import { configOverridesSchema } from '../../model/schemas';
import { JsonFileButton } from '../JsonFileButton';

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

/** Validate one section with the same schema the file-import path uses. */
function validateSection(key: SectionKey, data: unknown): void {
  configOverridesSchema.shape[key].unwrap().parse(data);
}

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
        <JsonFileButton
          label="Import overrides…"
          small
          onText={(text) => setOverrides(parseOverridesJson(text))}
          onError={(err) => alert(`Invalid config-overrides.json:\n${String(err)}`)}
        />
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

  const serialized = useMemo(() => JSON.stringify(current, null, 2), [current]);

  /** Shared by the editor's Apply and the file import: validate, merge, persist. */
  const applyText = (raw: string, errPrefix = '') => {
    try {
      const data = JSON.parse(raw);
      validateSection(section.key, data);
      const next: ConfigOverrides = { ...(overrides ?? {}), [section.key]: data };
      setOverrides(next);
      setError(null);
      setText(null);
    } catch (err) {
      setError(`${errPrefix}${String(err)}`);
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

  return (
    <details className="section">
      <summary>
        {section.label} {isOverridden && <span className="badge override">customized</span>}
      </summary>
      <div className="body">
        <p className="help">{section.help}</p>
        <textarea
          className="json-editor"
          value={text ?? serialized}
          onChange={(ev) => setText(ev.target.value)}
          spellCheck={false}
        />
        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button
            className="primary"
            onClick={() => text !== null && applyText(text)}
            disabled={text === null}
          >
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
            onClick={() =>
              setText(JSON.stringify(defaultConfig()[section.key], null, 2))
            }
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
          <JsonFileButton
            label="Import JSON…"
            small
            onText={(t) => applyText(t, 'Import failed: ')}
            onError={(err) => setError(`Import failed: ${String(err)}`)}
          />
          <span className="help">
            share just this section (e.g. your environment plan) as a file
          </span>
        </div>
      </div>
    </details>
  );
}
