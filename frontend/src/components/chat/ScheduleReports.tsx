/**
 * Scheduling UI for AI-chat reports.
 *
 * - ScheduleReportModal: create (from a chat answer) OR edit an existing schedule.
 *   Supports daily / weekly / monthly cadence, multiple times per day, multiple
 *   weekdays or month-days (incl. "last day"), and multiple Telegram recipients.
 * - ScheduledReportsManager: list / edit / toggle / run / delete.
 */
import { useEffect, useState } from 'react';
import { Loader2, X, Send, Search, CalendarClock, Trash2, Play, Power, Pencil, Plus } from 'lucide-react';
import {
  createScheduledReport,
  listScheduledReports,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledReportNow,
  getTelegramStatus,
  discoverTelegramChats,
  testTelegram,
  type ScheduledReport,
  type Frequency,
  type TelegramChat,
} from '../../services/scheduledReportsApi';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n: number) => String(n).padStart(2, '0');

function scheduleLabel(r: ScheduledReport): string {
  const times = (r.times?.length ? r.times : [`${pad(r.hour)}:${pad(r.minute)}`]).join(', ');
  if (r.frequency === 'custom') {
    const parts = Object.entries(r.day_times || {})
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([d, ts]) => `${DAYS_SHORT[Number(d)]} ${ts.join('/')}`);
    return parts.length ? `Per-day · ${parts.join(' · ')}` : 'Per-day';
  }
  if (r.frequency === 'weekly') {
    const days = (r.days_of_week?.length ? r.days_of_week : [r.day_of_week]).map((d) => DAYS_SHORT[d]).join(', ');
    return `Weekly · ${days} · ${times}`;
  }
  if (r.frequency === 'monthly') {
    const days = (r.days_of_month?.length ? r.days_of_month : [1]).map((d) => (d >= 31 ? 'last' : d)).join(', ');
    return `Monthly · day ${days} · ${times}`;
  }
  return `Daily · ${times}`;
}

// ---------------------------------------------------------------------------
// Multi-recipient Telegram picker
// ---------------------------------------------------------------------------

interface ChatPickerProps {
  chatIds: string[];
  onChange: (ids: string[]) => void;
}

