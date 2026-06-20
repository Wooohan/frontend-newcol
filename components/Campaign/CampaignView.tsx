import React, { useState } from 'react';
import { Megaphone, ArrowLeft } from 'lucide-react';
import ContactList from './ContactList';
import CampaignComposer from './CampaignComposer';
import CampaignProgress from './CampaignProgress';

export interface CampaignConfig {
  name: string;
  message: string;
  delay: number;
  selectedContacts: { id: string; customerId: string; customerName: string; pageId: string }[];
}

const CampaignView: React.FC = () => {
  const [step, setStep] = useState<'contacts' | 'compose' | 'progress'>('contacts');
  const [config, setConfig] = useState<CampaignConfig>({
    name: '',
    message: '',
    delay: 3,
    selectedContacts: [],
  });
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

  const handleContactsSelected = (contacts: CampaignConfig['selectedContacts']) => {
    setConfig(prev => ({ ...prev, selectedContacts: contacts }));
    setStep('compose');
  };

  const handleCampaignStart = (campaignId: string) => {
    setActiveCampaignId(campaignId);
    setStep('progress');
  };

  const handleReset = () => {
    setConfig({ name: '', message: '', delay: 3, selectedContacts: [] });
    setActiveCampaignId(null);
    setStep('contacts');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {step !== 'contacts' && (
            <button
              onClick={() => {
                if (step === 'compose') setStep('contacts');
                else handleReset();
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                <Megaphone size={20} />
              </div>
              Campaigns
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 ml-[52px]">
              {step === 'contacts' && 'Select contacts to message'}
              {step === 'compose' && `${config.selectedContacts.length} contacts selected`}
              {step === 'progress' && 'Campaign in progress'}
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="hidden md:flex items-center gap-2">
          {['contacts', 'compose', 'progress'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step === s
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : i < ['contacts', 'compose', 'progress'].indexOf(step)
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}>
                {i + 1}
              </div>
              {i < 2 && (
                <div className={`w-8 h-0.5 ${
                  i < ['contacts', 'compose', 'progress'].indexOf(step)
                    ? 'bg-emerald-500'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      {step === 'contacts' && (
        <ContactList onContactsSelected={handleContactsSelected} />
      )}
      {step === 'compose' && (
        <CampaignComposer
          config={config}
          setConfig={setConfig}
          onStart={handleCampaignStart}
        />
      )}
      {step === 'progress' && (
        <CampaignProgress
          campaignId={activeCampaignId}
          config={config}
          onReset={handleReset}
        />
      )}
    </div>
  );
};

export default CampaignView;
