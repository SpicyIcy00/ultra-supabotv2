import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getAutoReportSettings,
  updateAutoReportSettings,
  getAutoReportStores,
  updateAutoReportStores,
  runAutoReportNow,
  getAutoReportRunStatus,
} from '../../services/replenishmentApi';
import type {
  AutoReportSettings,
  AutoReportStore,
  AutoReportRunState,
} from '../../types/replenishment';

/** How often to ask the server how far the background run has got. */
const POLL_MS = 4000;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SETTINGS_DEFAULTS: AutoReportSettings = {
  enabled: false,
  day_of_week: 0,
  hour: 6,
  minute: 0,
  algorithm: 'legacy',
  calc_mode: 'snapshot',
  apply_stockout_buffer: false,
  show_zero_requested: false,
  post_backup: true,
};

const pad = (n: number) => String(n).padStart(2, '0');

export const AutoReportConfig: React.FC = () => {
  const [settings, setSettings] = useState<AutoReportSettings>(SETTINGS_DEFAULTS);
  const [draft, setDraft] = useState<AutoReportSettings>(SETTINGS_DEFAULTS);
  const [stores, setStores] = useState<AutoReportStore[]>([]);
  const [storeDraft, setStoreDraft] = useState<AutoReportStore[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingStores, setSavingStores] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runState, setRunState] = useState<AutoReportRunState | null>(null);
  const pollTimer = useRef<number | null>(null);

  const running = runState?.running ?? false;
  const runResult = runState?.final ?? null;

  useEffect(() => {
    load();
    // A run started elsewhere (another tab, or before a refresh) is still ours to show.
    pollRunStatus();
    return stopPolling;
  }, []);

  const stopPolling = () => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  /** Reads run progress once, and re-arms itself while the run is in flight. */
  const pollRunStatus = async () => {
    try {
      const state = await getAutoReportRunStatus();
      setRunState(state);
      if (state.running) {
        pollTimer.current = window.setTimeout(pollRunStatus, POLL_MS);
      } else {
        stopPolling();
        // Finished (or nothing running) — refresh the persisted last-run summary.
        try { setSettings(await getAutoReportSettings()); } catch { /* non-fatal */ }
      }
    } catch {
      // A dropped poll shouldn't kill the loop — the run is server-side regardless.
      pollTimer.current = window.setTimeout(pollRunStatus, POLL_MS);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, st] = await Promise.all([getAutoReportSettings(), getAutoReportStores()]);
      setSettings(s);
      setDraft(s);
      setStores(st);
      setStoreDraft(st);
    } catch {
      setError('Failed to load auto-report configuration.');
    } finally {
      setLoading(false);
    }
  };

  const settingsDirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const storesDirty = JSON.stringify(storeDraft) !== JSON.stringify(stores);

  const setField = <K extends keyof AutoReportSettings>(key: K, value: AutoReportSettings[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  const handleTimeChange = (raw: string) => {
    const [h, m] = raw.split(':').map(Number);
    if (!isNaN(h)) setField('hour', h);
    if (!isNaN(m)) setField('minute', m);
  };

  const setStoreField = (storeId: string, patch: Partial<AutoReportStore>) =>
    setStoreDraft(prev => prev.map(s => (s.store_id === storeId ? { ...s, ...patch } : s)));

  const saveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    try {
      const { updated_at, last_run_at, last_run_status, last_run_detail, ...payload } = draft;
      const result = await updateAutoReportSettings(payload);
      setSettings(result);
      setDraft(result);
      setNotice('Schedule saved.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveStores = async () => {
    setSavingStores(true);
    setError(null);
    try {
      const result = await updateAutoReportStores(
        storeDraft.map(s => ({ store_id: s.store_id, enabled: s.enabled, sheet_name: s.sheet_name ?? null }))
      );
      setStores(result);
      setStoreDraft(result);
      setNotice('Store list saved.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save store list.');
    } finally {
      setSavingStores(false);
    }
  };

  const runNow = async () => {
    setError(null);
    stopPolling();
    try {
      const start = await runAutoReportNow();
      setRunState(start.state);
      if (start.already_running) {
        setNotice('A run is already in progress.');
        setTimeout(() => setNotice(null), 4000);
      }
      // The run outlives this request — follow it by polling.
      pollTimer.current = window.setTimeout(pollRunStatus, POLL_MS);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not start the run.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const enabledCount = storeDraft.filter(s => s.enabled).length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Auto Report</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Runs the weekly replenishment report per store and posts each to Google Sheets automatically.
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:bg-[#2e303d] disabled:text-gray-500 text-white rounded-lg transition-colors"
        >
          {running ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>) : 'Run now'}
        </button>
      </div>

      {notice && (
        <div className="bg-green-900/30 border border-green-600/50 rounded-lg px-4 py-3">
          <p className="text-green-400 text-sm">{notice}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Last run status */}
      {(settings.last_run_at || settings.last_run_status) && (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400">
            Last run:{' '}
            <span className={
              settings.last_run_status === 'success' ? 'text-green-400'
              : settings.last_run_status === 'partial' ? 'text-yellow-400'
              : settings.last_run_status === 'failed' ? 'text-red-400'
              : settings.last_run_status === 'running' ? 'text-blue-400' : 'text-gray-300'
            }>
              {settings.last_run_status ?? 'never'}
            </span>
            {settings.last_run_at && (
              <span className="text-gray-500">
                {' · '}
                {new Date(settings.last_run_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </span>
            )}
          </p>
          {settings.last_run_detail && (
            <p className="text-xs text-gray-500 mt-1">{settings.last_run_detail}</p>
          )}
        </div>
      )}

      {/* Live progress / final breakdown of the background run */}
      {runState && (running || runResult) && (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[#2e303d]">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              {running ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  Running…
                  <span className="text-xs text-gray-400 font-normal">
                    {runState.stores_done}/{runState.stores_total} stores
                    {runState.current_store && ` · ${runState.current_store}`}
                  </span>
                </>
              ) : runResult && (
                <>
                  Run result — {runResult.status}
                  <span className="text-xs text-gray-400 font-normal">
                    {runResult.stores_ok}/{runResult.stores_total} stores · {runResult.total_rows} rows
                  </span>
                </>
              )}
            </h3>
          </div>
          <div className="divide-y divide-[#2e303d]">
            {(runResult?.results ?? runState.results).map(r => (
              <div key={r.store_id} className="px-5 py-2.5 flex items-center justify-between text-xs">
                <span className="text-gray-200">{r.store_name}
                  <span className="text-gray-500"> → {r.sheet_name}</span>
                </span>
                <span className={r.success ? 'text-green-400' : 'text-red-400'}>
                  {r.success ? `${r.rows ?? 0} rows` : (r.error || 'failed')}
                  {r.backup_success === false && <span className="text-yellow-400 ml-2">backup failed</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule + parameters */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2e303d] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Schedule &amp; Parameters</h3>
            <p className="text-xs text-gray-400 mt-0.5">Mirrors the manual dashboard controls. Applies on the next weekly run.</p>
          </div>
          <div className="flex items-center gap-2">
            {settingsDirty && (
              <button onClick={() => { setDraft(settings); setError(null); }}
                className="px-3 py-1.5 text-xs text-gray-400 border border-[#2e303d] rounded-lg hover:text-white hover:border-gray-500 transition-colors">
                Reset
              </button>
            )}
            <button onClick={saveSettings} disabled={!settingsDirty || savingSettings}
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-[#2e303d] disabled:text-gray-500 text-white rounded-lg transition-colors">
              {savingSettings ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Enabled */}
          <label className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-200">Enabled</p>
              <p className="text-xs text-gray-500 mt-0.5">Master switch for the weekly automation.</p>
            </div>
            <button
              onClick={() => setField('enabled', !draft.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${draft.enabled ? 'bg-blue-600' : 'bg-[#2e303d]'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${draft.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>

          {/* Day + time */}
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Day of week</label>
              <select
                value={draft.day_of_week}
                onChange={e => setField('day_of_week', Number(e.target.value))}
                className="bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
              >
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Time (Asia/Manila)</label>
              <input
                type="time"
                value={`${pad(draft.hour)}:${pad(draft.minute)}`}
                onChange={e => handleTimeChange(e.target.value)}
                className="bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Algorithm + calc mode */}
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Algorithm</label>
              <select
                value={draft.algorithm}
                onChange={e => setField('algorithm', e.target.value as AutoReportSettings['algorithm'])}
                className="bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
              >
                <option value="legacy">Legacy</option>
                <option value="percentile">Percentile (v2)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Calc mode</label>
              <select
                value={draft.calc_mode}
                disabled={draft.algorithm === 'percentile'}
                onChange={e => setField('calc_mode', e.target.value as AutoReportSettings['calc_mode'])}
                className="bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="auto">Auto</option>
                <option value="snapshot">Snapshot</option>
                <option value="fallback">Fallback</option>
              </select>
              {draft.algorithm === 'percentile' && (
                <p className="text-[11px] text-gray-600 mt-1">Not used by percentile.</p>
              )}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
              <input type="checkbox" checked={draft.apply_stockout_buffer}
                onChange={e => setField('apply_stockout_buffer', e.target.checked)}
                className="rounded border-[#2e303d] bg-[#0e1117] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer" />
              Stockout buffer <span className="text-xs text-gray-500">(+20% Mon–Fri, +10% Sat–Sun)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
              <input type="checkbox" checked={draft.show_zero_requested}
                onChange={e => setField('show_zero_requested', e.target.checked)}
                className="rounded border-[#2e303d] bg-[#0e1117] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer" />
              Include sold items with 0 ordered
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
              <input type="checkbox" checked={draft.post_backup}
                onChange={e => setField('post_backup', e.target.checked)}
                className="rounded border-[#2e303d] bg-[#0e1117] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer" />
              Also post full-field backup sheet
            </label>
          </div>
        </div>
      </div>

      {/* Per-store table */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2e303d] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Stores</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {enabledCount} of {storeDraft.length} included. Blank sheet tab = store name.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {storesDirty && (
              <button onClick={() => { setStoreDraft(stores); setError(null); }}
                className="px-3 py-1.5 text-xs text-gray-400 border border-[#2e303d] rounded-lg hover:text-white hover:border-gray-500 transition-colors">
                Reset
              </button>
            )}
            <button onClick={saveStores} disabled={!storesDirty || savingStores}
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-[#2e303d] disabled:text-gray-500 text-white rounded-lg transition-colors">
              {savingStores ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2e303d] text-xs text-gray-400">
              <th className="text-left font-medium px-5 py-2.5">Include</th>
              <th className="text-left font-medium px-5 py-2.5">Store</th>
              <th className="text-left font-medium px-5 py-2.5">Sheet tab name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e303d]">
            {storeDraft.map(s => (
              <tr key={s.store_id}>
                <td className="px-5 py-2.5">
                  <input type="checkbox" checked={s.enabled}
                    onChange={e => setStoreField(s.store_id, { enabled: e.target.checked })}
                    className="rounded border-[#2e303d] bg-[#0e1117] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer" />
                </td>
                <td className="px-5 py-2.5 text-gray-200">{s.store_name ?? s.store_id}</td>
                <td className="px-5 py-2.5">
                  <input
                    type="text"
                    value={s.sheet_name ?? ''}
                    placeholder={s.store_name ?? s.store_id}
                    onChange={e => setStoreField(s.store_id, { sheet_name: e.target.value })}
                    className="w-56 bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:border-blue-500 focus:outline-none placeholder-gray-600"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AutoReportConfig;
