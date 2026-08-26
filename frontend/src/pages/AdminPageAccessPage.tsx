/**
 * Admin — Users & Page Access
 *
 * Two tabs, mirrored in the URL like WarehousePage does:
 *   1. Page Access — toggle which pages each role can see, no redeploy
 *   2. Users       — create accounts, reset passwords, deactivate
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getPageAccess,
  listUsers,
  setPageAccess,
  updateUser,
  type PageAccessMatrix,
  type UserRecord,
} from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

type AdminTab = 'access' | 'users';

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'access', label: 'Page Access' },
  { key: 'users', label: 'Accounts' },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  warehouse_staff: 'Warehouse Staff',
};

const errText = (e: any, fallback: string) => e?.response?.data?.detail ?? fallback;

// ---------------------------------------------------------------------------
// Page access matrix
// ---------------------------------------------------------------------------

function PageAccessTab() {
  const [matrix, setMatrix] = useState<PageAccessMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const refreshMe = useAuthStore((s) => s.setUser);

  const load = useCallback(async () => {
    try {
      setMatrix(await getPageAccess());
      setError('');
    } catch (e: any) {
      setError(errText(e, 'Could not load page access.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (role: string, pageKey: string, enabled: boolean) => {
    const cell = `${role}:${pageKey}`;
    setSaving(cell);
    setError('');

    // Optimistic — the grid is a lot of small toggles and waiting on each
    // round-trip makes it feel broken.
    setMatrix((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.role === role && r.page_key === pageKey ? { ...r, enabled } : r,
            ),
          }
        : prev,
    );

    try {
      await setPageAccess(role, pageKey, enabled);
      // Changing your own role's access changes your own nav, so pull a fresh
      // /auth/me rather than waiting for a reload.
      const { fetchMe } = await import('../services/authApi');
      refreshMe(await fetchMe());
    } catch (e: any) {
      setError(errText(e, 'Could not save that change.'));
      await load(); // roll back to server truth
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="text-gray-400 text-sm">Loading…</div>;
  if (!matrix) return <div className="text-red-400 text-sm">{error}</div>;

  const isOn = (role: string, key: string) =>
    matrix.rows.find((r) => r.role === role && r.page_key === key)?.enabled ?? false;

  return (
    <div>
      <p className="text-sm text-gray-400 mb-4">
        Changes apply immediately — no redeploy and no re-login needed.
      </p>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <div className="overflow-x-auto border border-[#2e303d] rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900/60 text-gray-400">
              <th className="text-left font-medium px-4 py-3">Page</th>
              {matrix.roles.map((role) => (
                <th key={role} className="text-center font-medium px-4 py-3 whitespace-nowrap">
                  {ROLE_LABELS[role] ?? role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.page_keys.map((key) => (
              <tr key={key} className="border-t border-[#2e303d]">
                <td className="px-4 py-3 text-gray-200">{key}</td>
                {matrix.roles.map((role) => {
                  const cell = `${role}:${key}`;
                  const locked = role === 'admin' && key === 'admin';
                  return (
                    <td key={role} className="text-center px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isOn(role, key)}
                        disabled={locked || saving === cell}
                        onChange={(e) => toggle(role, key, e.target.checked)}
                        title={
                          locked
                            ? 'Admins must keep access to this page'
                            : undefined
                        }
                        className="w-4 h-4 accent-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UsersTab() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Inline passcode editing — which row is open, and its draft value.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPasscode, setDraftPasscode] = useState('');
  const [savingPasscode, setSavingPasscode] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers());
      setError('');
    } catch (e: any) {
      setError(errText(e, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);


  const setActive = async (user: UserRecord, active: boolean) => {
    setError('');
    setNotice('');
    try {
      await updateUser(user.id, { active });
      await load();
    } catch (e: any) {
      setError(errText(e, 'Could not update that user.'));
    }
  };

  const openPasscodeEditor = (user: UserRecord) => {
    setEditingId(user.id);
    setDraftPasscode('');
    setError('');
    setNotice('');
  };

  const cancelPasscodeEditor = () => {
    setEditingId(null);
    setDraftPasscode('');
  };

  const savePasscode = async (user: UserRecord) => {
    setSavingPasscode(true);
    setError('');
    setNotice('');
    try {
      await updateUser(user.id, { passcode: draftPasscode });
      setNotice(`Passcode updated for ${user.username}.`);
      cancelPasscodeEditor();
      await load();
    } catch (e: any) {
      setError(errText(e, 'Could not set that passcode.'));
    } finally {
      setSavingPasscode(false);
    }
  };

  return (
    <div>
      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}
      {notice && <div className="text-green-400 text-sm mb-3">{notice}</div>}

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto border border-[#2e303d] rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400">
                <th className="text-left font-medium px-4 py-3">Username</th>
                <th className="text-left font-medium px-4 py-3">Display name</th>
                <th className="text-left font-medium px-4 py-3">Role</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="border-t border-[#2e303d]">
                    <td className="px-4 py-3 text-gray-200">
                      {u.username}
                      {isSelf && <span className="ml-2 text-xs text-gray-500">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{u.display_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{ROLE_LABELS[u.role] ?? u.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          u.active
                            ? 'text-green-400 text-xs font-medium'
                            : 'text-gray-500 text-xs font-medium'
                        }
                      >
                        {u.active ? 'Active' : 'Deactivated'}
                      </span>
                      {/* Without a passcode there is no way to sign in as this
                          account, which is easy to miss otherwise. */}
                      {!u.has_passcode && (
                        <span className="ml-2 text-xs text-amber-400">no passcode</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {editingId === u.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={draftPasscode}
                            onChange={(e) => setDraftPasscode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && draftPasscode.length >= 8) savePasscode(u);
                              if (e.key === 'Escape') cancelPasscodeEditor();
                            }}
                            placeholder="New passcode (min 8)"
                            autoComplete="off"
                            autoFocus
                            className="w-48 bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={() => savePasscode(u)}
                            disabled={draftPasscode.length < 8 || savingPasscode}
                            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {savingPasscode ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelPasscodeEditor}
                            className="text-xs text-gray-500 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => openPasscodeEditor(u)}
                            className="text-xs text-blue-400 hover:text-blue-300 mr-4"
                          >
                            Set passcode
                          </button>
                          <button
                            onClick={() => setActive(u, !u.active)}
                            disabled={isSelf}
                            title={isSelf ? 'You cannot deactivate your own account' : undefined}
                            className="text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {u.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const AdminPageAccessPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: AdminTab = searchParams.get('tab') === 'users' ? 'users' : 'access';

  const selectTab = (tab: AdminTab) => {
    setSearchParams(tab === 'access' ? {} : { tab }, { replace: true });
  };

  // min-w-0 lets the tables and the add-user grid shrink inside the layout
  // instead of forcing the whole page wider than the viewport.
  return (
    <div className="h-full min-w-0">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 sm:mb-2">Admin</h1>
        <p className="text-sm sm:text-base text-gray-400">
          {activeTab === 'access'
            ? 'Control which pages each role can see.'
            : 'Change the passcode for each account.'}
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-[#2e303d]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => selectTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'access' ? <PageAccessTab /> : <UsersTab />}
    </div>
  );
};

export default AdminPageAccessPage;
