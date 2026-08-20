import { useRef } from 'react';
import { useStore } from './store';
import { TimelinePanel } from './inputs/TimelinePanel';
import { TeamPanel } from './inputs/TeamPanel';
import { LicensesPanel } from './inputs/LicensesPanel';
import { EnvPanel } from './inputs/EnvPanel';
import { CopilotPanel } from './inputs/CopilotPanel';
import { ItemsPanel } from './inputs/ItemsPanel';
import { ScheduleGrid } from './grid/ScheduleGrid';
import { Dashboard } from './dashboard/Dashboard';
import { ExplainDrawer } from './explain/ExplainDrawer';
import { SettingsPanel } from './settings/SettingsPanel';
import { downloadJson, parseEstimateJson } from '../model/persistence';
import { exportXlsx } from '../export/xlsx';

declare const __BUILD_DATE__: string;

export function App() {
  const estimate = useStore((s) => s.estimate);
  const config = useStore((s) => s.config);
  const result = useStore((s) => s.result);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const update = useStore((s) => s.update);
  const replaceEstimate = useStore((s) => s.replaceEstimate);
  const reset = useStore((s) => s.reset);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="app-header">
        <h1>D365 F&amp;SCM Cost Estimator</h1>
        <input
          className="estimate-name"
          type="text"
          value={estimate.meta.name}
          onChange={(ev) =>
            update((e) => ({ ...e, meta: { ...e.meta, name: ev.target.value } }))
          }
        />
        <div className="spacer" />
        <button onClick={() => downloadJson(`${estimate.meta.name}.estimate.json`, estimate)}>
          Save JSON
        </button>
        <button onClick={() => fileRef.current?.click()}>Open JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={async (ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            try {
              replaceEstimate(parseEstimateJson(await file.text()));
            } catch (err) {
              alert(`Not a valid estimate file:\n${String(err)}`);
            }
            ev.target.value = '';
          }}
        />
        <button className="primary" onClick={() => exportXlsx(estimate, config, result)}>
          Export .xlsx
        </button>
        <button
          onClick={() => {
            if (confirm('Start a new estimate? Unsaved changes are kept in this browser only.'))
              reset();
          }}
        >
          New
        </button>
      </header>
      <div className="banner">
        Budgetary estimate only — USD list prices as of {config.pricing.asOf} (catalog{' '}
        {config.pricing.version}, Microsoft Licensing Guides). Actual pricing varies by
        agreement.
      </div>
      <div className="layout">
        <aside className="sidebar">
          <TimelinePanel />
          <TeamPanel />
          <LicensesPanel />
          <EnvPanel />
          <CopilotPanel />
          <ItemsPanel />
        </aside>
        <main className="main">
          <div className="tabs">
            <button className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}>
              Schedule
            </button>
            <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
              Estimate
            </button>
            <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>
              Settings
            </button>
          </div>
          {view === 'schedule' && <ScheduleGrid />}
          {view === 'dashboard' && <Dashboard />}
          {view === 'settings' && <SettingsPanel />}
        </main>
      </div>
      <footer className="footer">
        Open source (MIT) · built {__BUILD_DATE__} · prices are cited per line — click any
        figure for its explanation · not affiliated with Microsoft
      </footer>
      <ExplainDrawer />
    </>
  );
}
