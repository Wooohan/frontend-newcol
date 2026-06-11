import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, X, Link as LinkIcon, Image as ImageIcon, Library, AlertCircle, ChevronDown, Check, MessageSquare, Loader2, Trash2, ShieldAlert, Clock, Info, Zap } from 'lucide-react';
import { Conversation, Message, ApprovedLink, ApprovedMedia, UserRole, ConversationStatus } from '../../types';
import { useApp } from '../../store/AppContext';
import { apiService } from '../../services/apiService';
import { fetchThreadMessages, sendPageMessageWithImage } from '../../services/facebookService';

interface ChatWindowProps {
  conversation: Conversation;
  onDelete?: () => void;
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
  'bg-teal-500', 'bg-orange-500', 'bg-violet-500', 'bg-lime-600',
];

const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const CachedAvatar: React.FC<{ conversation: Conversation, className?: string }> = ({ conversation, className }) => {
  const [imgError, setImgError] = useState(false);

  // Use customerAvatar URL directly, or fall back to customerAvatarBlob if available
  const avatarUrl = conversation.customerAvatar || '';
  const blobUrl = conversation.customerAvatarBlob ? URL.createObjectURL(conversation.customerAvatarBlob) : null;
  const src = avatarUrl || blobUrl || '';

  // Reset error state when conversation changes
  useEffect(() => {
    setImgError(false);
  }, [conversation.id, conversation.customerAvatar]);

  if (src && !imgError) {
    return (
      <img
        src={src}
        className={className}
        alt=""
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  const colorClass = getAvatarColor(conversation.customerName);

  return (
    <div className={`${className} ${colorClass} flex items-center justify-center text-white font-bold text-lg uppercase overflow-hidden`}>
      {conversation.customerName.charAt(0)}
    </div>
  );
};

const ChatWindow: React.FC<ChatWindowProps> = ({ conversation, onDelete }) => {
  const { currentUser, messages, pages, approvedLinks, approvedMedia, updateConversation, deleteConversation, socketConnected, bulkAddMessages } = useApp();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [lastError, setLastError] = useState<{message: string, isPolicy?: boolean} | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showRestrictedPopup, setShowRestrictedPopup] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = currentUser?.role === UserRole.SUPER_ADMIN;

  const isWindowExpired = useMemo(() => {
    const lastTime = new Date(conversation.lastTimestamp).getTime();
    const now = new Date().getTime();
    return (now - lastTime) > (24 * 60 * 60 * 1000);
  }, [conversation.lastTimestamp]);

  const chatMessages = useMemo(() => {
    const convMsgs = messages
      .filter(m => m.conversationId === conversation.id)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    // Deduplicate: same text+direction within 3s are considered the same message
    // (DB-stored msg_* and Meta m_* IDs can differ by ~1-2s)
    const result: typeof convMsgs = [];
    for (const m of convMsgs) {
      const ts = new Date(m.timestamp).getTime();
      const isDup = result.some(r =>
        r.text === m.text &&
        r.isIncoming === m.isIncoming &&
        Math.abs(new Date(r.timestamp).getTime() - ts) < 3000
      );
      if (!isDup) result.push(m);
    }
    return result;
  }, [messages, conversation.id]);

  // Load messages: first from backend DB, then fetch latest from Meta API.
  // New messages arrive in realtime via Socket.IO (see AppContext).
  useEffect(() => {
    const loadMessages = async () => {
      if (chatMessages.length === 0) setIsLoadingMessages(true);
      try {
        // 1. Load existing messages from backend DB
        const url = apiService.getApiBase()
          ? `${apiService.getApiBase()}/api/messages/${conversation.id}`
          : `/api/messages/${conversation.id}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            bulkAddMessages(data.messages, true);
          }
        }

        // 2. Fetch latest messages from Meta Graph API and store in DB
        const currentPage = pages.find(p => p.id === conversation.pageId);
        if (currentPage?.accessToken) {
          try {
            const metaMsgs = await fetchThreadMessages(conversation.id, conversation.pageId, currentPage.accessToken);
            if (metaMsgs.length > 0) {
              bulkAddMessages(metaMsgs, true);
            }
          } catch (err) {
            console.warn('[Chat] Failed to fetch Meta messages:', err);
          }
        }
      } catch (err) {
        console.error('[Chat] Failed to load messages:', err);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadMessages();
  }, [conversation.id, conversation.pageId, pages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSend = async (forcedText?: string) => {
    const textToSubmit = (forcedText || inputText).trim();
    if (!textToSubmit || isSending) return;

    setIsSending(true);
    setLastError(null);

    const currentPage = pages.find(p => p.id === conversation.pageId);
    
    try {
      // Check if the text is a base64 image
      if (textToSubmit.includes('data:image')) {
        // Send image directly to Meta via frontend API
        await sendPageMessageWithImage(
          conversation.customerId,
          textToSubmit,
          currentPage?.accessToken || '',
          isWindowExpired ? 'HUMAN_AGENT' : undefined
        );
      } else {
        // Send text message via backend
        await apiService.sendMessage({
          conversationId: conversation.id,
          text: textToSubmit,
          senderId: currentUser?.id || 'agent',
          senderName: currentUser?.name || 'Agent',
          customerId: conversation.customerId,
          pageAccessToken: currentPage?.accessToken || '',
          isWindowExpired
        });
      }
      
      if (!forcedText) setInputText('');
    } catch (err: any) {
      setLastError({
        message: err.message,
        isPolicy: err.code === 10 || err.subcode === 2018034
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleStatusChange = async (newStatus: ConversationStatus) => {
    try {
      await apiService.put('conversations', { ...conversation, status: newStatus });
      updateConversation({ ...conversation, status: newStatus });
      setShowStatusMenu(false);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this conversation?')) return;
    try {
      await apiService.delete('conversations', conversation.id);
      deleteConversation(conversation.id);
      if (onDelete) onDelete();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <CachedAvatar conversation={conversation} className="w-12 h-12 rounded-2xl shadow-sm" />
          <div>
            <h3 className="font-bold text-slate-800 dark:text-white text-lg">{conversation.customerName}</h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {socketConnected ? 'Live Connection' : 'Reconnecting...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold transition-all border border-slate-100 dark:border-slate-700"
            >
              <div className={`w-2 h-2 rounded-full ${
                conversation.status === ConversationStatus.OPEN ? 'bg-blue-500' :
                conversation.status === ConversationStatus.PENDING ? 'bg-amber-500' : 'bg-emerald-500'
              }`} />
              {conversation.status}
              <ChevronDown size={16} className={`transition-transform ${showStatusMenu ? 'rotate-180' : ''}`} />
            </button>

            {showStatusMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowStatusMenu(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 py-2 z-30 animate-in fade-in zoom-in duration-200">
                  {Object.values(ConversationStatus).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        status === ConversationStatus.OPEN ? 'bg-blue-500' :
                        status === ConversationStatus.PENDING ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      {status}
                      {conversation.status === status && <Check size={14} className="ml-auto text-blue-500" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {isAdmin && (
            <button
              onClick={handleDelete}
              className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
              title="Delete Conversation"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-slate-50/30 dark:bg-slate-900/30"
      >
        {isLoadingMessages && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        )}

        {chatMessages.length === 0 && !isLoadingMessages && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
              <MessageSquare size={32} />
            </div>
            <p className="text-sm font-medium">No messages yet. Start the conversation!</p>
          </div>
        )}

        {chatMessages.map((msg) => {
          // Robust image detection for both sent (base64) and received (Meta URLs)
          const text = (msg.text || '').trim();
          
          // Regex to extract base64 or URL even if there's other text
          const base64Regex = /data:image\/[a-zA-Z]*;base64,[^\s"']*/;
          const urlRegex = /https?:\/\/[^\s"']+(?:\.(?:jpeg|jpg|gif|png|webp|svg)|scontent|fbcdn\.net|attachment_id|lookaside)[^\s"']*/i;
          
          const base64Match = text.match(base64Regex);
          const urlMatch = text.match(urlRegex);
          
          const imageUrl = base64Match ? base64Match[0] : (urlMatch ? urlMatch[0] : null);
          const isImage = !!imageUrl;

          return (
            <div key={msg.id} className={`flex ${msg.isIncoming ? 'justify-start' : 'justify-end'} animate-in slide-in-from-bottom-2 duration-300`}>
              <div className={`flex flex-col space-y-1 max-w-[75%] ${msg.isIncoming ? 'items-start' : 'items-end'}`}>
                <div className={`rounded-2xl shadow-sm ${
                  msg.isIncoming 
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none' 
                    : 'bg-blue-600 text-white rounded-tr-none'
                } ${isImage ? 'p-1 overflow-hidden min-w-[120px]' : 'px-4 py-3'}`}>
                  {isImage ? (
                    <div className="relative group/img">
                      <img 
                        src={imageUrl} 
                        alt="Attachment" 
                        className="rounded-xl max-w-full h-auto block cursor-pointer hover:opacity-95 transition-opacity bg-slate-100 dark:bg-slate-700" 
                        style={{ minHeight: '60px' }}
                        onClick={() => window.open(imageUrl, '_blank')}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'block';
                        }}
                      />
                      <div className="hidden p-3 text-[13px] opacity-60 break-all italic">
                        {text}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-medium px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        {lastError && (
          <div className={`mb-4 p-4 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2 ${
            lastError.isPolicy ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}>
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold">{lastError.isPolicy ? '24h Window Expired' : 'Message Failed'}</p>
              <p className="opacity-90">{lastError.message}</p>
            </div>
            <button onClick={() => setLastError(null)} className="ml-auto hover:opacity-70"><X size={16} /></button>
          </div>
        )}

        <div className="flex items-end gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-[24px] border border-slate-100 dark:border-slate-700 focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/5 transition-all">
          <div className="relative">
            <button
              onClick={() => setShowLibrary(!showLibrary)}
              className="p-3 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-full transition-all shrink-0"
              title="Approved Assets"
            >
              <Library size={22} />
            </button>

            {showLibrary && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowLibrary(false)} />
                <div className="absolute bottom-full left-0 mb-4 w-80 bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden z-30 animate-in slide-in-from-bottom-4 duration-300">
                  <div className="p-5 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                    <h4 className="font-bold text-slate-800 dark:text-white">Library Assets</h4>
                    <button onClick={() => setShowLibrary(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                  </div>
                  <div className="max-h-96 overflow-y-auto p-4 space-y-6">
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Approved Links</p>
                      {approvedLinks.map(link => (
                        <button
                          key={link.id}
                          onClick={() => { handleSend(link.url); setShowLibrary(false); }}
                          className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-2xl transition-all group"
                        >
                          <div className="p-2 bg-white dark:bg-slate-600 rounded-xl shadow-sm text-blue-500 group-hover:scale-110 transition-transform"><LinkIcon size={16} /></div>
                          <div className="text-left overflow-hidden">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{link.title}</p>
                            <p className="text-[10px] text-slate-400 truncate">{link.url}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Approved Media</p>
                      <div className="grid grid-cols-2 gap-3">
                        {approvedMedia.map(media => (
                          <button
                            key={media.id}
                            onClick={() => { handleSend(media.url); setShowLibrary(false); }}
                            className="group relative aspect-square rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700 hover:border-blue-500 transition-all"
                          >
                            <img src={media.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                              <p className="text-[10px] text-white font-bold truncate">{media.title}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 text-[15px] py-3 max-h-32 resize-none"
            rows={1}
          />

          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isSending}
            className={`p-3 rounded-full transition-all shrink-0 ${
              !inputText.trim() || isSending 
                ? 'text-slate-300 bg-slate-100 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed' 
                : 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0'
            }`}
          >
            {isSending ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} />}
          </button>
        </div>
        <p className="text-[10px] text-center text-slate-400 mt-3 font-medium">
          {isWindowExpired ? 'Standard 24h window expired. Using Human Agent tag.' : 'Standard 24h messaging window is active.'}
        </p>
      </div>
    </div>
  );
};

export default ChatWindow;
