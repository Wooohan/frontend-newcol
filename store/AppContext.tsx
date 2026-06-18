
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { User, UserRole, FacebookPage, Conversation, Message, ConversationStatus, ApprovedLink, ApprovedMedia } from '../types';
import { MASTER_ADMIN, MOCK_USERS } from '../constants';
import { apiService } from '../services/apiService';
import { fetchPageConversations, fetchThreadMessages, verifyPageAccessToken } from '../services/facebookService';
import { onNewMessage, onConversationUpdated, getSocket, disconnectSocket } from '../services/socketService';

interface SystemLog {
  id: string;
  timestamp: string;
  type: 'info' | 'error' | 'success';
  message: string;
  details?: string;
}

interface CollectionStat {
  name: string;
  count: number;
  lastWrite?: string;
}

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  pages: FacebookPage[];
  updatePage: (id: string, updates: Partial<FacebookPage>) => Promise<void>;
  addPage: (page: FacebookPage) => Promise<void>;
  removePage: (id: string) => Promise<void>;
  conversations: Conversation[];
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  messages: Message[];
  addMessage: (msg: Message) => Promise<void>;
  bulkAddMessages: (msgs: Message[], silent?: boolean) => Promise<void>;
  agents: User[];
  addAgent: (agent: User) => Promise<void>;
  removeAgent: (id: string) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  assignAgentToPage: (agentId: string, pageId: string) => Promise<void>;
  unassignAgentFromPage: (agentId: string, pageId: string) => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  syncMetaConversations: (limit?: number) => Promise<void>;
  syncFullHistory: () => Promise<void>;
  verifyPageConnection: (pageId: string) => Promise<boolean>;
  approvedLinks: ApprovedLink[];
  addApprovedLink: (link: ApprovedLink) => Promise<void>;
  removeApprovedLink: (id: string) => Promise<void>;
  approvedMedia: ApprovedMedia[];
  addApprovedMedia: (media: ApprovedMedia) => Promise<void>;
  removeApprovedMedia: (id: string) => Promise<void>;
  dbStatus: 'connected' | 'syncing' | 'error' | 'initializing' | 'uninitialized';
  dbName: string;
  dbError: string | null;
  dbLogs: SystemLog[];
  dbCollections: CollectionStat[];
  lastSyncTime: string | null;
  isPolling: boolean;
  refreshMetadata: () => Promise<void>;
  dashboardStats: any;
  forceWriteTest: () => Promise<boolean>;
  clearLocalChats: () => Promise<void>;
  socketConnected: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const USER_SESSION_KEY = 'messengerflow_session_v2';

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dbStatus, setDbStatus] = useState<'connected' | 'syncing' | 'error' | 'initializing' | 'uninitialized'>('initializing');
  const [dbName] = useState('PostgreSQL');
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbLogs, setDbLogs] = useState<SystemLog[]>([]);
  const [dbCollections, setDbCollections] = useState<CollectionStat[]>([]);

  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<User[]>(MOCK_USERS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [approvedLinks, setApprovedLinks] = useState<ApprovedLink[]>([]);
  const [approvedMedia, setApprovedMedia] = useState<ApprovedMedia[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  const convsRef = useRef<Conversation[]>([]);

  useEffect(() => {
    convsRef.current = conversations;
  }, [conversations]);

  const addLog = (type: 'info' | 'error' | 'success', message: string, details?: string) => {
    const newLog: SystemLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      details,
    };
    setDbLogs((prev) => [newLog, ...prev].slice(0, 50));
  };

  // =============================================
  // SOCKET.IO REALTIME — replaces all polling
  // =============================================
  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => {
      setSocketConnected(true);
      // Re-fetch data after reconnection to avoid stale state
      loadDataFromCloud();
    });
    socket.on('disconnect', () => setSocketConnected(false));

    const unsubMsg = onNewMessage((msg: Message) => {
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    const unsubConv = onConversationUpdated((conv: any) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conv.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...conv };
          return updated;
        }
        // New conversation from webhook
        return [conv, ...prev];
      });
    });

    return () => {
      unsubMsg();
      unsubConv();
    };
  }, []);

  // =============================================
  // Meta sync (on-demand only, not polling)
  // =============================================
  const syncMetaConversations = useCallback(async (limit: number = 5) => {
    if (pages.length === 0 || isPolling) return;
    setIsPolling(true);

    try {
      let hasChanges = false;
      const updatedConvIds: { convId: string; pageId: string; accessToken: string }[] = [];

      const syncPromises = pages.map(async (page) => {
        if (!page.accessToken) return;
        try {
          const meta = await fetchPageConversations(page.id, page.accessToken, limit, true);

          const updates = meta.filter((mConv) => {
            const existing = convsRef.current.find((c) => c.id === mConv.id);
            if (!existing) return true;
            return new Date(mConv.lastTimestamp).getTime() > new Date(existing.lastTimestamp).getTime();
          });

          if (updates.length > 0) {
            hasChanges = true;
            await Promise.all(updates.map((c) => apiService.put('conversations', c)));
            updates.forEach((c) => updatedConvIds.push({ convId: c.id, pageId: page.id, accessToken: page.accessToken }));
          }
        } catch (e) {
          console.warn(`Sync failed for ${page.name}`, e);
        }
      });

      await Promise.all(syncPromises);

      // Fetch and store messages for updated conversations
      if (updatedConvIds.length > 0) {
        const msgPromises = updatedConvIds.map(async ({ convId, pageId, accessToken }) => {
          try {
            const msgs = await fetchThreadMessages(convId, pageId, accessToken);
            if (msgs.length > 0) {
              await Promise.all(msgs.map((m) => apiService.put('messages', m)));
              setMessages((prev) => {
                const existingIds = new Set(prev.map((m) => m.id));
                const uniqueNew = msgs.filter((m) => !existingIds.has(m.id));
                if (uniqueNew.length === 0) return prev;
                return [...prev, ...uniqueNew];
              });
            }
          } catch (e) {
            console.warn(`Message sync failed for ${convId}`, e);
          }
        });
        await Promise.all(msgPromises);
      }

      if (hasChanges || limit > 5) {
        const all = await apiService.getAll<Conversation>('conversations');
        setConversations(all);
      }

      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      addLog('error', 'Sync Exception', err.message);
    } finally {
      setIsPolling(false);
    }
  }, [pages, isPolling]);

  const syncFullHistory = async () => {
    addLog('info', 'Deep History Sync: Pulling 50+ users from Meta...');
    await syncMetaConversations(50);
    addLog('success', 'Deep History Loaded');
  };

  const loadDataFromCloud = async () => {
    setDbStatus('syncing');
    try {
      const [agentsData, pagesData, convsData, msgsData, linksData, mediaData] = await Promise.all([
        apiService.getAll<User>('agents'),
        apiService.getAll<FacebookPage>('pages'),
        apiService.getAll<Conversation>('conversations'),
        apiService.getAll<Message>('messages'),
        apiService.getAll<ApprovedLink>('links'),
        apiService.getAll<ApprovedMedia>('media'),
      ]);

      setAgents(agentsData.length > 0 ? agentsData : MOCK_USERS);
      setPages(pagesData);
      setConversations(convsData);
      setMessages(msgsData);
      setApprovedLinks(linksData);
      setApprovedMedia(mediaData);

      setDbStatus('connected');
      addLog('success', 'Real-time Infrastructure Connected');

      const session = localStorage.getItem(USER_SESSION_KEY);
      if (session) setCurrentUser(JSON.parse(session));
    } catch (err: any) {
      setDbStatus('error');
      setDbError(err.message);
    }
  };

  // One-time initial sync from Meta on login (NOT polling)
  useEffect(() => {
    if (dbStatus === 'connected' && currentUser && pages.length > 0) {
      syncMetaConversations(5);
    }
  }, [dbStatus, currentUser, pages.length]);

  useEffect(() => {
    loadDataFromCloud();
    return () => { disconnectSocket(); };
  }, []);

  const value: AppContextType = {
    currentUser,
    setCurrentUser,
    pages,
    addPage: async (p) => {
      await apiService.put('pages', p);
      setPages((prev) => [...prev, p]);
      // Auto-subscribe page to Meta webhooks for realtime messages
      try {
        const base = apiService.getApiBase();
        const url = base ? `${base}/api/subscribe-page` : '/api/subscribe-page';
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: p.id, accessToken: p.accessToken }),
        });
      } catch (e) {
        console.warn('Auto-subscribe page to webhooks failed:', e);
      }
    },
    removePage: async (id) => {
      await apiService.delete('pages', id);
      setPages((prev) => prev.filter((p) => p.id !== id));
    },
    updatePage: async (id, u) => {
      const updated = pages.map((p) => (p.id === id ? { ...p, ...u } : p));
      setPages(updated);
      const page = updated.find((p) => p.id === id);
      if (page) await apiService.put('pages', page);
    },
    conversations: [...conversations].sort(
      (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
    ),
    updateConversation: async (id, u) => {
      const updated = conversations.map((c) => (c.id === id ? { ...c, ...u } : c));
      setConversations(updated);
      const conv = updated.find((c) => c.id === id);
      if (conv) await apiService.put('conversations', conv);
    },
    deleteConversation: async (id) => {
      await apiService.delete('conversations', id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    },
    messages,
    addMessage: async (m) => {
      setMessages((prev) => {
        if (prev.find((existing) => existing.id === m.id)) return prev;
        return [...prev, m];
      });
      await apiService.put('messages', m);
    },
    bulkAddMessages: async (msgs, silent) => {
      if (!silent) {
        await Promise.all(msgs.map((m) => apiService.put('messages', m)));
      }
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const uniqueNew = msgs.filter((m) => !existingIds.has(m.id));
        if (uniqueNew.length === 0) return prev;
        return [...prev, ...uniqueNew];
      });
    },
    agents,
    addAgent: async (a) => {
      await apiService.put('agents', a);
      setAgents((prev) => [...prev, a]);
    },
    removeAgent: async (id) => {
      await apiService.delete('agents', id);
      setAgents((p) => p.filter((a) => a.id !== id));
    },
    updateUser: async (id, u) => {
      const updated = agents.map((a) => (a.id === id ? { ...a, ...u } : a));
      setAgents(updated);
      const agent = updated.find((a) => a.id === id);
      if (agent) await apiService.put('agents', agent);
    },
    assignAgentToPage: async (agentId: string, pageId: string) => {
      // Single source of truth: pages.assignedAgentIds only
      const safeArr = (val: any): string[] => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') { try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {} }
        return [];
      };

      const page = pages.find((p) => p.id === pageId);
      if (page) {
        const currentAgentIds = safeArr(page.assignedAgentIds);
        if (!currentAgentIds.includes(agentId)) {
          const newAgentIds = [...currentAgentIds, agentId];
          const updatedPages = pages.map((p) => (p.id === pageId ? { ...p, assignedAgentIds: newAgentIds } : p));
          setPages(updatedPages);
          const updatedPage = updatedPages.find((p) => p.id === pageId);
          if (updatedPage) await apiService.put('pages', updatedPage);
        }
      }
    },
    unassignAgentFromPage: async (agentId: string, pageId: string) => {
      // Single source of truth: pages.assignedAgentIds only
      const safeArr = (val: any): string[] => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') { try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {} }
        return [];
      };

      const page = pages.find((p) => p.id === pageId);
      if (page) {
        const currentAgentIds = safeArr(page.assignedAgentIds);
        if (currentAgentIds.includes(agentId)) {
          const newAgentIds = currentAgentIds.filter((id) => id !== agentId);
          const updatedPages = pages.map((p) => (p.id === pageId ? { ...p, assignedAgentIds: newAgentIds } : p));
          setPages(updatedPages);
          const updatedPage = updatedPages.find((p) => p.id === pageId);
          if (updatedPage) await apiService.put('pages', updatedPage);
        }
      }
    },
    login: async (e, p) => {
      if (e === MASTER_ADMIN.email && p === MASTER_ADMIN.password) {
        setCurrentUser(MASTER_ADMIN);
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(MASTER_ADMIN));
        return true;
      }
      const remoteUser = agents.find((u) => u.email === e && u.password === p);
      if (remoteUser) {
        setCurrentUser(remoteUser);
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(remoteUser));
        return true;
      }
      return false;
    },
    logout: async () => {
      localStorage.removeItem(USER_SESSION_KEY);
      setCurrentUser(null);
    },
    syncMetaConversations,
    syncFullHistory,
    verifyPageConnection: async (id) => {
      const page = pages.find((p) => p.id === id);
      return page ? await verifyPageAccessToken(id, page.accessToken) : false;
    },
    approvedLinks,
    addApprovedLink: async (l) => {
      await apiService.put('links', l);
      setApprovedLinks((p) => [...p, l]);
    },
    removeApprovedLink: async (id) => {
      await apiService.delete('links', id);
      setApprovedLinks((p) => p.filter((l) => l.id !== id));
    },
    approvedMedia,
    addApprovedMedia: async (m) => {
      await apiService.put('media', m);
      setApprovedMedia((p) => [...p, m]);
    },
    removeApprovedMedia: async (id) => {
      await apiService.delete('media', id);
      setApprovedMedia((p) => p.filter((m) => m.id !== id));
    },
    dbStatus,
    dbName,
    dbError,
    dbLogs,
    dbCollections,
    lastSyncTime,
    isPolling,
    refreshMetadata: async () => {
      const collections = await apiService.getDbMetadata();
      setDbCollections(collections);
    },
    dashboardStats: {
      openChats: conversations.filter((c) => c.status === ConversationStatus.OPEN).length,
      avgResponseTime: '0m 45s',
      resolvedToday: conversations.filter((c) => c.status === ConversationStatus.RESOLVED).length,
      csat: '99%',
      chartData: [
        { name: 'Mon', conversations: 14 },
        { name: 'Tue', conversations: 28 },
        { name: 'Wed', conversations: 31 },
        { name: 'Thu', conversations: 19 },
        { name: 'Fri', conversations: 44 },
      ],
    },
    forceWriteTest: async () => {
      try {
        return await apiService.manualWriteToTest();
      } catch {
        return false;
      }
    },
    clearLocalChats: async () => {
      localStorage.removeItem(USER_SESSION_KEY);
      window.location.reload();
    },
    socketConnected,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
