
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store';
import { THEMES } from '../theme';
import { CitySearchModal } from '../components/CitySearchModal';
import { 
  ChevronLeft, 
  User, 
  Bell, 
  MapPin, 
  Shield, 
  Palette, 
  LogOut, 
  ChevronRight, 
  Smartphone, 
  Info,
  Lock,
  Eye,
  Activity,
  Link as LinkIcon,
  CheckCircle2
} from 'lucide-react';

interface SettingsItemProps {
  icon: React.ReactNode;
  label: string;
  subtext?: string;
  onClick?: () => void;
  rightElement?: React.ReactNode;
}

const SettingsItem: React.FC<SettingsItemProps> = ({ icon, label, subtext, onClick, rightElement }) => {
  const { theme } = useApp();
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center justify-between p-5 transition-all active:bg-white/5 border-b"
      style={{ borderColor: `${theme.border}40` }}
    >
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${theme.surfaceAlt}` }}>
          {icon}
        </div>
        <div className="text-left">
          <p className="text-[11px] font-black uppercase tracking-widest">{label}</p>
          {subtext && <p className="text-[9px] opacity-40 font-bold uppercase tracking-tight mt-0.5">{subtext}</p>}
        </div>
      </div>
      {rightElement || <ChevronRight size={14} className="opacity-20" />}
    </button>
  );
};

export const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { theme, setThemeKey, logout, activeCity, setActiveCity, isTicketmasterConnected } = useApp();
  const [showCitySearch, setShowCitySearch] = useState(false);

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: theme.background }}>
      {/* Header */}
      <header className="px-6 pt-12 pb-6 flex items-center gap-4 border-b" style={{ borderColor: theme.border }}>
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 active:scale-90 transition-transform">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-xl font-black italic tracking-tighter uppercase">System Calibration</h2>
      </header>

      {/* Account Section */}
      <section className="mt-6">
        <div className="px-6 mb-3">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">Signal Identity</h3>
        </div>
        <div className="border-t border-white/5">
          <SettingsItem 
            icon={<User size={18} />} 
            label="Edit Frequency" 
            subtext="Update username & bio" 
          />
          <SettingsItem 
            icon={<Shield size={18} />} 
            label="Linked Circuits" 
            subtext="Spotify, Apple, Google" 
          />
        </div>
      </section>

      {/* External Relay Section */}
      <section className="mt-8">
        <div className="px-6 mb-3">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">Relay Nodes</h3>
        </div>
        <div className="border-t border-white/5">
          <SettingsItem 
            icon={<LinkIcon size={18} color="#026CDF" />} 
            label="Ticketmaster Relay" 
            subtext={isTicketmasterConnected ? "Node Active" : "API Key Not Configured"} 
            rightElement={
              isTicketmasterConnected ? (
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black uppercase text-[#026CDF]">Active</span>
                  <CheckCircle2 size={14} className="text-[#026CDF]" />
                </div>
              ) : (
                <span className="text-[8px] font-black uppercase opacity-30">Inactive</span>
              )
            }
          />
        </div>
      </section>

      {/* Preferences Section */}
      <section className="mt-8">
        <div className="px-6 mb-3">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">Territory Calibration</h3>
        </div>
        <div className="border-t border-white/5">
          <SettingsItem 
            icon={<MapPin size={18} />} 
            label="Home Turf" 
            subtext={activeCity.name} 
            onClick={() => setShowCitySearch(true)}
          />
          <SettingsItem 
            icon={<Bell size={18} />} 
            label="Neural Signals" 
            subtext="Tuning notifications" 
          />
          <SettingsItem 
            icon={<Lock size={18} />} 
            label="Stealth Protocol" 
            subtext="Privacy & Block list" 
          />
        </div>
      </section>

      {/* Theme Picker Section */}
      <section className="mt-8">
        <div className="px-6 mb-4">
          <div className="flex items-center gap-2">
            <Palette size={14} className="opacity-40" />
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">Visual Spectrum</h3>
          </div>
        </div>
        <div className="px-6 grid grid-cols-2 gap-3 mb-8">
          {Object.entries(THEMES).map(([key, t]) => (
            <button 
              key={key} 
              onClick={() => setThemeKey(key)}
              className="p-4 rounded-2xl flex flex-col gap-3 border-2 transition-all active:scale-95"
              style={{ 
                backgroundColor: t.background, 
                borderColor: theme.name === t.name ? theme.accent : 'transparent' 
              }}
            >
              <div className="flex justify-between items-start">
                <div className="flex gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.accent }} />
                  <div className="w-2.5 h-2.5 rounded-full opacity-50" style={{ backgroundColor: t.text }} />
                </div>
                {theme.name === t.name && (
                   <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                     <Smartphone size={8} color="#000" />
                   </div>
                )}
              </div>
              <span 
                className="text-[9px] font-black uppercase tracking-widest text-left"
                style={{ color: t.text }}
              >
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* System Section */}
      <section className="mt-4">
        <div className="px-6 mb-3">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">Protocol</h3>
        </div>
        <div className="border-t border-white/5">
          <SettingsItem 
            icon={<Info size={18} />} 
            label="Guidelines" 
            subtext="Community conduct" 
          />
          <SettingsItem 
            icon={<Activity size={18} />} 
            label="Clear Pulse Cache" 
            subtext="Refresh UI state" 
          />
          <SettingsItem 
            icon={<LogOut size={18} color="#ef4444" />} 
            label="Terminate Session" 
            onClick={() => {
              logout();
              navigate('/');
            }}
            rightElement={<span className="text-[9px] font-black uppercase text-red-500">Sign Out</span>}
          />
        </div>
      </section>

      <div className="px-6 py-12 text-center">
        <p className="text-[8px] font-black uppercase tracking-[0.4em] opacity-10">Inner City v1.0.4-beta</p>
        <p className="text-[8px] font-black uppercase tracking-widest opacity-5 mt-2">Relay protocol: active</p>
      </div>

      {/* City Search Modal */}
      <CitySearchModal
        isOpen={showCitySearch}
        onClose={() => setShowCitySearch(false)}
        onSelectCity={(city) => {
          setActiveCity(city);
          setShowCitySearch(false);
        }}
      />
    </div>
  );
};
