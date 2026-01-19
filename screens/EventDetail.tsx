
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../store';
import { Badge, NeonButton, Card } from '../components/UI';
import { 
  ChevronLeft, Share2, MapPin, Clock, ExternalLink, 
  MessageCircle, AlertTriangle, PlayCircle, Users, 
  ShieldCheck, X, Check, Zap, CreditCard, Loader2,
  ExternalLink as LinkIcon, RefreshCw, UserPlus, Heart,
  DollarSign, Calendar, Phone, Car, Accessibility, Info, Ticket
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { getEventAttendees, setEventAttendance, removeEventAttendance, getUserEventAttendance, checkInToEvent, isCheckedIn, getEventCheckIns } from '../services/social';
import { EventAttendee, User } from '../types';
import { getOptimizedImageUrl } from '../utils/imageOptimization';
import { supabase } from '../lib/supabase';
import { User as UserIcon } from 'lucide-react';

const TICKET_TIERS = [
  { id: 'early', name: 'Early Bird', price: '€15.00', perks: 'Entry before 23:00' },
  { id: 'ga', name: 'General Admission', price: '€25.00', perks: 'Standard Entry' },
  { id: 'vip', name: 'VIP Backstage', price: '€45.00', perks: 'Dedicated Bar + Fast Track' },
];

export const EventDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { events, theme, addTicket, user, activeCity, isTicketmasterConnected, toggleSaveEvent, savedEventIds } = useApp();
  const event = events.find(e => e.id === id);

  const [showTicketing, setShowTicketing] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [purchaseMode, setPurchaseMode] = useState<'native' | 'ticketmaster'>('native');
  const [purchaseState, setPurchaseState] = useState<'idle' | 'processing' | 'success'>('idle');
  
  // Social features
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [userAttendance, setUserAttendance] = useState<EventAttendee | null>(null);
  const [showAttendees, setShowAttendees] = useState(false);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);
  const [isCheckedInState, setIsCheckedInState] = useState(false);
  const [checkIns, setCheckIns] = useState<EventAttendee[]>([]);
  const [organizer, setOrganizer] = useState<User | null>(null);
  const [isLoadingOrganizer, setIsLoadingOrganizer] = useState(false);

  // Load attendees and user attendance
  useEffect(() => {
    if (!event || !id) return;
    
    loadAttendees();
    if (user) {
      loadUserAttendance();
      loadCheckInStatus();
    }
    loadCheckIns();
    loadOrganizer();
  }, [event?.id, event?.organizerId, user?.id]);

  const loadAttendees = async () => {
    if (!event || !id) return;
    setIsLoadingAttendees(true);
    try {
      const goingAttendees = await getEventAttendees(id, 'going');
      setAttendees(goingAttendees);
    } catch (error) {
      console.error('Error loading attendees:', error);
    } finally {
      setIsLoadingAttendees(false);
    }
  };

  const loadUserAttendance = async () => {
    if (!event || !id || !user) return;
    try {
      const attendance = await getUserEventAttendance(id, user.id);
      setUserAttendance(attendance);
    } catch (error) {
      console.error('Error loading user attendance:', error);
    }
  };

  const loadCheckInStatus = async () => {
    if (!event || !id || !user) return;
    try {
      const checkedIn = await isCheckedIn(id, user.id);
      setIsCheckedInState(checkedIn);
    } catch (error) {
      console.error('Error loading check-in status:', error);
    }
  };

  const loadCheckIns = async () => {
    if (!event || !id) return;
    try {
      const checkInsData = await getEventCheckIns(id);
      setCheckIns(checkInsData);
    } catch (error) {
      console.error('Error loading check-ins:', error);
    }
  };

  const loadOrganizer = async () => {
    if (!event || !event.organizerId || event.source !== 'user') return;
    
    setIsLoadingOrganizer(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, profile_photos, bio, interests, home_city, verified, created_at')
        .eq('id', event.organizerId)
        .single();

      if (error) throw error;
      
      if (data) {
        const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.id}`;
        const avatarUrl = data.avatar_url || defaultAvatar;
        const profilePhotos = (data.profile_photos && Array.isArray(data.profile_photos) && data.profile_photos.length > 0)
          ? data.profile_photos 
          : [avatarUrl];

        setOrganizer({
          id: data.id,
          username: data.username,
          displayName: data.display_name,
          avatarUrl: avatarUrl,
          profilePhotos: profilePhotos,
          bio: data.bio || '',
          socials: {},
          interests: data.interests || [],
          homeCity: data.home_city || '',
          travelCities: [],
          profileMode: 'full',
          organizerTier: 'none',
          verified: data.verified || false,
          createdAt: data.created_at || new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error loading organizer:', error);
    } finally {
      setIsLoadingOrganizer(false);
    }
  };

  const handleCheckIn = async () => {
    if (!user || !event || !id) return;
    
    try {
      await checkInToEvent(id, user.id);
      setIsCheckedInState(true);
      await loadCheckIns();
      await loadUserAttendance();
    } catch (error) {
      console.error('Error checking in:', error);
    }
  };

  const handleRSVP = async (status: 'going' | 'interested') => {
    if (!user || !event || !id) return;
    
    try {
      if (userAttendance?.status === status) {
        // Remove attendance if clicking same status
        await removeEventAttendance(id, user.id);
        setUserAttendance(null);
        await loadAttendees();
        // If removing interested, also remove from saves
        if (status === 'interested') {
          toggleSaveEvent(id);
        }
      } else {
        await setEventAttendance(id, user.id, status, true);
        setUserAttendance({ eventId: id, userId: user.id, status, isPublic: true, createdAt: new Date().toISOString() });
        await loadAttendees();
        // If marking interested, also add to saves
        if (status === 'interested') {
          if (!savedEventIds.includes(id)) {
            toggleSaveEvent(id);
          }
        }
      }
    } catch (error) {
      console.error('Error setting attendance:', error);
    }
  };

  if (!event) return <div className="p-20 text-center">Event not found</div>;

  const now = new Date();
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const isLive = now >= start && now <= end;
  const isOfficial = event.tier === 'official';
  
  const goingCount = attendees.filter(a => a.status === 'going').length;

  const handlePurchase = async () => {
    // If Ticketmaster mode and event has ticketmasterId, redirect to Ticketmaster
    if (purchaseMode === 'ticketmaster' && event.ticketmasterId && event.ticketUrl) {
      // Open Ticketmaster in new tab
      window.open(event.ticketUrl, '_blank', 'noopener,noreferrer');
      setShowTicketing(false);
      return;
    }

    // Native purchase flow
    if (!selectedTier) return;
    setPurchaseState('processing');
    
    // Simulated delay for "encryption" and payment/handshake
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const tierObj = TICKET_TIERS.find(t => t.id === selectedTier);
    addTicket({
      id: `TKT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      eventId: event.id,
      userId: user?.id || 'guest',
      qrCode: `IC-${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}`,
      status: 'active',
      type: tierObj?.name || 'Standard Access',
      gate: 'Main Entry',
      section: tierObj?.id === 'vip' ? 'Backstage' : 'Floor',
      purchaseDate: new Date().toISOString(),
      source: purchaseMode
    });

    setPurchaseState('success');
    setTimeout(() => {
      setShowTicketing(false);
      navigate('/wallet');
    }, 1500);
  };

  return (
    <div className="min-h-screen pb-32 relative overflow-x-hidden">
      {/* Header Overlay */}
      <div className="relative h-[65vh]">
        <img 
          src={event.mediaUrls && event.mediaUrls[0] ? getOptimizedImageUrl(event.mediaUrls[0], 'hero') : 'https://picsum.photos/800/600'} 
          alt={event.title} 
          className="w-full h-full object-cover"
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-[var(--background)]" />
        
        <div className="absolute top-12 left-6 flex gap-4">
          <button onClick={() => navigate(-1)} className="p-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
            <ChevronLeft size={24} />
          </button>
        </div>

        <div className="absolute top-12 right-6 flex gap-3">
          <button className="p-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
            <Share2 size={24} />
          </button>
        </div>

        <div className="absolute bottom-8 left-6 right-6">
          <div className="flex flex-wrap gap-2 mb-5">
            {isLive ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.6)] animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white">Live Pulse</span>
              </div>
            ) : (
              <Badge label="Upcoming" type="tonight" />
            )}
            
            {isOfficial ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black font-black uppercase tracking-widest text-[9px]">
                <ShieldCheck size={12} strokeWidth={3} />
                Official Event
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white font-black uppercase tracking-widest text-[9px]">
                Community Tier
              </div>
            )}
            
            <Badge label={event.categories[0]} />
          </div>

          <h1 
            className="text-5xl font-black italic tracking-tighter leading-none uppercase mb-3"
            style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)' }}
          >
            {event.title}
          </h1>
          
          <div className="flex items-center gap-2 opacity-60 text-[10px] font-black uppercase tracking-[0.2em]">
            <MapPin size={14} className="text-primary" style={{ color: theme.accent }} />
            {event.venueName} // DISTRICT: {activeCity.name} Central
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="px-6 mt-10 space-y-12">
        {/* Organizer Section - Only for user-generated events */}
        {event.source === 'user' && organizer && (
          <div className="pb-6 border-b" style={{ borderColor: theme.border }}>
            <h3 className="text-xs uppercase font-black tracking-[0.2em] mb-4 opacity-40">Event Organizer</h3>
            <Link
              to={`/profile/${organizer.id}`}
              className="flex items-center gap-4 p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border }}
            >
              {organizer.profilePhotos && organizer.profilePhotos.length > 0 ? (
                <img
                  src={getOptimizedImageUrl(organizer.profilePhotos[0], 'thumbnail')}
                  alt={organizer.displayName}
                  className="w-16 h-16 rounded-full object-cover border-2"
                  style={{ borderColor: theme.accent }}
                />
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: theme.accent + '20', borderColor: theme.accent }}>
                  <UserIcon size={24} style={{ color: theme.accent }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-lg font-black italic tracking-tighter uppercase truncate">
                    {organizer.displayName}
                  </h4>
                  {organizer.verified && (
                    <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                      <Check size={12} className="text-black" />
                    </div>
                  )}
                </div>
                <p className="text-xs opacity-60 mb-1">@{organizer.username}</p>
                {organizer.bio && (
                  <p className="text-xs opacity-70 line-clamp-2">{organizer.bio}</p>
                )}
              </div>
              <ChevronLeft size={20} className="opacity-40 rotate-180" />
            </Link>
          </div>
        )}

        <div>
          <h3 className="text-xs uppercase font-black tracking-[0.2em] mb-5 opacity-40">The Narrative</h3>
          <p className="leading-relaxed opacity-70 font-medium text-sm border-l-2 pl-6" style={{ borderColor: theme.accent }}>
            {event.longDesc}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-4">
          <NeonButton 
            onClick={() => setShowTicketing(true)}
            className="w-full py-6 text-base tracking-widest uppercase italic font-black"
          >
            Access Key Gateway <Zap size={20} fill="currentColor" />
          </NeonButton>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => user && handleRSVP('going')}
              className={`py-5 rounded-2xl font-black text-xs uppercase tracking-widest border active:scale-95 transition-all flex items-center justify-center gap-2 ${
                userAttendance?.status === 'going' 
                  ? 'bg-primary border-primary' 
                  : 'border-white/10 bg-white/5'
              }`}
              style={userAttendance?.status === 'going' ? { 
                backgroundColor: theme.accent, 
                borderColor: theme.accent,
                color: theme.background === '#FFFFFF' ? '#FFF' : '#000'
              } : {}}
            >
              <Check size={16} />
              Going
            </button>
            <button 
              onClick={() => user && handleRSVP('interested')}
              className={`py-5 rounded-2xl font-black text-xs uppercase tracking-widest border active:scale-95 transition-all flex items-center justify-center gap-2 ${
                userAttendance?.status === 'interested' 
                  ? 'bg-primary border-primary' 
                  : 'border-white/10 bg-white/5'
              }`}
              style={userAttendance?.status === 'interested' ? { 
                backgroundColor: theme.accent, 
                borderColor: theme.accent,
                color: theme.background === '#FFFFFF' ? '#FFF' : '#000'
              } : {}}
            >
              <Heart size={16} />
              Interested
            </button>
          </div>
          
          {/* Check-In Button - Show when event is live and user is going */}
          {isLive && userAttendance?.status === 'going' && (
            <button
              onClick={handleCheckIn}
              disabled={isCheckedInState}
              className={`py-5 rounded-2xl font-black text-xs uppercase tracking-widest border active:scale-95 transition-all flex items-center justify-center gap-2 ${
                isCheckedInState
                  ? 'opacity-50 cursor-not-allowed'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              style={isCheckedInState ? {} : {
                borderColor: theme.accent,
                backgroundColor: theme.accent + '20',
              }}
            >
              {isCheckedInState ? (
                <>
                  <Check size={16} />
                  Checked In
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Check In
                </>
              )}
            </button>
          )}
          
          {/* Check-Ins List */}
          {checkIns.length > 0 && (
            <div className="pt-4 border-t" style={{ borderColor: theme.border }}>
              <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3">
                Checked In ({checkIns.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {checkIns.slice(0, 10).map((checkIn) => (
                  <div
                    key={checkIn.userId}
                    className="flex items-center gap-2 px-3 py-2 rounded-full"
                    style={{ backgroundColor: theme.surfaceAlt }}
                  >
                    {checkIn.user?.avatarUrl && (
                      <img
                        src={checkIn.user.avatarUrl}
                        alt={checkIn.user.displayName}
                        className="w-6 h-6 rounded-full"
                      />
                    )}
                    <span className="text-[9px] font-bold">{checkIn.user?.displayName || 'Anonymous'}</span>
                  </div>
                ))}
                {checkIns.length > 10 && (
                  <div className="px-3 py-2 rounded-full text-[9px] opacity-60" style={{ backgroundColor: theme.surfaceAlt }}>
                    +{checkIns.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Going Together Section */}
        {goingCount > 0 && (
          <div className="pt-6 border-t" style={{ borderColor: theme.border }}>
            <button
              onClick={() => setShowAttendees(!showAttendees)}
              className="w-full flex items-center justify-between mb-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full" style={{ backgroundColor: theme.accent + '20' }}>
                  <Users size={20} style={{ color: theme.accent }} />
                </div>
                <div className="text-left">
                  <span className="font-black text-sm uppercase italic block mb-0.5">
                    Going Together
                  </span>
                  <span className="text-[9px] opacity-40 uppercase font-black tracking-widest">
                    {goingCount} {goingCount === 1 ? 'person' : 'people'} going
                  </span>
                </div>
              </div>
              <ChevronLeft 
                size={20} 
                className={`transition-transform ${showAttendees ? 'rotate-90' : '-rotate-90'}`}
              />
            </button>

            <AnimatePresence>
              {showAttendees && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-3">
                    {attendees.filter(a => a.status === 'going').slice(0, 12).map((attendee) => (
                      <Link
                        key={attendee.userId}
                        to={`/profile/${attendee.userId}`}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all hover:scale-105 active:scale-95"
                        style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border }}
                      >
                        <img
                          src={attendee.user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${attendee.userId}`}
                          className="w-8 h-8 rounded-lg"
                          alt={attendee.user?.displayName || 'User'}
                        />
                        <span className="text-xs font-black uppercase italic tracking-tight">
                          {attendee.user?.displayName || 'User'}
                        </span>
                      </Link>
                    ))}
                    {goingCount > 12 && (
                      <button
                        onClick={() => setShowAttendees(true)}
                        className="px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest"
                        style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border }}
                      >
                        +{goingCount - 12} more
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Event Details Section */}
        {(event.priceRanges || event.venueDetails || event.promoter || event.ageRestrictions || event.ticketLimit || event.sales) && (
          <div className="pt-6 border-t space-y-6" style={{ borderColor: theme.border }}>
            <h3 className="text-xs uppercase font-black tracking-[0.2em] opacity-40">Event Details</h3>
            
            {/* Pricing */}
            {event.priceRanges && event.priceRanges.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={16} style={{ color: theme.accent }} />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Pricing</span>
                </div>
                {event.priceRanges.map((range, idx) => (
                  <div key={idx} className="pl-6 text-sm opacity-70">
                    {range.type === 'standard' ? 'Standard' : range.type}: {range.currency} {range.min.toFixed(2)}
                    {range.max !== range.min && ` - ${range.max.toFixed(2)}`}
                  </div>
                ))}
              </div>
            )}

            {/* Promoter */}
            {event.promoter && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus size={16} style={{ color: theme.accent }} />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Promoter</span>
                </div>
                <div className="pl-6 text-sm opacity-70">{event.promoter.name}</div>
              </div>
            )}

            {/* Age Restrictions */}
            {event.ageRestrictions && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} style={{ color: theme.accent }} />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Age Restrictions</span>
                </div>
                <div className="pl-6 text-sm opacity-70">
                  {event.ageRestrictions.legalAgeEnforced ? 'Age restrictions enforced' : 'All ages welcome'}
                  {event.ageRestrictions.minAge && ` (${event.ageRestrictions.minAge}+)`}
                </div>
              </div>
            )}

            {/* Ticket Sales */}
            {event.sales && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={16} style={{ color: theme.accent }} />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Ticket Sales</span>
                </div>
                <div className="pl-6 text-sm opacity-70 space-y-1">
                  {event.sales.publicStart && (
                    <div>Public sale starts: {format(new Date(event.sales.publicStart), 'PPp')}</div>
                  )}
                  {event.sales.publicEnd && (
                    <div>Public sale ends: {format(new Date(event.sales.publicEnd), 'PPp')}</div>
                  )}
                </div>
              </div>
            )}

            {/* Ticket Limit */}
            {event.ticketLimit && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Ticket size={16} style={{ color: theme.accent }} />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Ticket Limit</span>
                </div>
                <div className="pl-6 text-sm opacity-70">{event.ticketLimit.info}</div>
              </div>
            )}

            {/* Venue Details */}
            {event.venueDetails && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={16} style={{ color: theme.accent }} />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Venue Information</span>
                </div>
                
                {event.venueDetails.phoneNumber && (
                  <div className="space-y-1 pl-6">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60">
                      <Phone size={12} />
                      Phone
                    </div>
                    <div className="text-sm opacity-70">{event.venueDetails.phoneNumber}</div>
                  </div>
                )}

                {event.venueDetails.openHours && (
                  <div className="space-y-1 pl-6">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60">
                      <Clock size={12} />
                      Box Office Hours
                    </div>
                    <div className="text-sm opacity-70">{event.venueDetails.openHours}</div>
                  </div>
                )}

                {event.venueDetails.parkingDetail && (
                  <div className="space-y-1 pl-6">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60">
                      <Car size={12} />
                      Parking
                    </div>
                    <div className="text-sm opacity-70">{event.venueDetails.parkingDetail}</div>
                  </div>
                )}

                {event.venueDetails.accessibleSeatingDetail && (
                  <div className="space-y-1 pl-6">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60">
                      <Accessibility size={12} />
                      Accessibility
                    </div>
                    <div className="text-sm opacity-70">{event.venueDetails.accessibleSeatingDetail}</div>
                  </div>
                )}

                {event.venueDetails.generalInfo && (
                  <div className="space-y-1 pl-6">
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">General Info</div>
                    <div className="text-sm opacity-70">{event.venueDetails.generalInfo}</div>
                  </div>
                )}

                {event.venueDetails.childRule && (
                  <div className="space-y-1 pl-6">
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Child Policy</div>
                    <div className="text-sm opacity-70">{event.venueDetails.childRule}</div>
                  </div>
                )}

                {event.venueDetails.acceptedPayment && (
                  <div className="space-y-1 pl-6">
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Accepted Payment</div>
                    <div className="text-sm opacity-70">{event.venueDetails.acceptedPayment}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Community Pulse Link */}
        <div className="pt-6 border-t" style={{ borderColor: theme.border }}>
          <Link to={`/event/${event.id}/chat`} className="flex items-center justify-between w-full py-7 px-6 rounded-[2.5rem] active:scale-95 transition-all border border-white/10" style={{ backgroundColor: theme.surface }}>
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-full bg-white/10" style={{ color: theme.accent }}>
                <MessageCircle size={28} strokeWidth={2.5} />
              </div>
              <div className="text-left">
                <span className="font-black text-sm uppercase italic block mb-0.5">The Pulse Room</span>
                <span className="text-[9px] opacity-40 uppercase font-black tracking-widest">Active Community Chat</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Ticketing Bottom Sheet */}
      <AnimatePresence>
        {showTicketing && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => purchaseState === 'idle' && setShowTicketing(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100]"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[101] p-8 pb-12 rounded-t-[3rem] border-t overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
            >
              {purchaseState === 'idle' && (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-black italic tracking-tighter uppercase">Access Gateway</h3>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Choose your frequency</p>
                    </div>
                    <button onClick={() => setShowTicketing(false)} className="p-2 opacity-30 hover:opacity-100">
                      <X size={24} />
                    </button>
                  </div>

                  {/* Purchase Mode Toggle */}
                  <div className="flex p-1 rounded-2xl bg-black/20" style={{ backgroundColor: theme.surfaceAlt }}>
                    <button 
                      onClick={() => setPurchaseMode('native')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${purchaseMode === 'native' ? 'bg-white text-black' : 'opacity-40'}`}
                      style={purchaseMode === 'native' ? { backgroundColor: theme.accent, color: '#000' } : {}}
                    >
                      Neural Key
                    </button>
                    <button 
                      onClick={() => setPurchaseMode('ticketmaster')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${purchaseMode === 'ticketmaster' ? 'bg-white text-black' : 'opacity-40'}`}
                      style={purchaseMode === 'ticketmaster' ? { backgroundColor: '#026CDF', color: '#FFF' } : {}}
                    >
                      Ticketmaster Relay
                    </button>
                  </div>

                  {purchaseMode === 'ticketmaster' && event.ticketmasterId ? (
                    <div className="p-6 rounded-3xl border-2 text-center" style={{ backgroundColor: theme.surfaceAlt, borderColor: '#026CDF' }}>
                      <p className="text-sm font-bold mb-2 opacity-80">Ticketmaster Event</p>
                      <p className="text-[10px] opacity-50 uppercase tracking-widest">Click below to view available tickets and pricing on Ticketmaster</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {TICKET_TIERS.map((tier) => (
                        <button 
                          key={tier.id}
                          onClick={() => setSelectedTier(tier.id)}
                          className={`w-full p-6 rounded-3xl border-2 text-left transition-all active:scale-[0.98] flex items-center justify-between ${selectedTier === tier.id ? '' : 'opacity-60'}`}
                          style={{ 
                            backgroundColor: theme.surfaceAlt, 
                            borderColor: selectedTier === tier.id ? (purchaseMode === 'ticketmaster' ? '#026CDF' : theme.accent) : 'transparent',
                            boxShadow: selectedTier === tier.id ? `0 0 20px ${purchaseMode === 'ticketmaster' ? '#026CDF' : theme.accent}33` : 'none'
                          }}
                        >
                          <div>
                            <h4 className="font-black text-sm uppercase italic mb-1">{tier.name}</h4>
                            <p className="text-[9px] font-bold opacity-50 uppercase tracking-widest">{tier.perks}</p>
                          </div>
                          <span className="text-lg font-black italic tracking-tighter">{tier.price}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <NeonButton 
                    onClick={handlePurchase}
                    className={`w-full py-6 text-base tracking-widest uppercase italic font-black ${purchaseMode === 'native' && !selectedTier ? 'opacity-30 pointer-events-none' : ''}`}
                    style={purchaseMode === 'ticketmaster' ? { backgroundColor: '#026CDF', color: '#FFF' } : {}}
                  >
                    {purchaseMode === 'ticketmaster' 
                      ? (event.ticketmasterId ? 'View Tickets on Ticketmaster' : 'Relay Transaction')
                      : 'Confirm Pulse'
                    } 
                    {purchaseMode === 'ticketmaster' ? <LinkIcon size={20} /> : <CreditCard size={20} />}
                  </NeonButton>
                </div>
              )}

              {purchaseState === 'processing' && (
                <div className="py-20 flex flex-col items-center text-center">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    className="mb-8"
                  >
                    {purchaseMode === 'ticketmaster' ? (
                       <RefreshCw size={64} color="#026CDF" strokeWidth={1} />
                    ) : (
                       <Loader2 size={64} color={theme.accent} strokeWidth={1} />
                    )}
                  </motion.div>
                  <h3 className="text-3xl font-black italic tracking-tighter uppercase mb-2">
                    {purchaseMode === 'ticketmaster' ? 'Connecting Master Node...' : 'Syncing Neural Net...'}
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">
                    {purchaseMode === 'ticketmaster' ? 'Secure Relay Handshake' : 'Encrypted transaction in progress'}
                  </p>
                </div>
              )}

              {purchaseState === 'success' && (
                <div className="py-20 flex flex-col items-center text-center">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 rounded-full flex items-center justify-center mb-8 shadow-2xl"
                    style={{ backgroundColor: purchaseMode === 'ticketmaster' ? '#026CDF' : theme.accent }}
                  >
                    <Check size={40} color="#FFF" strokeWidth={4} />
                  </motion.div>
                  <h3 className="text-3xl font-black italic tracking-tighter uppercase mb-2">Key Acquired.</h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40 italic">Check your vault for the relay key</p>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
