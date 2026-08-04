/**
 * Scheduled Reports API Service
 * Schedule a chat-generated report (question + SQL) to re-run on future days
 * and deliver to Telegram.
 */

const API_BASE_URL = '/api/v1/scheduled-reports';

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ScheduledReport {
  id: string;
  title: string;
  question: string;
  sql: string;
  frequency: Frequency;
  times: string[];           // ["08:00","17:30"]
  days_of_week: number[];    // Mon=0 … Sun=6 (weekly)
  days_of_month: number[];   // 1..31, 31 => last day (monthly)
  day_times: Record<string, string[]>; // per-weekday times (custom)
  telegram_chat_ids: string[];
  // legacy (still returned)
  day_of_week: number;
  hour: number;
  minute: number;
  telegram_chat_id: string;
  include_csv: boolean;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_detail: string | null;
  created_at: string | null;
}

export interface ScheduledReportCreate {
  title: string;
  question: string;
  sql: string;
  frequency: Frequency;
  times: string[];
  days_of_week: number[];
  days_of_month: number[];
  day_times: Record<string, string[]>;
  telegram_chat_ids: string[];
  include_csv?: boolean;
  enabled?: boolean;
}

export interface TelegramChat {
  chat_id: string;
  name: string;
  type: string;
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return resp.json();
}

export async function listScheduledReports(): Promise<ScheduledReport[]> {
  // No trailing slash: Vercel's /api/v1/:path* rewrite doesn't match one.
  return handle(await fetch(`${API_BASE_URL}`));
}

export async function createScheduledReport(data: ScheduledReportCreate): Promise<ScheduledReport> {
  return handle(await fetch(`${API_BASE_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function updateScheduledReport(id: string, data: Partial<ScheduledReportCreate>): Promise<ScheduledReport> {
  return handle(await fetch(`${API_BASE_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function deleteScheduledReport(id: string): Promise<void> {
  await handle(await fetch(`${API_BASE_URL}/${id}`, { method: 'DELETE' }));
}

export async function runScheduledReportNow(id: string): Promise<{ status: string; error?: string }> {
  return handle(await fetch(`${API_BASE_URL}/${id}/run-now`, { method: 'POST' }));
}

export async function getTelegramStatus(): Promise<{ configured: boolean }> {
  return handle(await fetch(`${API_BASE_URL}/telegram/status`));
}

export async function discoverTelegramChats(): Promise<{ chats: TelegramChat[] }> {
  return handle(await fetch(`${API_BASE_URL}/telegram/discover-chats`));
}

export async function testTelegram(chatId: string): Promise<{ success: boolean }> {
  return handle(await fetch(`${API_BASE_URL}/telegram/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_chat_id: chatId }),
  }));
}
