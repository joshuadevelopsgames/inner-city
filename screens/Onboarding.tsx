
import React, { useState } from 'react';
import { useApp } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { NeonButton, Card } from '../components/UI';
import { ChevronRight, Check, MapPin, Search } from 'lucide-react';
import { MOCK_CITIES } from '../mockData';

// City-specific image URLs from Unsplash
const CITY_IMAGES: Record<string, string> = {
  berlin: 'https://images.unsplash.com/photo-1528722828814-77b9b83aafb2?w=600&h=400&fit=crop&q=80', // Berlin skyline
  london: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=400&fit=crop&q=80', // London cityscape
  ny: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=600&h=400&fit=crop&q=80', // New York skyline
  tokyo: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&h=400&fit=crop&q=80', // Tokyo cityscape
  vancouver: 'https://images.unsplash.com/photo-1559511260-66a654ae982a?w=600&h=400&fit=crop&q=80', // Vancouver skyline
  calgary: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&h=400&fit=crop&q=80', // Calgary cityscape
};

export const Onboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { theme, activeCity, setActiveCity } = useApp();
  const [step, setStep] = useState<'city' | 'interests' | 'welcome'>('city');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const categories = [
    { name: 'Music', sub: ['Techno', 'House', 'DnB', 'Ambient'], img: 'https://picsum.photos/seed/music/600/400' },
    { name: 'Art', sub: ['Digital', 'Brutalist', 'Interactive'], img: 'https://picsum.photos/seed/art/600/400' },
    { name: 'Nightlife', sub: ['Underground', 'Raves', 'Late Night'], img: 'https://picsum.photos/seed/night/600/400' },
  ];

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev => 
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const isLight = theme.background === '#FFFFFF';

  return (
    <div className="h-full flex flex-col overflow-y-auto no-scrollbar p-8" style={{ background: theme.background }}>
      <AnimatePresence mode="wait">
        {step === 'city' && (
          <motion.div 
            key="city"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10 pt-10 pb-10"
          >
            <div>
              <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-[0.85] mb-4">
                Where <br/><span style={{ color: theme.accent }}>Are You?</span>
              </h1>
              <p className="text-sm font-medium opacity-50 tracking-tight">Choose your home turf to discover the underground.</p>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30" size={18} />
              <input 
                placeholder="Search for a city..."
                className="w-full bg-zinc-900/10 border border-zinc-200/20 py-4 pl-12 pr-4 rounded-2xl outline-none"
                style={{ backgroundColor: theme.surface, color: theme.text }}
              />
            </div>

            <div className="space-y-4">
              {MOCK_CITIES.map((city) => (
                <button 
                  key={city.id}
                  onClick={() => setActiveCity(city)}
                  className="w-full relative h-32 rounded-3xl overflow-hidden group border-2 transition-all active:scale-95"
                  style={{ borderColor: activeCity.id === city.id ? theme.accent : 'transparent' }}
                >
                  <img 
                    src={CITY_IMAGES[city.id] || `https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600&h=400&fit=crop&q=80`} 
                    alt={`${city.name}, ${city.country}`}
                    className="absolute inset-0 w-full h-full object-cover grayscale brightness-50 group-hover:grayscale-0 transition-all duration-700" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute bottom-4 left-6 text-left">
                    <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">{city.name}</h3>
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{city.country}</p>
                  </div>
                  {activeCity.id === city.id && (
                    <div className="absolute top-4 right-4 bg-primary p-1.5 rounded-full" style={{ backgroundColor: theme.accent }}>
                      <Check size={14} color="#000" strokeWidth={4} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <NeonButton onClick={() => setStep('interests')} className="w-full py-5">
              Confirm City <ChevronRight size={20} />
            </NeonButton>
          </motion.div>
        )}

        {step === 'interests' && (
          <motion.div 
            key="interests"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8 pt-10 pb-10"
          >
             <div>
              <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-[0.85] mb-4">
                What Moves <br/><span style={{ color: theme.accent }}>You?</span>
              </h1>
              <p className="text-sm font-medium opacity-50 tracking-tight">Define your sonic palette.</p>
            </div>

            <div className="space-y-6">
              {categories.map((cat) => (
                <div key={cat.name} className="space-y-3">
                  <div className="relative h-24 rounded-2xl overflow-hidden">
                    <img src={cat.img} className="absolute inset-0 w-full h-full object-cover brightness-50" />
                    <div className="absolute inset-0 flex items-center px-6">
                      <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">{cat.name}</h3>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cat.sub.map(s => (
                      <button 
                        key={s}
                        onClick={() => toggleInterest(s)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedInterests.includes(s) ? 'bg-primary text-white' : 'bg-zinc-800/10 border border-zinc-200/20 text-zinc-500'}`}
                        style={{ 
                          backgroundColor: selectedInterests.includes(s) ? theme.accent : theme.surface,
                          borderColor: selectedInterests.includes(s) ? theme.accent : theme.border,
                          color: selectedInterests.includes(s) ? (isLight ? '#FFF' : '#000') : theme.textDim
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <NeonButton onClick={() => setStep('welcome')} className="w-full py-5">
              Build Identity <ChevronRight size={20} />
            </NeonButton>
          </motion.div>
        )}

        {step === 'welcome' && (
          <motion.div 
            key="welcome"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-full text-center py-20"
          >
            <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center mb-8 pulse-glow" style={{ backgroundColor: theme.accent }}>
              <Check size={48} color={isLight ? '#FFF' : '#000'} strokeWidth={3} />
            </div>
            <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-[0.85] mb-6">
              Ready to <br/><span style={{ color: theme.accent }}>Descend.</span>
            </h1>
            <p className="opacity-60 max-w-[280px] mb-12 font-medium">The underground is calling. Your frequency is locked in.</p>
            <NeonButton onClick={onComplete} className="w-full py-5">Enter Inner City</NeonButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
