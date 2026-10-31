import type { SACItem, User, IssueRequest, ActiveBatch, IncomingTransfer } from '../types/index';

const API_BASE = '/api';

const TOKEN_KEY = 'sacpulse_auth_token';
const USER_KEY = 'sacpulse_auth_user';

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
      console.error('Failed to save auth to localStorage:', e);
    }
  },
  clearAuth(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error('Failed to clear auth from localStorage:', e);
    }
  }
};

export const api = {
  // Auth
  async loginWithGoogle(
    param: string | { credential?: string; email?: string; name?: string },
    name?: string,
    sub?: string
  ): Promise<{ token: string; sessionToken: string; user: User; requiresMobileSetup: boolean }> {
    const payload = typeof param === 'string'
      ? { email: param, name, sub }
      : param;

    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.success) {
      const err: any = new Error(json.error || 'Failed to authenticate');
      err.code = json.code;
      err.whitelistStatus = json.whitelistStatus;
      err.userEmail = json.userEmail;
      err.userName = json.userName;
      throw err;
    }
    return json.data;
  },

  // Whitelist Request & Status
  async requestWhitelist(payload: {
    email: string;
    name: string;
    mobileNo: string;
    reason?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/request-whitelist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to submit whitelist request');
    return json;
  },

  async getWhitelistStatus(email: string): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/whitelist-status?email=${encodeURIComponent(email)}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch whitelist status');
    return json.data;
  },

  // Admin Whitelist Management
  async getAdminWhitelist(): Promise<{ pendingRequests: any[]; activeUsers: any[]; initialAdminEmail?: string }> {
    const token = authStorage.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/admin/whitelist`, { headers });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch whitelist data');
    return json.data;
  },

  async approveWhitelist(requestId: string, role: 'STUDENT' | 'GUARD' | 'ADMIN'): Promise<any> {
    const token = authStorage.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/admin/whitelist/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId, role })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to approve whitelist request');
    return json;
  },

  async rejectWhitelist(requestId: string): Promise<any> {
    const token = authStorage.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/admin/whitelist/reject`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to reject whitelist request');
    return json;
  },

  async directAddWhitelist(payload: {
    email: string;
    name: string;
    mobileNo?: string;
    role: 'STUDENT' | 'GUARD' | 'ADMIN';
  }): Promise<any> {
    const token = authStorage.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/admin/whitelist/direct-add`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to add user to whitelist');
    return json;
  },

  async revokeWhitelist(id: string): Promise<any> {
    const token = authStorage.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/admin/whitelist/${id}`, {
      method: 'DELETE',
      headers
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to revoke whitelist access');
    return json;
  },

  async submitMobileSetup(
    mobileNo: string,
    token?: string,
    userId?: string
  ): Promise<User> {
    const authToken = token || authStorage.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    if (userId) {
      headers['x-user-id'] = userId;
    }

    const res = await fetch(`${API_BASE}/auth/mobile-setup`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ mobileNo, userId })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to update mobile number');
    return json.data;
  },

  getStoredUser: authStorage.getUser,
  getStoredToken: authStorage.getToken,
  setStoredAuth: authStorage.setAuth,
  clearStoredAuth: authStorage.clearAuth,
  // Inventory
  async getInventory(): Promise<SACItem[]> {
    const res = await fetch(`${API_BASE}/inventory`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch inventory');
    return json.data;
  },

  // Users
  async getUser(id: string): Promise<User> {
    const res = await fetch(`${API_BASE}/users/${id}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch user');
    return json.data;
  },

  async getAllUsers(): Promise<User[]> {
    const res = await fetch(`${API_BASE}/admin/users`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch users');
    return json.data;
  },

  // Student Holdings & Transfers
  async getStudentHoldings(studentId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/register/student/${studentId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch student holdings');
    return json.data;
  },

  async getIncomingTransfers(studentId: string): Promise<IncomingTransfer[]> {
    const res = await fetch(`${API_BASE}/transfers/incoming/${studentId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch incoming transfers');
    return json.data;
  },

  async createIssueRequest(
    studentId: string,
    items: Array<{ itemId: string; name: string; qty: number }>
  ): Promise<IssueRequest> {
    const res = await fetch(`${API_BASE}/issue-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, items })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to submit issue request');
    return json.data;
  },

  async initiateTransfer(
    entryId: string,
    studentId: string,
    recipientRollNo?: string,
    recipientId?: string
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/transfers/${entryId}/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, recipientRollNo, recipientId })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to initiate transfer');
    return json.data;
  },

  async cancelTransfer(entryId: string, studentId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/transfers/${entryId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to cancel transfer');
    return json.data;
  },

  async respondTransfer(entryId: string, studentId: string, action: 'ACCEPT' | 'REJECT'): Promise<any> {
    const res = await fetch(`${API_BASE}/transfers/${entryId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, action })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to respond to transfer');
    return json.data;
  },

  // Guard Desk
  async getPendingRequests(): Promise<IssueRequest[]> {
    const res = await fetch(`${API_BASE}/guard/requests/pending`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch pending requests');
    return json.data;
  },

  async approveRequest(requestId: string, guardId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/guard/requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guardId })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to approve request');
    return json.data;
  },

  async getActiveRegister(): Promise<ActiveBatch[]> {
    const res = await fetch(`${API_BASE}/guard/register/active`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch active register');
    return json.data;
  },

  async returnUnitIntact(entryId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/guard/returns/${entryId}/intact`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to mark unit returned');
    return json.data;
  },

  async returnBatchIntact(batchId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/guard/returns/batch/${batchId}/intact`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to mark batch returned');
    return json.data;
  },

  async returnUnitDamaged(entryId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/guard/returns/${entryId}/damaged`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to mark unit damaged');
    return json.data;
  },

  async occupyRoomForFaculty(roomId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/guard/rooms/${roomId}/faculty-occupy`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to occupy room for faculty');
    return json.data;
  },

  async releaseRoom(roomId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/guard/rooms/${roomId}/release`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to release room');
    return json.data;
  },

  // Admin Console
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

    const url = `${API_BASE}/admin/register-logs${query.toString() ? `?${query.toString()}` : ''}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch admin logs');
    return {
      logs: Array.isArray(json.data) ? json.data : [],
      totalCount: json.totalCount ?? (Array.isArray(json.data) ? json.data.length : 0),
      todayCount: json.todayCount ?? 0,
      totalPages: json.totalPages ?? 1,
      currentPage: json.currentPage ?? (params?.page || 1)
    };
  },

  async clearDefaulter(userId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/clear-defaulter`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to clear defaulter');
    return json.data;
  },

  async resetCooldown(userId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/reset-cooldown`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to reset cooldown');
    return json.data;
  },

  async upsertInventory(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/admin/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to upsert item');
    return json.data;
  },

  async deleteInventory(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/admin/inventory/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to delete item');
    return json.data;
  }
};
