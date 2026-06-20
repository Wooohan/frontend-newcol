import React, { useMemo } from 'react';
import {
  MessageSquare,
  Clock,
  CheckCircle2,
  Users,
  Facebook,
  Inbox as InboxIcon,
  Wifi,
  WifiOff,
  ArrowUpRight,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useApp } from '../../store/AppContext';
import { ConversationStatus, UserRole } from '../../types';

interface DashboardViewProps {
  onNavigate?: (view: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  [ConversationStatus.OPEN]: '#2563eb',
  [ConversationStatus.PENDING]: '#f59e0b',
  [ConversationStatus.RESOLVED]: '#10b981',
};

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { currentUser, conversations, agents, pages, syncMetaConversations, isPolling, socketConnected, dashboardStats } = useApp();

  const isAdmin = currentUser?.role === UserRole.SUPER_ADMIN;

  // Scope conversations to what this user can actually see, mirroring InboxView's logic
  const visibleConversations = useMemo(() => {
    return conversations.filter((conv) => {
      if (isAdmin) return true;
      const page = pages.find((p) => p.id === conv.pageId);
      const agentIds = Array.isArray(page?.assignedAgentIds) ? page.assignedAgentIds : [];
      return agentIds.includes(currentUser?.id || '');
    });
  }, [conversations, pages, isAdmin, currentUser]);

  const openCount = visibleConversations.filter((c) => c.status === ConversationStatus.OPEN).length;
  const pendingCount = visibleConversations.filter((c) => c.status === ConversationStatus.PENDING).length;
  const resolvedCount = visibleConversations.filter((c) => c.status === ConversationStatus.RESOLVED).length;
  const unreadTotal = visibleConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const connectedPages = pages.filter((p) => p.isConnected).length;
  const onlineAgents = agents.filter((a) => a.status === 'online').length;

  // My Assigned: total conversations visible to this agent (their full inbox), same scope as InboxView
  const myAssignedCount = visibleConversations.length;

  const statCards = [
    {
      label: 'Open Conversations',
      value: openCount,
      icon: MessageSquare,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      sub: `${unreadTotal} unread`,
    },
    {
      label: 'Pending Reply',
      value: pendingCount,
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      sub: 'Awaiting agent response',
    },
    {
      label: 'Resolved',
      value: resolvedCount,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      sub: 'Closed conversations',
    },
    isAdmin
      ? {
          label: 'Agents Online',
          value: `${onlineAgents}/${agents.length}`,
          icon: Users,
          color: 'text-purple-600',
          bg: 'bg-purple-50 dark:bg-purple-900/20',
          sub: `${connectedPages}/${pages.length} pages connected`,
        }
      : {
          label: 'My Assigned Chats',
          value: myAssignedCount,
          icon: Users,
          color: 'text-purple-600',
          bg: 'bg-purple-50 dark:bg-purple-900/20',
          sub: 'Total chats in your inbox',
        },
  ];

  const statusPieData = [
    { name: 'Open', value: openCount, color: STATUS_COLORS[ConversationStatus.OPEN] },
    { name: 'Pending', value: pendingCount, color: STATUS_COLORS[ConversationStatus.PENDING] },
    { name: 'Resolved', value: resolvedCount, color: STATUS_COLORS[ConversationStatus.RESOLVED] },
  ].filter((d) => d.value > 0);

  const totalForPie = statusPieData.reduce((s, d) => s + d.value, 0);

  // Needs-attention queue: unread or pending conversations, most recent first
  const needsAttention = useMemo(() => {
    return [...visibleConversations]
      .filter((c) => c.unreadCount > 0 || c.status === ConversationStatus.PENDING)
      .sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
      .slice(0, 6);
  }, [visibleConversations]);

  // Agent leaderboard (admin-only): conversations currently assigned per agent
  const agentLoad = useMemo(() => {
    if (!isAdmin) return [];
    return agents
      .map((agent) => {
        const assigned = conversations.filter((c) => c.assignedAgentId === agent.id);
        return {
          agent,
          openCount: assigned.filter((c) => c.status !== ConversationStatus.RESOLVED).length,
          resolvedCount: assigned.filter((c) => c.status === ConversationStatus.RESOLVED).length,
        };
      })
      .sort((a, b) => b.openCount - a.openCount)
      .slice(0, 5);
  }, [agents, conversations, isAdmin]);

