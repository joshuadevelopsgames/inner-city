
import React, { useState, useRef } from 'react';
import { useApp } from '../store';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { NeonButton, Input } from '../components/UI';
import { Camera, MapPin, Calendar, Clock, ChevronRight, Check, X } from 'lucide-react';
import { createUserEvent } from '../services/events';

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1Ijoiam9zaHVhcm9hZGVyIiwiYSI6ImNta2l4MzduaTEyYzkzZXEzdHY5dmlxdDEifQ.Ch-Yoo2bvEGrdcr3ph_MaQ';

const CATEGORIES = ['Music', 'Nightlife', 'Art', 'Tech', 'Food', 'Comedy', 'Sports', 'Workshop'];

export const CreateEvent: React.FC = () => {
  const { theme, user, activeCity, refreshFeed } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isPublished, setIsPublished] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [shortDesc, setShortDesc] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [tier, setTier] = useState<'community' | 'official' | 'underground'>('community');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLight = theme.background === '#FFFFFF';

  const handleNext = () => {
    if (step === 1 && (!title.trim() || selectedCategories.length === 0)) {
      setError('Please fill in the title and select at least one category');
      return;
    }
    if (step === 2 && (!shortDesc.trim() || !date || !time || !venueName.trim())) {
      setError('Please fill in all required fields');
      return;
    }
    setError(null);
    setStep(prev => prev + 1);
  };

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For now, we'll use a placeholder URL. In production, upload to Supabase Storage
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setMediaUrls(prev => [...prev, result]);
    };
    reader.readAsDataURL(file);
  };

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        return { lat, lng };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  };

  const handlePublish = async () => {
    if (!user || !activeCity) {
      setError('You must be logged in and have a city selected');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Combine date and time
      const dateTime = new Date(`${date}T${time}`);
      const endDateTime = new Date(dateTime.getTime() + 3 * 60 * 60 * 1000); // Default 3 hours

      // Geocode address if provided
      let lat: number | undefined;
      let lng: number | undefined;
      if (address.trim()) {
        const coords = await geocodeAddress(`${address}, ${activeCity.name}`);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      await createUserEvent(user.id, {
        title: title.trim(),
        shortDesc: shortDesc.trim(),
        cityId: activeCity.id,
        startAt: dateTime.toISOString(),
        endAt: endDateTime.toISOString(),
        venueName: venueName.trim(),
        address: address.trim() || undefined,
        lat,
        lng,
        categories: selectedCategories.map(c => c.toLowerCase()),
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        tier,
      });

      // Refresh feed to show new event
      if (refreshFeed) {
        refreshFeed();
      }

      setIsPublished(true);
    } catch (err: any) {
      console.error('Error creating event:', err);
      setError(err.message || 'Failed to create event. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  if (isPublished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-10 text-center">
        <motion.div 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }} 
          className="w-24 h-24 rounded-full flex items-center justify-center mb-8"
          style={{ backgroundColor: theme.accent, boxShadow: `${theme.glowIntensity} ${theme.accent}` }}
        >
          <Check size={48} color="#000" />
        </motion.div>
        <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-4">You're Live.</h2>
        <p className="opacity-60 mb-8 font-medium">Your event has been broadcasted to the city. Get ready for the rush.</p>
        <NeonButton onClick={() => navigate('/')}>Go to Feed</NeonButton>
      </div>
    );
  }

  return (
    <div className="px-6 py-10">
      <div className="mb-10">
        <div className="flex gap-2 mb-4">
          {[1,2,3].map(i => (
            <div key={i} className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: theme.surfaceAlt }}>
              <motion.div 
                className="h-full" 
                animate={{ width: step >= i ? '100%' : '0%' }}
                style={{ backgroundColor: theme.accent }} 
              />
            </div>
          ))}
        </div>
        <h2 className="text-3xl font-black italic tracking-tighter uppercase">New Pulse</h2>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-2xl text-sm" style={{ backgroundColor: theme.surfaceAlt, color: theme.text }}>
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
            <div 
              className="aspect-square rounded-[3rem] border-2 border-dashed flex flex-col items-center justify-center gap-4 cursor-pointer active:scale-95 transition-all relative overflow-hidden" 
              style={{ borderColor: theme.border, backgroundColor: theme.surface }}
              onClick={() => fileInputRef.current?.click()}
            >
              {mediaUrls.length > 0 ? (
                <>
                  <img src={mediaUrls[0]} alt="Event" className="w-full h-full object-cover" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMediaUrls([]);
                    }}
                    className="absolute top-2 right-2 p-2 rounded-full"
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                  >
                    <X size={20} color="#fff" />
                  </button>
                </>
              ) : (
                <>
                  <Camera size={40} className="opacity-30" />
                  <span className="text-xs font-black uppercase tracking-[0.2em] opacity-40">Add Hero Media</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Event Title</label>
              <Input 
                placeholder="E.g. NEON GARDEN" 
                className="brand-font uppercase !text-xl italic" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Category</label>
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 flex-wrap">
                {CATEGORIES.map(c => (
                  <button 
                    key={c} 
                    onClick={() => handleCategoryToggle(c)}
                    className={`px-5 py-2 rounded-full border text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all ${
                      selectedCategories.includes(c) ? 'opacity-100' : 'opacity-50'
                    }`}
                    style={{ 
                      borderColor: selectedCategories.includes(c) ? theme.accent : theme.border,
                      backgroundColor: selectedCategories.includes(c) ? theme.accent + '20' : 'transparent'
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <NeonButton onClick={handleNext} className="w-full" disabled={!title.trim() || selectedCategories.length === 0}>
              Continue <ChevronRight size={18} />
            </NeonButton>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
             <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Short Hook</label>
              <Input 
                placeholder="One sentence to kill it." 
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Date</label>
                <div className="relative">
                  <Input 
                    type="date"
                    placeholder="Select Date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <Calendar size={18} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" />
                </div>
              </div>
               <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Time</label>
                <div className="relative">
                  <Input 
                    type="time"
                    placeholder="22:00" 
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                  <Clock size={18} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Venue Name</label>
              <div className="relative">
                <Input 
                  placeholder="Where is the noise?" 
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                />
                <MapPin size={18} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Address (Optional)</label>
              <div className="relative">
                <Input 
                  placeholder="123 Main St, City" 
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <MapPin size={18} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" />
              </div>
            </div>
            <NeonButton onClick={handleNext} className="w-full" disabled={!shortDesc.trim() || !date || !time || !venueName.trim()}>
              Final Check <ChevronRight size={18} />
            </NeonButton>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
            <div className="p-6 rounded-3xl" style={{ backgroundColor: theme.surface }}>
              <span className="text-[10px] font-black uppercase opacity-40 block mb-4">Event Tier</span>
              <div className="space-y-4">
                <button
                  onClick={() => setTier('community')}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                    tier === 'community' ? 'opacity-100' : 'opacity-50'
                  }`}
                  style={{ borderColor: tier === 'community' ? theme.accent : theme.border }}
                >
                  <div>
                    <span className="font-bold text-sm block">Community</span>
                    <span className="text-[10px] opacity-50 uppercase tracking-widest">Free to broadcast</span>
                  </div>
                  {tier === 'community' && <Check size={20} color={theme.accent} />}
                </button>
                <button
                  onClick={() => setTier('underground')}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                    tier === 'underground' ? 'opacity-100' : 'opacity-50'
                  }`}
                  style={{ borderColor: tier === 'underground' ? theme.accent : theme.border }}
                >
                  <div>
                    <span className="font-bold text-sm block">Underground</span>
                    <span className="text-[10px] opacity-50 uppercase tracking-widest">For the underground scene</span>
                  </div>
                  {tier === 'underground' && <Check size={20} color={theme.accent} />}
                </button>
                <div className="flex items-center justify-between p-4 rounded-2xl border border-dashed opacity-50" style={{ borderColor: theme.border }}>
                  <div>
                    <span className="font-bold text-sm block">Official (Pro)</span>
                    <span className="text-[10px] opacity-50 uppercase tracking-widest">Requires verified status</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-center opacity-40 uppercase font-black tracking-widest">
              By publishing, you agree to the Inner City community guidelines.
            </p>
            <NeonButton 
              onClick={handlePublish} 
              className="w-full" 
              disabled={isCreating}
            >
              {isCreating ? 'Broadcasting...' : 'Broadcast Now'}
            </NeonButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
