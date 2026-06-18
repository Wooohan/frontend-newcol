import React, { useState, useEffect } from 'react';
import { Users, CheckSquare, Square, Loader2, Search, MessageCircle, Clock, CheckCircle2 } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { Conversation, ConversationStatus } from '../../types';

interface ContactListProps {
  onContactsSelected: (contacts: { id: string; customerId: string; customerName: string; pageId: string }[]) => void;
}

const ContactList: React.FC<ContactListProps> = ({ onContactsSelected }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ConversationStatus>(ConversationStatus.OPEN);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const data = await apiService.getAll<Conversation>('conversations');
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const grouped = {
    [ConversationStatus.OPEN]: conversations.filter(c => c.status === ConversationStatus.OPEN),
    [ConversationStatus.PENDING]: conversations.filter(c => c.status === ConversationStatus.PENDING),
    [ConversationStatus.RESOLVED]: conversations.filter(c => c.status === ConversationStatus.RESOLVED),
  };

  const filtered = grouped[activeTab].filter(c =>
    c.customerName.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allIds = filtered.map(c => c.id);
    const allSelected = allIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allIds.forEach(id => next.delete(id));
      } else {
        allIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleContinue = () => {
    const selectedContacts = conversations
      .filter(c => selected.has(c.id))
      .map(c => ({
        id: c.id,
        customerId: c.customerId,
        customerName: c.customerName,
        pageId: c.pageId,
      }));
    onContactsSelected(selectedContacts);
  };

  const tabs = [
    { status: ConversationStatus.OPEN, label: 'Open', icon: MessageCircle, color: 'blue' },
    { status: ConversationStatus.PENDING, label: 'Pending', icon: Clock, color: 'amber' },
    { status: ConversationStatus.RESOLVED, label: 'Resolved', icon: CheckCircle2, color: 'emerald' },
  ];

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-700 p-12 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-wrap gap-3 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.status}
              onClick={() => setActiveTab(tab.status)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all ${
                activeTab === tab.status
                  ? tab.color === 'blue'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : tab.color === 'amber'
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                      : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.status
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}>
                {grouped[tab.status].length}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Select All */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search contacts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 transition-all"
          >
            {filtered.length > 0 && filtered.every(c => selected.has(c.id))
              ? <CheckSquare size={16} className="text-blue-600" />
              : <Square size={16} />
            }
            Select All
          </button>
        </div>

        {/* Contact List */}
        <div className="max-h-[400px] overflow-y-auto space-y-2 custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-semibold">No contacts in this category</p>
            </div>
          ) : (
            filtered.map(conv => (
              <button
                key={conv.id}
                onClick={() => toggleSelect(conv.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all border ${
                  selected.has(conv.id)
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ring-1 ring-blue-100 dark:ring-blue-900'
                    : 'bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                  selected.has(conv.id)
                    ? 'bg-blue-600 text-white'
                    : 'border-2 border-slate-300 dark:border-slate-600'
                }`}>
                  {selected.has(conv.id) && <CheckSquare size={14} />}
                </div>
                <img
                  src={conv.customerAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.customerName)}&background=6366f1&color=fff`}
                  alt={conv.customerName}
                  className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-700 shadow-sm"
                />
                <div className="flex-1 text-left min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-white text-sm truncate">{conv.customerName}</p>
                  <p className="text-xs text-slate-400 truncate">{conv.lastMessage || 'No messages yet'}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Continue Button */}
      {selected.size > 0 && (
        <div className="sticky bottom-4">
          <button
            onClick={handleContinue}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-3 transform active:scale-[0.98]"
          >
            <Users size={18} />
            Continue with {selected.size} Contact{selected.size > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
};

export default ContactList;