  const handleSync = () => syncMetaConversations(5);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Welcome back{currentUser ? `, ${currentUser.name.split(' ')[0]}` : ''}
          </h2>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${
                socketConnected
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800'
              }`}
            >
              {socketConnected ? <Wifi size={12} /> : <WifiOff size={12} className="animate-pulse" />}
              {socketConnected ? 'Live • Receiving Messages' : 'Reconnecting...'}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 text-slate-300 text-[10px] font-black uppercase tracking-widest border border-slate-800 dark:bg-slate-800">
                <Facebook size={12} /> {connectedPages} Page{connectedPages !== 1 ? 's' : ''} Connected
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={isPolling}
            className="px-5 py-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300 hover:border-blue-200 hover:text-blue-600 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={isPolling ? 'animate-spin' : ''} /> Sync Now
          </button>
          {onNavigate && (
            <button
              onClick={() => onNavigate('inbox')}
              className="px-5 py-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-600/20 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.1em] hover:bg-blue-700 transition-all"
            >
              <InboxIcon size={14} /> Open Inbox
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-900 p-7 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
          >
            <div className="flex items-center justify-between mb-5">
              <div className={`p-3.5 rounded-2xl ${stat.bg} ${stat.color}`}>
                <stat.icon size={24} />
              </div>
            </div>
            <p className="text-slate-400 text-[11px] font-black uppercase tracking-widest">{stat.label}</p>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1">{stat.value}</h3>
            <p className="text-slate-400 dark:text-slate-500 text-[11px] font-semibold mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Chart + Status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 md:p-10 rounded-[48px] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl">
                <MessageSquare size={20} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Conversation Volume</h3>
            </div>
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 border border-slate-100 dark:border-slate-700">
              Last 7 days
            </div>
          </div>
          <div className="h-72 w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboardStats.chartData}>
                <defs>
                  <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 900 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 900 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontSize: '13px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="conversations" stroke="#2563eb" strokeWidth={4} fillOpacity={1} fill="url(#colorConv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[48px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-slate-900 dark:bg-slate-800 text-white rounded-xl">
              <Sparkles size={20} />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Status Breakdown</h3>
          </div>

          {totalForPie > 0 ? (
            <>
              <div className="h-44 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', fontSize: '12px', fontWeight: 'bold' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">{totalForPie}</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total</span>
                </div>
              </div>
              <div className="space-y-3 mt-4">
                {statusPieData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{d.name}</span>
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-white">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 py-10">
              <MessageSquare size={32} className="opacity-20 mb-3" />
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40 text-center px-4">No conversations yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Needs attention + Agent leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[48px] border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500 text-white rounded-xl">
                <AlertCircle size={20} />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Needs Attention</h3>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('inbox')}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700"
              >
                View All <ArrowUpRight size={12} />
              </button>
            )}
          </div>

          {needsAttention.length > 0 ? (
            <div className="space-y-2">
              {needsAttention.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onNavigate && onNavigate('inbox')}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center font-black uppercase text-sm flex-shrink-0 overflow-hidden">
                    {conv.customerAvatar ? (
                      <img src={conv.customerAvatar} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                    ) : (
                      conv.customerName.charAt(0)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{conv.customerName}</p>
                      <span className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">{timeAgo(conv.lastTimestamp)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{conv.lastMessage}</p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-slate-300">
              <CheckCircle2 size={32} className="opacity-20 mb-3" />
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40">All caught up</p>
            </div>
          )}
        </div>

        <div className="bg-slate-900 dark:bg-slate-950 p-8 rounded-[48px] text-white shadow-2xl relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-64 h-64 bg-blue-600/20 rounded-full blur-[100px]" />

          {isAdmin ? (
            <>
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="p-2.5 bg-white/10 rounded-xl">
                  <Users size={20} />
                </div>
                <h3 className="text-xl font-black tracking-tight">Agent Workload</h3>
              </div>

              {agentLoad.length > 0 ? (
                <div className="space-y-4 relative z-10">
                  {agentLoad.map(({ agent, openCount: oc, resolvedCount: rc }) => (
                    <div key={agent.id} className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <img src={agent.avatar} className="w-10 h-10 rounded-xl object-cover" alt="" />
                        <span
                          className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                            agent.status === 'online' ? 'bg-emerald-400' : agent.status === 'busy' ? 'bg-amber-400' : 'bg-slate-500'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{agent.name}</p>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
                          {oc} active &middot; {rc} resolved
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-xs font-semibold relative z-10">No agents to show yet.</p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-8 relative z-10">
                <div className="p-2.5 bg-white/10 rounded-xl">
                  <Sparkles size={20} />
                </div>
                <h3 className="text-xl font-black tracking-tight">Your Performance</h3>
              </div>

              <div className="space-y-6 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">My Assigned Chats</span>
                  <span className="text-lg font-black">{myAssignedCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resolved</span>
                  <span className="text-lg font-black">{resolvedCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Response Time</span>
                  <span className="text-lg font-black">{dashboardStats.avgResponseTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CSAT</span>
                  <span className="text-lg font-black">{dashboardStats.csat}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
