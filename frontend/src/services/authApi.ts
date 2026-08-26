import axios from 'axios';
import type { AuthUser } from '../stores/authStore';

const API_V1 = '/api/v1';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const response = await axios.post<LoginResponse>(`${API_V1}/auth/login`, { username, password });
  return response.data;
};

/** Current identity, role and allowed page_keys. Used to re-validate on load. */
export const fetchMe = async (): Promise<AuthUser> => {
  const response = await axios.get<AuthUser>(`${API_V1}/auth/me`);
  return response.data;
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  await axios.post(`${API_V1}/auth/change-password`, {
    current_password: currentPassword,
    new_password: newPassword,
  });
};

// --- Admin: users ---

export interface UserRecord {
  id: string;
  username: string;
  role: string;
  display_name: string | null;
  active: boolean;
  created_at: string;
}

export const listUsers = async (): Promise<UserRecord[]> => {
  const response = await axios.get<UserRecord[]>(`${API_V1}/admin/users`);
  return response.data;
};

export const createUser = async (payload: {
  username: string;
  password: string;
  role: string;
  display_name?: string;
}): Promise<UserRecord> => {
  const response = await axios.post<UserRecord>(`${API_V1}/admin/users`, payload);
  return response.data;
};

export const updateUser = async (
  userId: string,
  payload: { display_name?: string; role?: string; active?: boolean; password?: string },
): Promise<UserRecord> => {
  const response = await axios.patch<UserRecord>(`${API_V1}/admin/users/${userId}`, payload);
  return response.data;
};

// --- Admin: page access ---

export interface PageAccessRow {
  role: string;
  page_key: string;
  enabled: boolean;
}

export interface PageAccessMatrix {
  roles: string[];
  page_keys: string[];
  rows: PageAccessRow[];
}

export const getPageAccess = async (): Promise<PageAccessMatrix> => {
  const response = await axios.get<PageAccessMatrix>(`${API_V1}/admin/page-access`);
  return response.data;
};

export const setPageAccess = async (
  role: string,
  pageKey: string,
  enabled: boolean,
): Promise<PageAccessRow> => {
  const response = await axios.post<PageAccessRow>(`${API_V1}/admin/page-access`, {
    role,
    page_key: pageKey,
    enabled,
  });
  return response.data;
};
