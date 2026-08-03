/**
 * Scheduling UI for AI-chat reports.
 *
 * - ScheduleReportModal: create a schedule from a specific chat answer.
 * - ScheduledReportsManager: list / toggle / run / delete existing schedules.
 *
 * Reports are re-run server-side on their cadence and delivered to Telegram.
 */
import { useEffect, useState } from 'react';
import { Loader2, X, Send, Search, CalendarClock, Trash2, Play, Power } from 'lucide-react';
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
  type TelegramChat,
} from '../../services/scheduledReportsApi';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const pad = (n: number) => String(n).padStart(2, '0');

function frequencyLabel(r: ScheduledReport): string {
  const time = `${pad(r.hour)}:${pad(r.minute)}`;
  return r.frequency === 'weekly' ? `Every ${DAYS[r.day_of_week]} at ${time}` : `Daily at ${time}`;
}

// ---------------------------------------------------------------------------
// Telegram chat picker (shared)
// ---------------------------------------------------------------------------

interface ChatPickerProps {
  chatId: string;
  onChange: (id: string) => void;
}

function TelegramChatField({ chatId, onChange }: ChatPickerProps) {
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const discover = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await discoverTelegramChats();
      setChats(res.chats);
      if (res.chats.length === 0) {
        setMsg('No chats found. Message your bot on Telegram first, then retry.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  };

  const test = async () => {
    if (!chatId) return;
    setTesting(true);
    setMsg(null);
    try {
      await testTelegram(chatId);
      setMsg('✅ Test message sent — check Telegram.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <label className="block text-sm text-gray-300 mb-1.5">Telegram destination</label>
      <div className="flex gap-2">
        <input
          value={chatId}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Chat ID (e.g. 123456789)"
          className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={discover}
          disabled={loading}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-200 flex items-center gap-1.5 disabled:opacity-50"
          title="Find chats that messaged the bot"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Find
        </button>
        <button
          type="button"
          onClick={test}
          disabled={!chatId || testing}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-200 flex items-center gap-1.5 disabled:opacity-50"
          title="Send a test message"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Test
        </button>
      </div>

      {chats && chats.length > 0 && (
        <div className="mt-2 space-y-1">
          {chats.map((c) => (
            <button
              key={c.chat_id}
              type="button"
              onClick={() => onChange(c.chat_id)}
              className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                chatId === c.chat_id ? 'bg-blue-500/15 text-blue-300' : 'bg-gray-800/60 text-gray-300 hover:bg-gray-800'
              }`}
            >
              {c.name} <span className="text-gray-500">· {c.type} · {c.chat_id}</span>
            </button>
          ))}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-gray-400">{msg}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

interface ScheduleReportModalProps {
  open: boolean;
  onClose: () => void;
  initial: { title: string; question: string; sql: string };
  onCreated?: () => void;
}

export function ScheduleReportModal({ open, onClose, initial, onCreated }: ScheduleReportModalProps) {
  const [title, setTitle] = useState(initial.title);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [time, setTime] = useState('08:00');
  const [chatId, setChatId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initial.title);
      setError(null);
      getTelegramStatus().then((s) => setTokenConfigured(s.configured)).catch(() => setTokenConfigured(null));
    }
  }, [open, initial.title]);

  if (!open) return null;

  const save = async () => {
    setError(null);
    if (!title.trim()) { setError('Please enter a title.'); return; }
    if (!chatId.trim()) { setError('Please enter a Telegram chat ID.'); return; }

    const [hourStr, minuteStr] = time.split(':');
    setSaving(true);
    try {
      await createScheduledReport({
        title: title.trim(),
        question: initial.question,
        sql: initial.sql,
        frequency,
        day_of_week: dayOfWeek,
        hour: parseInt(hourStr, 10) || 0,
        minute: parseInt(minuteStr, 10) || 0,
        telegram_chat_id: chatId.trim(),
        include_csv: false,
      });
      onCreated?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule report');
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
            Schedule this report
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
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500 truncate">Query: {initial.question}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Time (Manila)</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {frequency === 'weekly' && (
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Day of week</label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          <TelegramChatField chatId={chatId} onChange={setChatId} />

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Schedule
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
    try {
      await updateScheduledReport(r.id, { enabled: !r.enabled });
      await refresh();
    } finally {
      setBusyId(null);
    }
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
    try {
      await deleteScheduledReport(r.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
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
                    <p className="text-xs text-gray-400 mt-0.5">{frequencyLabel(r)} · chat {r.telegram_chat_id}</p>
                    {r.last_run_at && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Last run: {new Date(r.last_run_at).toLocaleString()} · {r.last_run_status}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => runNow(r)} disabled={busyId === r.id} className="p-1.5 text-gray-400 hover:text-green-400 disabled:opacity-40" title="Run now">
                      {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
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
    </div>
  );
}
