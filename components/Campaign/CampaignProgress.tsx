import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, RotateCcw, Loader2, History, Megaphone } from 'lucide-react';
import { getSocket } from '../../services/socketService';
import { apiService } from '../../services/apiService';
import { CampaignConfig } from './CampaignView';

interface CampaignProgressProps {
  campaignId: string | null;
  config: CampaignConfig;
  onReset: () => void;
}

interface ProgressData {
  sent: number;
  failed: number;
  total: number;
  currentContact: string;
  status: 'running' | 'completed' | 'failed';
}

interface CampaignHistoryItem {
  id: string;
  name: string;
  message: string;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  status: string;
  created_at: string;
}

const CampaignProgress: React.FC<CampaignProgressProps> = ({ campaignId, config, onReset }) => {
  const [progress, setProgress] = useState<ProgressData>({
    sent: 0,
    failed: 0,
    total: config.selectedContacts.length,
    currentContact: '',
    status: 'running',
  });
  const [history, setHistory] = useState<CampaignHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const handleProgress = (data: any) => {
      if (data.campaignId === campaignId) {
        setProgress(prev => ({
          ...prev,
          sent: data.sent,
          failed: data.failed,
          total: data.total,
          currentContact: data.currentContact || '',
          status: 'running',
        }));
      }
    };

    const handleComplete = (data: any) => {
      if (data.campaignId === campaignId) {
        setProgress(prev => ({
          ...prev,
          sent: data.sent,
          failed: data.failed,
          total: data.total,
          currentContact: '',
          status: data.status || 'completed',
        }));
      }
    };

    socket.on('campaign_progress', handleProgress);
    socket.on('campaign_complete', handleComplete);

    return () => {
      socket.off('campaign_progress', handleProgress);
      socket.off('campaign_complete', handleComplete);
    };
  }, [campaignId]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const apiBase = apiService.getApiBase();
      const url = apiBase ? `${apiBase}/api/campaigns/history` : '/api/campaigns/history';
      const response = await fetch(url);
      const data = await response.json();
      if (data.campaigns) {
        setHistory(data.campaigns);
      }
    } catch (err) {
      console.error('Failed to load campaign history:', err);
    }
  };

  const percentage = progress.total > 0
    ? Math.round(((progress.sent + progress.failed) / progress.total) * 100)
    : 0;

  const isComplete = progress.status === 'completed' || progress.status === 'failed';

  return (
    <div className="space-y-6">
      {/* Active Campaign Progress */}
      <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-700 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">{config.name || 'Campaign'}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              {isComplete ? 'Campaign Complete' : 'Sending Messages...'}
            </p>
          </div>
          {isComplete ? (
            <div className={`px-4 py-2 rounded-full text-xs font-bold ${
              progress.failed === 0
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
            }`}>
              {progress.failed === 0 ? 'All Sent' : 'Completed with Errors'}
            </div>
          ) : (
            <Loader2 size={24} className="animate-spin text-blue-600" />
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{percentage}%</span>
            <span className="text-xs text-slate-400">{progress.sent + progress.failed} / {progress.total}</span>
          </div>
          <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full flex transition-all duration-500 ease-out">
              <div
                className="bg-emerald-500 transition-all duration-500"
                style={{ width: `${progress.total > 0 ? (progress.sent / progress.total) * 100 : 0}%` }}
              />
              <div
                className="bg-red-500 transition-all duration-500"
                style={{ width: `${progress.total > 0 ? (progress.failed / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 text-center border border-emerald-100 dark:border-emerald-800">
            <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-2" />
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{progress.sent}</p>
            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-1">Sent</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 text-center border border-red-100 dark:border-red-800">
            <XCircle size={20} className="mx-auto text-red-500 mb-2" />
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{progress.failed}</p>
            <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mt-1">Failed</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 text-center border border-slate-100 dark:border-slate-700">
            <Clock size={20} className="mx-auto text-slate-400 mb-2" />
            <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">
              {progress.total - progress.sent - progress.failed}
            </p>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Remaining</p>
          </div>
        </div>

        {/* Current Contact */}
        {!isComplete && progress.currentContact && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800 flex items-center gap-3">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              Sending to: <strong>{progress.currentContact}</strong>
            </span>
          </div>
        )}

        {/* Actions */}
        {isComplete && (
          <button
            onClick={onReset}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-3 mt-4"
          >
            <RotateCcw size={18} />
            Start New Campaign
          </button>
        )}
      </div>

      {/* History Toggle */}
      <button
        onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
      >
        <History size={16} />
        {showHistory ? 'Hide' : 'Show'} Campaign History
      </button>

      {/* Campaign History */}
      {showHistory && (
        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Megaphone size={12} /> Past Campaigns
          </h3>

          {history.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <History size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No campaigns yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
              {history.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-slate-800 dark:text-white truncate">{item.name}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(item.created_at).toLocaleDateString()} • {item.total_contacts} contacts
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{item.sent_count} sent</span>
                    {item.failed_count > 0 && (
                      <span className="text-xs font-bold text-red-500">{item.failed_count} failed</span>
                    )}
                    <div className={`w-2 h-2 rounded-full ${
                      item.status === 'completed' ? 'bg-emerald-500' : item.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-red-500'
                    }`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CampaignProgress;
