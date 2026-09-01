import { useStore } from './store';
import { TimelinePanel } from './inputs/TimelinePanel';
import { TeamPanel } from './inputs/TeamPanel';
import { LicensesPanel } from './inputs/LicensesPanel';
import { EnvPanel } from './inputs/EnvPanel';
import { CopilotPanel } from './inputs/CopilotPanel';
import { CommercePanel } from './inputs/CommercePanel';
import { ItemsPanel } from './inputs/ItemsPanel';
import { ScheduleGrid } from './grid/ScheduleGrid';
import { Dashboard } from './dashboard/Dashboard';
import { ExplainDrawer } from './explain/ExplainDrawer';
import { SettingsPanel } from './settings/SettingsPanel';
import { JsonFileButton } from './JsonFileButton';
import { downloadJson, isoDateStamp, parseEstimateJson } from '../model/persistence';
import { exportXlsx } from '../export/xlsx';

declare const __BUILD_DATE__: string;

export function App() {
  const estimate = useStore((s) => s.estimate);
  const config = useStore((s) => s.config);
  const result = useStore((s) => s.result);
  const update = useStore((s) => s.update);
  const reset = useStore((s) => s.reset);

  const fileName = estimate.meta.name.trim() || 'estimate';

  return (
    <>
      <header className="app-header">
        <h1>D365 F&amp;SCM Cost Estimator</h1>
        <input
          className="estimate-name"
          type="text"
          placeholder="Estimate name"
          value={estimate.meta.name}
          onChange={(ev) =>
            update((e) => ({ ...e, meta: { ...e.meta, name: ev.target.value } }))
          }
        />
        <nav>
          <a href="#inputs">Inputs</a>
          <a href="#schedule">Schedule</a>
          <a href="#estimate">Estimate</a>
          <a href="#settings">Settings</a>
        </nav>
        <div className="spacer" />
        <button
          title="Download this estimate as a JSON file — the durable save you can reopen or share"
          onClick={() => downloadJson(`${fileName} ${isoDateStamp()}.estimate.json`, estimate)}
        >
          Save JSON
        </button>
        <JsonFileButton
          label="Open JSON"
          tooltip="Open a previously saved estimate JSON file (replaces what's on screen)"
          onText={(text) => update(() => parseEstimateJson(text, config))}
          onError={(err) => alert(`Not a valid estimate file:\n${String(err)}`)}
        />
        <button
          className="primary"
          title="Download a multi-sheet Excel workbook: Inputs, Schedule, Worksheet, Report, By Environment, Assumptions"
          onClick={() => exportXlsx(estimate, config, result)}
        >
          Export .xlsx
        </button>
        <button
          title="Start a blank estimate with default timeline and settings"
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
      <main className="page">
        <section id="inputs">
          <h2>Inputs</h2>
          <div className="panels-grid">
            <div className="panel-col">
              <TimelinePanel />
              <TeamPanel />
              <ItemsPanel />
            </div>
            <div className="panel-col">
              <LicensesPanel />
              <CommercePanel />
              <CopilotPanel />
            </div>
            <div className="panel-col">
              <EnvPanel />
            </div>
          </div>
        </section>
        <section id="schedule">
          <h2>Schedule</h2>
          <ScheduleGrid />
        </section>
        <section id="estimate">
          <h2>Estimate</h2>
          <Dashboard />
        </section>
        <section id="settings">
          <h2>Settings</h2>
          <SettingsPanel />
        </section>
      </main>
      <footer className="footer">
        Open source (MIT) · built {__BUILD_DATE__} · prices are cited per line — click any
        figure for its explanation · not affiliated with Microsoft · Microsoft licensing
        guidance:{' '}
        <a
          href="https://www.microsoft.com/licensing/guidance/Dynamics-365"
          target="_blank"
          rel="noreferrer"
        >
          Dynamics 365
        </a>
        {' · '}
        <a
          href="https://www.microsoft.com/licensing/guidance/Power-Platform"
          target="_blank"
          rel="noreferrer"
        >
          Power Platform
        </a>
        {' · '}
        <a
          href="https://www.microsoft.com/licensing/guidance/Microsoft-Copilot-Studio"
          target="_blank"
          rel="noreferrer"
        >
          Copilot Studio
        </a>
      </footer>
      <ExplainDrawer />
    </>
  );
}
