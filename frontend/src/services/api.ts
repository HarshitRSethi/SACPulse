import type {
  ActiveBatch,
  IncomingTransfer,
  IssueRequest,
  RegisterEntryUnit,
  SACItem,
  User
} from '../types/index';

function resolveApiBase(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!configured) {
    return '/api';
  }
  const normalized = configured.replace(/\/+$/, '');
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

const API_BASE = resolveApiBase();

const TOKEN_KEY = 'sacpulse_auth_token';
const USER_KEY = 'sacpulse_auth_user';

type UnauthorizedHandler = () => void;
let unauthorizedListener: UnauthorizedHandler | null = null;

export const authStorage = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  getUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setAuth(token: string, user: User): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to persist session to localStorage:', e);
    }
  },
  clearAuth(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error('Failed to clear session from localStorage:', e);
    }
  },
  onUnauthorized(listener: UnauthorizedHandler | null): void {
    unauthorizedListener = listener;
  }
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  tokenOverride?: string;
  skipAuthRedirect?: boolean;
}

async function requestEnvelope<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<{ data: T; raw: any }> {
  const token = options.tokenOverride ?? authStorage.getToken();
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const json = await res.json().catch(() => ({
    success: false,
    error: `HTTP ${res.status} response`
  }));

  if (res.status === 401 && !options.skipAuthRedirect && authStorage.getToken()) {
    authStorage.clearAuth();
    unauthorizedListener?.();
  }

  if (!res.ok || !json.success) {
    const err: any = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = json.code;
    err.whitelistStatus = json.whitelistStatus;
    err.userEmail = json.userEmail;
    err.userName = json.userName;
    throw err;
  }

  return { data: json.data as T, raw: json };
}

