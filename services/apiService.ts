
import { User, FacebookPage, Conversation, Message, ApprovedLink, ApprovedMedia } from '../types';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

class APIService {
  private apiPath: string;

  constructor() {
    this.apiPath = API_BASE ? `${API_BASE}/api/db` : '/api/db';
  }

  private async relayRequest(action: string, collection: string, body: any) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(this.apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ action, collection, ...body }),
      });

      clearTimeout(timeoutId);

      const result = await response.json();
      if (!response.ok) {
        const err = new Error(result.error || `Relay Error: ${response.status}`);
        (err as any).status = response.status;
        (err as any).details = result.details;
        throw err;
      }
      return result;
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('CONNECTION_TIMEOUT: The server took too long to respond.');
      }
      throw e;
    }
  }

  getApiBase() { return API_BASE; }

  async sendMessage(payload: {
    conversationId: string;
    text: string;
    senderId: string;
    senderName: string;
    customerId: string;
    pageAccessToken: string;
    isWindowExpired: boolean;
  }) {
    const url = API_BASE ? `${API_BASE}/api/send-message` : '/api/send-message';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      const err = new Error(result.error || 'Send failed');
      (err as any).code = result.fbError?.code;
      (err as any).subcode = result.fbError?.error_subcode;
      throw err;
    }
    return result;
  }

  async markConversationAsRead(conversationId: string): Promise<any> {
    const url = API_BASE 
      ? `${API_BASE}/api/conversations/${conversationId}/mark-read`
      : `/api/conversations/${conversationId}/mark-read`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to mark conversation as read: ${response.statusText}`);
    }
    
    return response.json();
  }

  setDatabase(_name: string) {}
  getDatabaseName() { return 'PostgreSQL'; }

  async getDbMetadata(): Promise<{ name: string; count: number; lastWrite?: string; exists?: boolean }[]> {
    try {
      const res = await this.relayRequest('listCollections', '', {});
      return res.collections || [];
    } catch {
      return [];
    }
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.relayRequest('ping', 'system', {});
      return res.ok === true;
    } catch {
      return false;
    }
  }

  async testWrite(): Promise<boolean> {
    try {
      const result = await this.relayRequest('updateOne', 'provisioning_logs', {
        update: {
          $set: {
            id: 'heartbeat',
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
          },
        },
      });
      return result.ok === true;
    } catch {
      return false;
    }
  }

  async manualWriteToTest(): Promise<boolean> {
    return this.testWrite();
  }

  async getAll<T>(collection: string, filter: any = {}): Promise<T[]> {
    const result = await this.relayRequest('find', collection, { filter });
    return result.documents || [];
  }

  async put<T>(collection: string, item: T): Promise<void> {
    await this.relayRequest('updateOne', collection, { update: { $set: item } });
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.relayRequest('deleteOne', collection, { filter: { id } });
  }

  async clearStore(collection: string): Promise<void> {
    await this.relayRequest('deleteMany', collection, {});
  }

  setCredentials(_endpoint: string, _key: string): void {}
  isConfigured(): boolean { return true; }
}

export const apiService = new APIService();