function TelegramChatField({ chatIds, onChange }: ChatPickerProps) {
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [manual, setManual] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (id: string) => {
    const s = id.trim();
    if (!s) return;
    onChange(chatIds.includes(s) ? chatIds.filter((c) => c !== s) : [...chatIds, s]);
  };

  const nameFor = (id: string) => chats?.find((c) => c.chat_id === id)?.name || id;

  const discover = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await discoverTelegramChats();
      setChats(res.chats);
      if (res.chats.length === 0) setMsg('No chats found. Message your bot on Telegram first, then retry.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  };

  const test = async () => {
    if (chatIds.length === 0) return;
    setTesting(true);
    setMsg(null);
    try {
      await Promise.all(chatIds.map((id) => testTelegram(id)));
      setMsg(`✅ Test sent to ${chatIds.length} chat(s) — check Telegram.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <label className="block text-sm text-gray-300 mb-1.5">Telegram recipients</label>

      {/* Selected chips */}
      {chatIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {chatIds.map((id) => (
            <span key={id} className="flex items-center gap-1 bg-blue-500/15 text-blue-300 text-xs rounded-full pl-2.5 pr-1 py-1">
              {nameFor(id)}
              <button type="button" onClick={() => toggle(id)} className="p-0.5 hover:text-white" title="Remove">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toggle(manual); setManual(''); } }}
          placeholder="Chat ID (e.g. 123456789)"
          className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="button" onClick={() => { toggle(manual); setManual(''); }} disabled={!manual.trim()}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-200 flex items-center gap-1.5 disabled:opacity-50" title="Add this chat ID">
          <Plus className="w-4 h-4" />Add
        </button>
        <button type="button" onClick={discover} disabled={loading}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-200 flex items-center gap-1.5 disabled:opacity-50" title="Find chats that messaged the bot">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}Find
        </button>
        <button type="button" onClick={test} disabled={chatIds.length === 0 || testing}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-200 flex items-center gap-1.5 disabled:opacity-50" title="Send a test to all selected chats">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Test
        </button>
      </div>

      {/* Discovered chats — click to toggle */}
      {chats && chats.length > 0 && (
        <div className="mt-2 space-y-1">
          {chats.map((c) => (
            <button key={c.chat_id} type="button" onClick={() => toggle(c.chat_id)}
              className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                chatIds.includes(c.chat_id) ? 'bg-blue-500/15 text-blue-300' : 'bg-gray-800/60 text-gray-300 hover:bg-gray-800'
              }`}>
              {chatIds.includes(c.chat_id) ? '✓ ' : ''}{c.name} <span className="text-gray-500">· {c.type} · {c.chat_id}</span>
            </button>
          ))}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-gray-400">{msg}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule builder
// ---------------------------------------------------------------------------

interface ScheduleValue {
  frequency: Frequency;
  times: string[];
  daysOfWeek: number[];
  daysOfMonth: number[];
  dayTimes: Record<number, string[]>; // per-weekday times (custom mode)
}

const FREQ_LABELS: Record<Frequency, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', custom: 'Per-day' };

function ScheduleBuilder({ value, onChange }: { value: ScheduleValue; onChange: (v: ScheduleValue) => void }) {
  const set = (patch: Partial<ScheduleValue>) => onChange({ ...value, ...patch });

  const toggleNum = (arr: number[], n: number) =>
    arr.includes(n) ? arr.filter((x) => x !== n) : [...arr, n].sort((a, b) => a - b);

  const setDayTimes = (wd: number, times: string[] | null) => {
    const next = { ...value.dayTimes };
    if (times === null) delete next[wd];
    else next[wd] = times;
    set({ dayTimes: next });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-gray-300 mb-1.5">Frequency</label>
        <div className="grid grid-cols-4 gap-2">
          {(['daily', 'weekly', 'monthly', 'custom'] as Frequency[]).map((f) => (
            <button key={f} type="button" onClick={() => set({ frequency: f })}
              className={`px-2 py-2 rounded-lg text-sm transition-colors ${
                value.frequency === f ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-gray-900 border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}>{FREQ_LABELS[f]}</button>
          ))}
        </div>
        {value.frequency === 'custom' && (
          <p className="mt-1 text-xs text-gray-500">Different times per day — set times on the days you want; days left empty are skipped.</p>
        )}
      </div>

      {/* Per-day: each weekday gets its own times */}
      {value.frequency === 'custom' && (
        <div className="space-y-2">
          {DAYS.map((d, wd) => {
            const times = value.dayTimes[wd] || [];
            const on = times.length > 0;
            return (
              <div key={d} className="bg-gray-900 border border-gray-700 rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${on ? 'text-white' : 'text-gray-500'}`}>{d}</span>
                  {on ? (
                    <button type="button" onClick={() => setDayTimes(wd, null)} className="text-xs text-gray-400 hover:text-red-400">Clear</button>
                  ) : (
                    <button type="button" onClick={() => setDayTimes(wd, ['08:00'])} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                      <Plus className="w-3 h-3" />Add time
                    </button>
                  )}
                </div>
                {on && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {times.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <input type="time" value={t}
                          onChange={(e) => setDayTimes(wd, times.map((x, i) => (i === idx ? e.target.value : x)))}
                          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button type="button" onClick={() => { const nt = times.filter((_, i) => i !== idx); setDayTimes(wd, nt.length ? nt : null); }}
                          className="text-gray-500 hover:text-red-400" title="Remove">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setDayTimes(wd, [...times, '12:00'])} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-1">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {value.frequency === 'weekly' && (
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">On days</label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button key={d} type="button" onClick={() => set({ daysOfWeek: toggleNum(value.daysOfWeek, i) })}
                className={`px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                  value.daysOfWeek.includes(i) ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-gray-900 border border-gray-700 text-gray-300 hover:bg-gray-800'
                }`}>{DAYS_SHORT[i]}</button>
            ))}
          </div>
        </div>
      )}

      {value.frequency === 'monthly' && (
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">On day(s) of month <span className="text-gray-500">(31 = last day)</span></label>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => set({ daysOfMonth: toggleNum(value.daysOfMonth, n) })}
                className={`py-1.5 rounded text-xs transition-colors ${
                  value.daysOfMonth.includes(n) ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-gray-900 border border-gray-700 text-gray-300 hover:bg-gray-800'
                }`}>{n === 31 ? 'Last' : n}</button>
            ))}
          </div>
        </div>
      )}

      {/* Times (one or more) — not for per-day mode (it has its own times) */}
      {value.frequency !== 'custom' && (
      <div>
        <label className="block text-sm text-gray-300 mb-1.5">Time(s) — Manila</label>
        <div className="space-y-2">
          {value.times.map((t, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="time" value={t}
                onChange={(e) => set({ times: value.times.map((x, i) => (i === idx ? e.target.value : x)) })}
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {value.times.length > 1 && (
                <button type="button" onClick={() => set({ times: value.times.filter((_, i) => i !== idx) })}
                  className="px-2 text-gray-400 hover:text-red-400" title="Remove time">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => set({ times: [...value.times, '12:00'] })}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
            <Plus className="w-3.5 h-3.5" />Add another time
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

interface ScheduleReportModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  initial?: { title: string; question: string; sql: string }; // create-from-answer
  existing?: ScheduledReport | null;                          // edit mode
}

export function ScheduleReportModal({ open, onClose, onSaved, initial, existing }: ScheduleReportModalProps) {
  const isEdit = !!existing;
  const [title, setTitle] = useState('');
  const [schedule, setSchedule] = useState<ScheduleValue>({ frequency: 'daily', times: ['08:00'], daysOfWeek: [0], daysOfMonth: [1], dayTimes: {} });
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    getTelegramStatus().then((s) => setTokenConfigured(s.configured)).catch(() => setTokenConfigured(null));
    if (existing) {
      setTitle(existing.title);
      const dayTimes: Record<number, string[]> = {};
      Object.entries(existing.day_times || {}).forEach(([k, v]) => { dayTimes[Number(k)] = v; });
      setSchedule({
        frequency: existing.frequency,
        times: existing.times?.length ? existing.times : [`${pad(existing.hour)}:${pad(existing.minute)}`],
        daysOfWeek: existing.days_of_week?.length ? existing.days_of_week : [existing.day_of_week ?? 0],
        daysOfMonth: existing.days_of_month?.length ? existing.days_of_month : [1],
        dayTimes,
      });
      setChatIds(existing.telegram_chat_ids?.length ? existing.telegram_chat_ids : (existing.telegram_chat_id ? [existing.telegram_chat_id] : []));
    } else {
      setTitle(initial?.title ?? '');
      setSchedule({ frequency: 'daily', times: ['08:00'], daysOfWeek: [new Date().getDay() === 0 ? 6 : new Date().getDay() - 1], daysOfMonth: [1], dayTimes: {} });
      setChatIds([]);
    }
  }, [open, existing, initial?.title]);

  if (!open) return null;

  const save = async () => {
    setError(null);
    if (!title.trim()) return setError('Please enter a title.');
    if (chatIds.length === 0) return setError('Please add at least one Telegram recipient.');
    if (schedule.frequency === 'custom') {
      if (Object.values(schedule.dayTimes).every((t) => !t || t.length === 0))
        return setError('Add at least one time on at least one day.');
    } else {
      if (schedule.times.length === 0) return setError('Please add at least one time.');
      if (schedule.frequency === 'weekly' && schedule.daysOfWeek.length === 0) return setError('Pick at least one weekday.');
      if (schedule.frequency === 'monthly' && schedule.daysOfMonth.length === 0) return setError('Pick at least one day of the month.');
    }

    // day_times keyed by weekday string, only non-empty days.
    const day_times: Record<string, string[]> = {};
    Object.entries(schedule.dayTimes).forEach(([wd, ts]) => { if (ts && ts.length) day_times[wd] = ts; });

    const payload = {
      title: title.trim(),
      frequency: schedule.frequency,
      times: schedule.times,
      days_of_week: schedule.daysOfWeek,
      days_of_month: schedule.daysOfMonth,
      day_times,
      telegram_chat_ids: chatIds,
    };

    setSaving(true);
    try {
      if (isEdit && existing) {
        await updateScheduledReport(existing.id, payload);
      } else {
        await createScheduledReport({ ...payload, question: initial!.question, sql: initial!.sql });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-400" />
            {isEdit ? 'Edit schedule' : 'Schedule this report'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {tokenConfigured === false && (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              Telegram bot not configured on the server. Set <code>TELEGRAM_BOT_TOKEN</code> (from @BotFather) in the
              backend environment for delivery to work.
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Report title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {(existing?.question || initial?.question) && (
              <p className="mt-1 text-xs text-gray-500 truncate">Query: {existing?.question || initial?.question}</p>
            )}
          </div>

          <ScheduleBuilder value={schedule} onChange={setSchedule} />
          <TelegramChatField chatIds={chatIds} onChange={setChatIds} />

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-gray-800">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager modal
// ---------------------------------------------------------------------------

interface ManagerProps {
  open: boolean;
  onClose: () => void;
}

export function ScheduledReportsManager({ open, onClose }: ManagerProps) {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduledReport | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setReports(await listScheduledReports());
    } catch {
      setNote('Failed to load scheduled reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) { setNote(null); refresh(); }
  }, [open]);

  if (!open) return null;

  const toggle = async (r: ScheduledReport) => {
    setBusyId(r.id);
    try { await updateScheduledReport(r.id, { enabled: !r.enabled }); await refresh(); }
    finally { setBusyId(null); }
  };

  const runNow = async (r: ScheduledReport) => {
    setBusyId(r.id);
    setNote(null);
    try {
      const res = await runScheduledReportNow(r.id);
      setNote(res.status === 'success' ? `✅ "${r.title}" delivered.` : `"${r.title}": ${res.status}${res.error ? ` — ${res.error}` : ''}`);
      await refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: ScheduledReport) => {
    if (!window.confirm(`Delete scheduled report "${r.title}"?`)) return;
    setBusyId(r.id);
    try { await deleteScheduledReport(r.id); await refresh(); }
    finally { setBusyId(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-400" />
            Scheduled reports
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {note && <p className="mb-3 text-sm text-gray-300 bg-gray-800/60 rounded-lg px-3 py-2">{note}</p>}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading…
            </div>
          ) : reports.length === 0 ? (
            <p className="text-gray-500 text-center py-8 text-sm">
              No scheduled reports yet. Use the “Schedule” button under any chat answer.
            </p>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.enabled ? 'bg-green-400' : 'bg-gray-600'}`} />
                      <span className="font-medium text-white truncate">{r.title}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{scheduleLabel(r)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(r.telegram_chat_ids?.length ? r.telegram_chat_ids.length : 1)} recipient(s)
                      {r.last_run_at && <> · last run {new Date(r.last_run_at).toLocaleString()} · {r.last_run_status}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => runNow(r)} disabled={busyId === r.id} className="p-1.5 text-gray-400 hover:text-green-400 disabled:opacity-40" title="Run now">
                      {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setEditing(r)} disabled={busyId === r.id} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-40" title="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggle(r)} disabled={busyId === r.id} className={`p-1.5 disabled:opacity-40 ${r.enabled ? 'text-green-400 hover:text-gray-400' : 'text-gray-500 hover:text-green-400'}`} title={r.enabled ? 'Disable' : 'Enable'}>
                      <Power className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(r)} disabled={busyId === r.id} className="p-1.5 text-gray-400 hover:text-red-400 disabled:opacity-40" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      <ScheduleReportModal
        open={!!editing}
        existing={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
    </div>
  );
}
