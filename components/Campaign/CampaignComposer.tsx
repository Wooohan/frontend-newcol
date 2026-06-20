import React, { useState } from 'react';
import { Send, Clock, Tag, MessageSquare, AlertTriangle, Loader2 } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { CampaignConfig } from './CampaignView';

interface CampaignComposerProps {
  config: CampaignConfig;
  setConfig: React.Dispatch<React.SetStateAction<CampaignConfig>>;
  onStart: (campaignId: string) => void;
}

const CampaignComposer: React.FC<CampaignComposerProps> = ({ config, setConfig, onStart }) => {
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async () => {
    if (!config.name.trim()) {
      setError('Please enter a campaign name');
      return;
    }
    if (!config.message.trim()) {
      setError('Please enter a message');
      return;
    }

    setLaunching(true);
    setError(null);

    try {
      const apiBase = apiService.getApiBase();
      const url = apiBase ? `${apiBase}/api/campaigns/start` : '/api/campaigns/start';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          message: config.message,
          delay: config.delay,
          contacts: config.selectedContacts,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to start campaign');
      }

      onStart(result.campaignId);
    } catch (err: any) {
      setError(err.message || 'Failed to launch campaign');
      setLaunching(false);
    }
  };

  const estimatedTime = config.selectedContacts.length * config.delay;
  const minutes = Math.floor(estimatedTime / 60);
  const seconds = estimatedTime % 60;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Compose Panel */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-700 p-8">
        <div className="space-y-6">
          {/* Campaign Name */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
              <Tag size={12} /> Campaign Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Summer Sale Announcement"
              className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
              <MessageSquare size={12} /> Message Content
            </label>
            <textarea
              value={config.message}
              onChange={e => setConfig(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Type your message here... This will be sent to all selected contacts."
              rows={6}
              className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium resize-none"
            />
            <p className="text-[10px] text-slate-400 ml-1">{config.message.length} / 2000 characters</p>
          </div>

          {/* Delay Slider */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
              <Clock size={12} /> Delay Between Messages
            </label>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {config.delay} second{config.delay !== 1 ? 's' : ''} between each message
                </span>
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-full">
                  {config.delay < 3 ? 'Fast' : config.delay < 8 ? 'Normal' : 'Safe'}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={30}
                value={config.delay}
                onChange={e => setConfig(prev => ({ ...prev, delay: parseInt(e.target.value) }))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between mt-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                <span>1s</span>
                <span>15s</span>
                <span>30s</span>
              </div>
            </div>
          </div>

          {/* Warning */}
          {config.delay < 3 && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
              <AlertTriangle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Rate Limit Warning</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                  Sending messages too quickly may trigger Facebook's rate limits. A delay of 3+ seconds is recommended.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-600 dark:text-red-400 text-sm font-semibold">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Summary Panel */}
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Campaign Summary</h3>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400">Recipients</span>
              <span className="text-sm font-bold text-slate-800 dark:text-white">{config.selectedContacts.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400">Delay</span>
              <span className="text-sm font-bold text-slate-800 dark:text-white">{config.delay}s</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400">Est. Duration</span>
              <span className="text-sm font-bold text-slate-800 dark:text-white">
                {minutes > 0 ? `${minutes}m ` : ''}{seconds}s
              </span>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Message Preview</span>
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-4">
                  {config.message || 'Your message will appear here...'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Launch Button */}
        <button
          onClick={handleLaunch}
          disabled={launching || !config.message.trim() || !config.name.trim()}
          className="w-full py-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-3 transform active:scale-[0.98]"
        >
          {launching ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Launching...
            </>
          ) : (
            <>
              <Send size={18} />
              Launch Campaign
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CampaignComposer;
