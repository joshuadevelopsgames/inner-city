
import React, { useState } from 'react';
import { useApp } from '../store';
import { Badge, NeonButton } from '../components/UI';
import { Settings, Share2, Smartphone, ChevronRight, Clock, MapPin, ReceiptText, QrCode, ExternalLink, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { Ticket, Event } from '../types';
import { motion } from 'framer-motion';
import { getOptimizedImageUrl } from '../utils/imageOptimization';

const TicketCard: React.FC<{ ticket: Ticket; event: Event; isHistory?: boolean }> = ({ ticket, event, isHistory }) => {
  const { theme } = useApp();
  const isLight = theme.background === '#FFFFFF';
  const isTM = ticket.source === 'ticketmaster';

  let formattedDate = 'TBA';
  try {
    if (event.startAt) {
      formattedDate = format(new Date(event.startAt), 'EEEE, MMM dd • HH:mm');
    }
  } catch (err) {
    console.error("Date formatting error:", err);
  }

  return (
    <div
      className={`rounded-[2.5rem] overflow-hidden border mb-8 transition-opacity duration-300 ${isHistory ? 'opacity-40 grayscale' : 'opacity-100'}`}
      style={{ 
        backgroundColor: theme.surface, 
        borderColor: isTM ? '#026CDF44' : theme.border,
        boxShadow: isLight && !isHistory ? '0 10px 40px rgba(0,0,0,0.06)' : 'none'
      }}
    >
      {!isHistory && (
        <div className="h-44 w-full relative overflow-hidden">
          <img 
            src={event.mediaUrls && event.mediaUrls[0] ? getOptimizedImageUrl(event.mediaUrls[0], 'card') : 'https://picsum.photos/seed/placeholder/800/400'} 
            alt="" 
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <div 
            className="absolute inset-0 bg-gradient-to-t" 
            style={{ backgroundImage: `linear-gradient(to bottom, transparent 0%, ${theme.surface} 100%)` }} 
          />
          <div className="absolute top-6 left-6 flex gap-2">
             <div className="bg-white text-black px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-2">
               <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isTM ? 'bg-blue-500' : 'bg-green-500'}`} />
               {isTM ? 'TICKETMASTER RELAY' : 'AUTHENTICATED ACCESS'}
             </div>
          </div>
        </div>
      )}

      <div className="p-8">
        <div className="mb-8">
          <div className="flex justify-between items-start mb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">{ticket.type}</p>
            {isTM && <ExternalLink size={12} className="text-[#026CDF]" />}
          </div>
          <h3 className="text-3xl font-black italic tracking-tighter uppercase leading-none mb-4">
            {event.title || 'Untitled Session'}
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-[11px] font-black uppercase tracking-widest" style={{ color: isTM ? '#026CDF' : theme.accent }}>
              <Clock size={14} strokeWidth={3} />
              {formattedDate}
            </div>
            <div className="flex items-center gap-2.5 text-[11px] font-black uppercase tracking-widest opacity-30">
              <MapPin size={14} strokeWidth={3} />
              {event.venueName || 'Secret Location'}
            </div>
          </div>
        </div>

        {!isHistory && (
          <div className="space-y-8">
            <div className="flex items-center gap-4 opacity-10">
              <div className="flex-1 h-[1px] border-b border-dashed border-current" />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 mb-1.5">Gateway</p>
                <p className="text-sm font-bold uppercase tracking-tight">{ticket.gate || 'North'}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 mb-1.5">Sector</p>
                <p className="text-sm font-bold uppercase tracking-tight">{ticket.section || 'Floor'}</p>
              </div>
            </div>

            <div className={`flex flex-col items-center gap-5 py-8 rounded-[2.5rem] border ${isTM ? 'bg-blue-500/5 border-blue-500/10' : 'bg-black/5 border-white/5'}`}>
              <div className="p-5 rounded-3xl bg-white shadow-xl relative">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${ticket.qrCode || 'UNKNOWN'}&color=${isTM ? '026CDF' : '000000'}&bgcolor=ffffff`} 
                  alt="QR Access" 
                  className="w-40 h-40 block"
                />
                {isTM && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-2 rounded-lg shadow-lg">
                    <div className="w-8 h-8 flex items-center justify-center font-black text-[8px] tracking-tighter border-2 border-[#026CDF] text-[#026CDF] rounded">
                      TM
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[10px] font-mono opacity-20 tracking-[0.5em] uppercase">{ticket.qrCode}</p>
            </div>

            <div className="flex gap-4">
              <NeonButton className="flex-1 text-[11px] py-4 h-14 uppercase font-black" style={isTM ? { backgroundColor: '#026CDF', color: '#FFF' } : {}}>
                <Smartphone size={18} /> Apple Wallet
              </NeonButton>
              <button 
                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-90" 
                style={{ backgroundColor: theme.surfaceAlt, color: theme.text }}
              >
                <Share2 size={22} />
              </button>
            </div>
          </div>
        )}

        {isHistory && (
          <div className="flex items-center justify-between pt-6 border-t border-white/5">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-30">SESSION EXPIRED</span>
            <button className="text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-full" style={{ backgroundColor: theme.surfaceAlt, color: isTM ? '#026CDF' : theme.accent }}>
              Relive Trace
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const Wallet: React.FC = () => {
  const { tickets = [], events = [], theme, isTicketmasterConnected } = useApp();
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeTickets = tickets.filter(t => t.status === 'active');
  const pastTickets = tickets.filter(t => t.status !== 'active');

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  return (
    <div className="px-6 py-6 pb-20 min-h-screen">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-none">The Vault</h2>
          <div className="flex items-center gap-2 mt-3">
             <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Verified Access Repository</p>
             {isTicketmasterConnected && (
               <div className="px-2 py-0.5 rounded bg-blue-500/10 text-[#026CDF] text-[7px] font-black tracking-widest uppercase">Relay Active</div>
             )}
          </div>
        </div>
        <button 
          onClick={handleRefresh}
          className="p-3.5 rounded-full active:scale-95 transition-transform" 
          style={{ backgroundColor: theme.surfaceAlt }}
        >
          <motion.div animate={isRefreshing ? { rotate: 360 } : {}}>
            <RefreshCw size={22} className={isRefreshing ? 'opacity-100' : 'opacity-40'} />
          </motion.div>
        </button>
      </div>

      <div className="flex gap-10 mb-10 border-b border-white/5">
        <button 
          onClick={() => setActiveTab('active')}
          className={`relative pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-colors ${activeTab === 'active' ? '' : 'opacity-40'}`}
          style={{ color: theme.text }}
        >
          Live Keys
          {activeTab === 'active' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 rounded-full" style={{ backgroundColor: theme.accent }} />
          )}
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`relative pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-colors ${activeTab === 'history' ? '' : 'opacity-40'}`}
          style={{ color: theme.text }}
        >
          Archives
          {activeTab === 'history' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 rounded-full" style={{ backgroundColor: theme.accent }} />
          )}
        </button>
      </div>

      <div>
        {activeTab === 'active' ? (
          activeTickets.length > 0 ? (
            activeTickets.map(ticket => {
              const event = events.find(e => e.id === ticket.eventId);
              if (!event) return null;
              return <TicketCard key={ticket.id} ticket={ticket} event={event} isHistory={false} />;
            })
          ) : (
            <div className="py-32 text-center opacity-20 flex flex-col items-center gap-6">
              <div className="p-8 rounded-full bg-white/5">
                <QrCode size={56} strokeWidth={1} />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em]">Vault is currently empty</p>
            </div>
          )
        ) : (
          pastTickets.length > 0 ? (
            pastTickets.map(ticket => {
              const event = events.find(e => e.id === ticket.eventId);
              if (!event) return null;
              return <TicketCard key={ticket.id} ticket={ticket} event={event} isHistory={true} />;
            })
          ) : (
             <div className="py-32 text-center opacity-20 flex flex-col items-center gap-6">
              <p className="text-[11px] font-black uppercase tracking-[0.2em]">No past entries found</p>
            </div>
          )
        )}
      </div>

      {activeTab === 'active' && activeTickets.length > 0 && (
        <div className="py-8 text-center">
           <p className="text-[8px] font-black uppercase tracking-[0.6em] opacity-10">
            {isTicketmasterConnected ? 'RELAY SYNCED // INNER CITY PROTOCOL' : 'ENCRYPTED BY INNER CITY PROTOCOL'}
          </p>
        </div>
      )}
    </div>
  );
};