export const api = {
  getStoredUser: authStorage.getUser,
  getStoredToken: authStorage.getToken,
  setStoredAuth: authStorage.setAuth,
  clearStoredAuth: authStorage.clearAuth,
  onUnauthorized: authStorage.onUnauthorized,

  // 0. Authentication & Demo Role Switching
  async loginWithGoogle(payload: {
    credential: string;
  }): Promise<{ token: string; sessionToken: string; user: User; requiresMobileSetup: boolean }> {
    const { data } = await requestEnvelope('/auth/google', {
      method: 'POST',
      body: payload,
      skipAuthRedirect: true
    });
    return data;
  },

  async loginDemoSession(
    email: string,
    name?: string
  ): Promise<{ token: string; sessionToken: string; user: User; requiresMobileSetup: boolean }> {
    const { data } = await requestEnvelope('/auth/demo-session', {
      method: 'POST',
      body: { email, name },
      skipAuthRedirect: true
    });
    return data;
  },

  async submitMobileSetup(mobileNo: string, token?: string): Promise<User> {
    const { data } = await requestEnvelope<User>('/auth/mobile-setup', {
      method: 'PATCH',
      body: { mobileNo },
      tokenOverride: token
    });
    return data;
  },

  async requestWhitelist(payload: {
    email: string;
    name: string;
    mobileNo: string;
    reason?: string;
  }): Promise<any> {
    const { raw } = await requestEnvelope('/auth/request-whitelist', {
      method: 'POST',
      body: payload,
      skipAuthRedirect: true
    });
    return raw;
  },

  async getWhitelistStatus(email: string): Promise<any> {
    const { data } = await requestEnvelope(
      `/auth/whitelist-status?email=${encodeURIComponent(email)}`,
      { skipAuthRedirect: true }
    );
    return data;
  },

  // 1. Live Privacy-Safe Inventory
  async getInventory(): Promise<SACItem[]> {
    const { data } = await requestEnvelope<SACItem[]>('/inventory', {
      skipAuthRedirect: true
    });
    return data;
  },

  // 2. Users
  async getUser(id: string): Promise<User> {
    const { data } = await requestEnvelope<User>(`/users/${id}`);
    return data;
  },

  async getAllUsers(): Promise<User[]> {
    const { data } = await requestEnvelope<User[]>('/admin/users');
    return data;
  },

  // 3. Student Checkouts, Active Holdings & Peer Transfers
  async getStudentHoldings(studentId: string): Promise<RegisterEntryUnit[]> {
    const { data } = await requestEnvelope<RegisterEntryUnit[]>(
      `/register/student/${studentId}`
    );
    return data;
  },

  async getMyPendingRequests(): Promise<IssueRequest[]> {
    const { data } = await requestEnvelope<IssueRequest[]>('/issue-requests/my-pending');
    return data;
  },

  async getIncomingTransfers(studentId: string): Promise<IncomingTransfer[]> {
    const { data } = await requestEnvelope<IncomingTransfer[]>(
      `/transfers/incoming/${studentId}`
    );
    return data;
  },

  async createIssueRequest(
    studentId: string,
    items: Array<{ itemId: string; name: string; qty: number }>
  ): Promise<IssueRequest> {
    const { data } = await requestEnvelope<IssueRequest>('/issue-requests', {
      method: 'POST',
      body: { studentId, items }
    });
    return data;
  },

  async initiateTransfer(
    entryId: string,
    studentId: string,
    recipientRollNo?: string,
    recipientId?: string
  ): Promise<any> {
    const { data } = await requestEnvelope(`/transfers/${entryId}/initiate`, {
      method: 'POST',
      body: { studentId, recipientRollNo, recipientId }
    });
    return data;
  },

  async cancelTransfer(entryId: string, studentId: string): Promise<any> {
    const { data } = await requestEnvelope(`/transfers/${entryId}/cancel`, {
      method: 'POST',
      body: { studentId }
    });
    return data;
  },

  async respondTransfer(
    entryId: string,
    studentId: string,
    action: 'ACCEPT' | 'REJECT'
  ): Promise<any> {
    const { data } = await requestEnvelope(`/transfers/${entryId}/respond`, {
      method: 'POST',
      body: { studentId, action }
    });
    return data;
  },

  // 4. Guard Counter Operations
  async getPendingRequests(): Promise<IssueRequest[]> {
    const { data } = await requestEnvelope<IssueRequest[]>('/guard/requests/pending');
    return data;
  },

  async approveRequest(requestId: string, guardId: string): Promise<any> {
    const { data } = await requestEnvelope(`/guard/requests/${requestId}/approve`, {
      method: 'POST',
      body: { guardId }
    });
    return data;
  },

  async getActiveRegister(): Promise<ActiveBatch[]> {
    const { data } = await requestEnvelope<ActiveBatch[]>('/guard/register/active');
    return data;
  },

  async returnUnitIntact(entryId: string): Promise<any> {
    const { data } = await requestEnvelope(`/guard/returns/${entryId}/intact`, {
      method: 'POST'
    });
    return data;
  },

  async returnBatchIntact(batchId: string): Promise<any> {
    const { data } = await requestEnvelope(`/guard/returns/batch/${batchId}/intact`, {
      method: 'POST'
    });
    return data;
  },

  async returnUnitDamaged(entryId: string): Promise<any> {
    const { data } = await requestEnvelope(`/guard/returns/${entryId}/damaged`, {
      method: 'POST'
    });
    return data;
  },

  async occupyRoomForFaculty(roomId: string): Promise<any> {
    const { data } = await requestEnvelope(`/guard/rooms/${roomId}/faculty-occupy`, {
      method: 'POST'
    });
    return data;
  },

  async releaseRoom(roomId: string): Promise<any> {
    const { data } = await requestEnvelope(`/guard/rooms/${roomId}/release`, {
      method: 'POST'
    });
    return data;
  },

  // 5. Admin Governance Console
  async getAdminLogs(params?: { status?: string; page?: number; limit?: number }): Promise<{
    logs: any[];
    totalCount: number;
    todayCount: number;
    totalPages: number;
    currentPage: number;
  }> {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));

    const path = `/admin/register-logs${query.toString() ? `?${query.toString()}` : ''}`;
    const { raw } = await requestEnvelope(path);
    return {
      logs: Array.isArray(raw.data) ? raw.data : [],
      totalCount: raw.totalCount ?? (Array.isArray(raw.data) ? raw.data.length : 0),
      todayCount: raw.todayCount ?? 0,
      totalPages: raw.totalPages ?? 1,
      currentPage: raw.currentPage ?? (params?.page || 1)
    };
  },

  async downloadAdminLogsCsv(statusFilter?: string): Promise<void> {
    const query = new URLSearchParams({ format: 'csv' });
    if (statusFilter && statusFilter !== 'ALL') {
      query.set('status', statusFilter);
    }

    const token = authStorage.getToken();
    const res = await fetch(`${API_BASE}/admin/register-logs?${query.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!res.ok) {
      throw new Error(`CSV export failed (HTTP ${res.status})`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sacpulse_register_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async clearDefaulter(userId: string): Promise<any> {
    const { data } = await requestEnvelope(`/admin/users/${userId}/clear-defaulter`, {
      method: 'POST'
    });
    return data;
  },

  async resetCooldown(userId: string): Promise<any> {
    const { data } = await requestEnvelope(`/admin/users/${userId}/reset-cooldown`, {
      method: 'POST'
    });
    return data;
  },

  async upsertInventory(payload: {
    id?: string;
    name: string;
    category: string;
    itemType: 'EQUIPMENT' | 'ROOM_KEY';
    totalQty?: number;
    availableQty?: number;
    damagedQty?: number;
  }): Promise<any> {
    const { data } = await requestEnvelope('/admin/inventory', {
      method: 'POST',
      body: payload
    });
    return data;
  },

  async deleteInventory(id: string): Promise<any> {
    const { data } = await requestEnvelope(`/admin/inventory/${id}`, {
      method: 'DELETE'
    });
    return data;
  },

  async getAdminWhitelist(): Promise<{
    pendingRequests: any[];
    activeUsers: any[];
    initialAdminEmail?: string;
  }> {
    const { data } = await requestEnvelope('/admin/whitelist');
    return data;
  },

  async approveWhitelist(
    requestId: string,
    role: 'STUDENT' | 'GUARD' | 'ADMIN'
  ): Promise<any> {
    const { raw } = await requestEnvelope('/admin/whitelist/approve', {
      method: 'POST',
      body: { requestId, role }
    });
    return raw;
  },

  async rejectWhitelist(requestId: string): Promise<any> {
    const { raw } = await requestEnvelope('/admin/whitelist/reject', {
      method: 'POST',
      body: { requestId }
    });
    return raw;
  },

  async directAddWhitelist(payload: {
    email: string;
    name: string;
    mobileNo?: string;
    role: 'STUDENT' | 'GUARD' | 'ADMIN';
  }): Promise<any> {
    const { raw } = await requestEnvelope('/admin/whitelist/direct-add', {
      method: 'POST',
      body: payload
    });
    return raw;
  },

  async revokeWhitelist(id: string): Promise<any> {
    const { raw } = await requestEnvelope(`/admin/whitelist/${id}`, {
      method: 'DELETE'
    });
    return raw;
  }
};
