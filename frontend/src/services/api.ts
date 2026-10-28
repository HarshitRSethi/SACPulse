import type { SACItem, User, IssueRequest, ActiveBatch, IncomingTransfer } from '../types/index';

const API_BASE = '/api';

export const api = {
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

  // Admin Console
  async getAdminLogs(status?: string): Promise<any[]> {
    const url = status && status !== 'ALL' 
      ? `${API_BASE}/admin/register-logs?status=${status}` 
      : `${API_BASE}/admin/register-logs`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch admin logs');
    return json.data;
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
  }
};
