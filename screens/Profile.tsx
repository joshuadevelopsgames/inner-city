
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../store';
import { useNavigate, useParams } from 'react-router-dom';
import { NeonButton, Card, Badge } from '../components/UI';
import { Settings, LogOut, Grid, Bookmark, MessageSquare, Palette, X, Twitter, Instagram, UserPlus, UserMinus, MessageCircle, ChevronLeft, ChevronRight, Plus, Trash2, Calendar, MapPin } from 'lucide-react';
import { THEMES } from '../theme';
import { MOCK_CITIES } from '../mockData';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { followUser, unfollowUser, isFollowing, getFollowers, getFollowing, getUserEvents } from '../services/social';
import { User, EventAttendee } from '../types';
import { supabase } from '../lib/supabase';
import { getOptimizedImageUrl } from '../utils/imageOptimization';

export const Profile: React.FC = () => {
  const { user: currentUser, theme, setThemeKey, logout, login, updateUser, activeCity } = useApp();
  const isLight = theme.background === '#FFFFFF';
  const navigate = useNavigate();
  const { userId } = useParams();
  
  // If viewing another user's profile
  const isViewingOtherProfile = userId && userId !== currentUser?.id;
  const [viewedUser, setViewedUser] = useState<User | null>(null);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  
  const user = isViewingOtherProfile ? viewedUser : currentUser;
  
  // Photo carousel state
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [userEvents, setUserEvents] = useState<EventAttendee[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
    profilePhotos: user?.profilePhotos || [],
    twitter: user?.socials?.twitter || '',
    instagram: user?.socials?.instagram || '',
    interests: user?.interests?.join(', ') || '',
    homeCity: user?.homeCity || '',
  });

  // Load profile if viewing another user, or load own follow counts
  useEffect(() => {
    if (isViewingOtherProfile && userId && currentUser) {
      loadUserProfile();
      checkFollowingStatus();
      loadFollowCounts();
      loadUserEvents();
    } else if (isViewingOtherProfile && !currentUser) {
      navigate('/login');
    } else if (!isViewingOtherProfile && currentUser) {
      // Load own follow counts
      loadFollowCounts();
      loadUserEvents();
    }
  }, [userId, currentUser, isViewingOtherProfile]);

  useEffect(() => {
    if (user) {
      setEditForm({
        displayName: user.displayName || '',
        bio: user.bio || '',
        profilePhotos: user.profilePhotos || [user.avatarUrl],
        twitter: user.socials?.twitter || '',
        instagram: user.socials?.instagram || '',
        interests: user.interests?.join(', ') || '',
        homeCity: user.homeCity || '',
      });
    }
  }, [user]);

  const loadFollowCounts = async () => {
    const targetUserId = userId || currentUser?.id;
    if (!targetUserId) return;
    
    try {
      const followers = await getFollowers(targetUserId);
      const following = await getFollowing(targetUserId);
      setFollowersCount(followers.length);
      setFollowingCount(following.length);
    } catch (error) {
      console.error('Error loading follow counts:', error);
    }
  };

  const loadUserProfile = async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      if (data) {
        const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.id}`;
        const avatarUrl = data.avatar_url || defaultAvatar;
        const profilePhotos = data.profile_photos && data.profile_photos.length > 0 
          ? data.profile_photos 
          : [avatarUrl];
        
        setViewedUser({
          id: data.id,
          username: data.username,
          displayName: data.display_name,
          avatarUrl: avatarUrl,
          profilePhotos: profilePhotos,
          bio: data.bio,
          socials: {},
          interests: data.interests || [],
          homeCity: data.home_city || '',
          travelCities: data.travel_cities || [],
          profileMode: data.profile_mode || 'full',
          organizerTier: data.organizer_tier || 'none',
          verified: data.verified || false,
          createdAt: data.created_at,
        });
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadUserEvents = async () => {
    const targetUserId = userId || currentUser?.id;
    if (!targetUserId) return;
    
    setIsLoadingEvents(true);
    try {
      const events = await getUserEvents(targetUserId);
      setUserEvents(events);
    } catch (error) {
      console.error('Error loading user events:', error);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const checkFollowingStatus = async () => {
    if (!userId || !currentUser) return;
    try {
      const following = await isFollowing(currentUser.id, userId);
      setIsFollowingUser(following);
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
  };

  const handleFollow = async () => {
    if (!userId || !currentUser || isLoadingFollow) return;
    
    setIsLoadingFollow(true);
    try {
      if (isFollowingUser) {
        await unfollowUser(currentUser.id, userId);
        setIsFollowingUser(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
      } else {
        await followUser(currentUser.id, userId);
        setIsFollowingUser(true);
        setFollowersCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
    } finally {
      setIsLoadingFollow(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !currentUser) return;
    
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      e.target.value = '';
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      e.target.value = '';
      return;
    }

    try {
      // Upload to Supabase Storage (you'll need to create a 'profile-photos' bucket)
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, file, { upsert: false });

      if (uploadError) {
        // Fallback: use object URL for now (temporary)
        const objectUrl = URL.createObjectURL(file);
        const newPhotos = [...(editForm.profilePhotos || []), objectUrl];
        setEditForm({ ...editForm, profilePhotos: newPhotos });
        e.target.value = '';
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      const newPhotos = [...(editForm.profilePhotos || []), publicUrl];
      setEditForm({ ...editForm, profilePhotos: newPhotos });
      e.target.value = '';
    } catch (error) {
      console.error('Error uploading photo:', error);
      // Fallback: use object URL
      const objectUrl = URL.createObjectURL(file);
      const newPhotos = [...(editForm.profilePhotos || []), objectUrl];
      setEditForm({ ...editForm, profilePhotos: newPhotos });
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    const newPhotos = editForm.profilePhotos.filter((_, i) => i !== index);
    setEditForm({ ...editForm, profilePhotos: newPhotos });
    if (currentPhotoIndex >= newPhotos.length && newPhotos.length > 0) {
      setCurrentPhotoIndex(newPhotos.length - 1);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    const interestsArray = editForm.interests
      .split(',')
      .map(i => i.trim())
      .filter(i => i.length > 0);

    await updateUser({
      displayName: editForm.displayName,
      bio: editForm.bio,
      profilePhotos: editForm.profilePhotos,
      avatarUrl: editForm.profilePhotos[0] || user.avatarUrl,
      socials: {
        twitter: editForm.twitter,
        instagram: editForm.instagram,
      },
      interests: interestsArray,
      homeCity: editForm.homeCity,
    });

    setShowEditModal(false);
  };

  if (!user) {
    return (
      <div className="p-20 text-center flex flex-col items-center gap-6">
        <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Authentication Required</p>
        <NeonButton onClick={() => navigate('/login')}>Sign In</NeonButton>
      </div>
    );
  }

  const photos = user.profilePhotos && user.profilePhotos.length > 0 
    ? user.profilePhotos 
    : [user.avatarUrl];

  const goingEvents = userEvents.filter(e => e.status === 'going' && e.event);
  const interestedEvents = userEvents.filter(e => e.status === 'interested' && e.event);

  return (
    <div className="pb-20 overflow-x-hidden">
      {/* Photo Carousel - Dating App Style */}
      <div className="relative w-full" style={{ height: '70vh', minHeight: '500px' }}>
        <div className="relative w-full h-full overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.img
              key={currentPhotoIndex}
              src={getOptimizedImageUrl(photos[currentPhotoIndex], 'hero')}
              alt={`${user.displayName} photo ${currentPhotoIndex + 1}`}
              className="w-full h-full object-cover"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.3 }}
            />
          </AnimatePresence>

          {/* Photo Indicators */}
          {photos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {photos.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPhotoIndex(index)}
                  className={`h-1.5 rounded-full transition-all ${
                    index === currentPhotoIndex ? 'w-8' : 'w-1.5'
                  }`}
                  style={{
                    backgroundColor: index === currentPhotoIndex ? theme.accent : 'rgba(255, 255, 255, 0.4)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Navigation Arrows */}
          {photos.length > 1 && (
            <>
              {currentPhotoIndex > 0 && (
                <button
                  onClick={() => setCurrentPhotoIndex(currentPhotoIndex - 1)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full backdrop-blur-md border"
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', borderColor: theme.border }}
                >
                  <ChevronLeft size={24} color={theme.accent} />
                </button>
              )}
              {currentPhotoIndex < photos.length - 1 && (
                <button
                  onClick={() => setCurrentPhotoIndex(currentPhotoIndex + 1)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full backdrop-blur-md border"
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', borderColor: theme.border }}
                >
                  <ChevronRight size={24} color={theme.accent} />
                </button>
              )}
            </>
          )}

          {/* Gradient Overlay */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-32"
            style={{
              background: `linear-gradient(to top, ${theme.background}, transparent)`,
            }}
          />
        </div>
      </div>

      {/* Profile Info Card - Overlapping */}
      <div 
        className="relative -mt-20 mx-4 rounded-3xl p-6 border backdrop-blur-md"
        style={{ 
          backgroundColor: theme.surface,
          borderColor: theme.border,
        }}
      >
        {/* Name and Stats */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-black italic tracking-tighter uppercase">{user.displayName}</h2>
              {user.verified && (
                <Badge label="Verified" type="official" />
              )}
            </div>
            <span className="text-sm font-bold opacity-50">@{user.username}</span>
          </div>
          {!isViewingOtherProfile && (
            <button 
              onClick={() => {
                setEditForm({
                  displayName: user.displayName || '',
                  bio: user.bio || '',
                  profilePhotos: user.profilePhotos || [user.avatarUrl],
                  twitter: user.socials?.twitter || '',
                  instagram: user.socials?.instagram || '',
                  interests: user.interests?.join(', ') || '',
                  homeCity: user.homeCity || '',
                });
                setShowEditModal(true);
              }}
              className="p-2 rounded-full"
              style={{ backgroundColor: theme.surfaceAlt }}
            >
              <Settings size={20} />
            </button>
          )}
        </div>

        {/* Bio */}
        {user.bio && (
          <p className="text-sm leading-relaxed opacity-70 mb-4">{user.bio}</p>
        )}

        {/* Stats */}
        <div className="flex gap-6 mb-4 pb-4 border-b" style={{ borderColor: theme.border }}>
          <div className="text-center">
            <span className="block font-black text-xl italic tracking-tighter">{followersCount || '0'}</span>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-40">Followers</span>
          </div>
          <div className="text-center">
            <span className="block font-black text-xl italic tracking-tighter">{followingCount || '0'}</span>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-40">Following</span>
          </div>
          <div className="text-center">
            <span className="block font-black text-xl italic tracking-tighter">{goingEvents.length}</span>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-40">Going</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {isViewingOtherProfile ? (
            <>
              <button
                onClick={handleFollow}
                disabled={isLoadingFollow}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ 
                  backgroundColor: isFollowingUser ? theme.surfaceAlt : theme.accent,
                  color: isFollowingUser ? theme.text : (isLight ? '#FFF' : '#000')
                }}
              >
                {isFollowingUser ? (
                  <>
                    <UserMinus size={18} />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus size={18} />
                    Follow
                  </>
                )}
              </button>
              <button
                onClick={() => navigate(`/messages/${userId}`)}
                className="px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ backgroundColor: theme.surfaceAlt }}
              >
                <MessageCircle size={18} />
                Message
              </button>
            </>
          ) : (
            <NeonButton className="flex-1" onClick={() => {
              setEditForm({
                displayName: user.displayName || '',
                bio: user.bio || '',
                profilePhotos: user.profilePhotos || [user.avatarUrl],
                twitter: user.socials?.twitter || '',
                instagram: user.socials?.instagram || '',
                interests: user.interests?.join(', ') || '',
                homeCity: user.homeCity || '',
              });
              setShowEditModal(true);
            }}>
              Edit Profile
            </NeonButton>
          )}
        </div>
      </div>

      {/* Events Section */}
      {(goingEvents.length > 0 || interestedEvents.length > 0) && (
        <div className="px-4 mt-6">
          {goingEvents.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-black uppercase tracking-widest opacity-40 mb-3 px-2">Going To</h3>
              <div className="space-y-3">
                {goingEvents.slice(0, 3).map((attendee) => {
                  const event = attendee.event!;
                  return (
                    <motion.div
                      key={event.id}
                      onClick={() => navigate(`/event/${event.id}`)}
                      className="rounded-2xl overflow-hidden border cursor-pointer active:scale-98 transition-transform"
                      style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border }}
                    >
                      {event.mediaUrls && event.mediaUrls[0] && (
                        <img 
                          src={getOptimizedImageUrl(event.mediaUrls[0], 'card')} 
                          alt={event.title}
                          className="w-full h-32 object-cover"
                        />
                      )}
                      <div className="p-4">
                        <h4 className="font-black text-sm uppercase tracking-tight mb-1 line-clamp-1">{event.title}</h4>
                        <div className="flex items-center gap-2 text-xs opacity-60 mb-1">
                          <Calendar size={12} />
                          <span>{new Date(event.startAt).toLocaleDateString()}</span>
                        </div>
                        {event.venueName && (
                          <div className="flex items-center gap-2 text-xs opacity-60">
                            <MapPin size={12} />
                            <span className="line-clamp-1">{event.venueName}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {interestedEvents.length > 0 && (
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest opacity-40 mb-3 px-2">Interested In</h3>
              <div className="space-y-3">
                {interestedEvents.slice(0, 3).map((attendee) => {
                  const event = attendee.event!;
                  return (
                    <motion.div
                      key={event.id}
                      onClick={() => navigate(`/event/${event.id}`)}
                      className="rounded-2xl overflow-hidden border cursor-pointer active:scale-98 transition-transform"
                      style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border }}
                    >
                      {event.mediaUrls && event.mediaUrls[0] && (
                        <img 
                          src={getOptimizedImageUrl(event.mediaUrls[0], 'card')} 
                          alt={event.title}
                          className="w-full h-32 object-cover"
                        />
                      )}
                      <div className="p-4">
                        <h4 className="font-black text-sm uppercase tracking-tight mb-1 line-clamp-1">{event.title}</h4>
                        <div className="flex items-center gap-2 text-xs opacity-60 mb-1">
                          <Calendar size={12} />
                          <span>{new Date(event.startAt).toLocaleDateString()}</span>
                        </div>
                        {event.venueName && (
                          <div className="flex items-center gap-2 text-xs opacity-60">
                            <MapPin size={12} />
                            <span className="line-clamp-1">{event.venueName}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEditModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
            onClick={() => setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 no-scrollbar"
              style={{ backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black italic tracking-tighter uppercase">Edit Profile</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Profile Photos */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                    Profile Photos
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {editForm.profilePhotos.map((photo, index) => (
                      <div key={index} className="relative aspect-square rounded-full overflow-hidden border" style={{ borderColor: theme.border }}>
                        <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                        {editForm.profilePhotos.length > 1 && (
                          <button
                            onClick={() => handleRemovePhoto(index)}
                            className="absolute top-1 right-1 p-1 rounded-full backdrop-blur-md"
                            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                          >
                            <Trash2 size={14} color="#fff" />
                          </button>
                        )}
                      </div>
                    ))}
                    {editForm.profilePhotos.length < 6 && (
                      <label className="aspect-square rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer transition-all active:scale-95" style={{ borderColor: theme.border }}>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                        <Plus size={24} style={{ color: theme.accent }} />
                      </label>
                    )}
                  </div>
                  <p className="text-[10px] opacity-40">Add up to 6 photos from your camera roll</p>
                </div>

                {/* Display Name */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={editForm.displayName}
                    onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl outline-none text-sm font-medium"
                    style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                    placeholder="Your name"
                  />
                </div>

                {/* Bio */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                    Bio
                  </label>
                  <textarea
                    value={editForm.bio}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-2xl outline-none text-sm font-medium resize-none"
                    style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                    placeholder="Tell us about yourself..."
                  />
                </div>

                {/* Social Links */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                    Social Links
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Twitter size={16} className="opacity-40" />
                      <input
                        type="text"
                        value={editForm.twitter}
                        onChange={(e) => setEditForm({ ...editForm, twitter: e.target.value })}
                        className="flex-1 px-4 py-3 rounded-2xl outline-none text-sm font-medium"
                        style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                        placeholder="@username"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Instagram size={16} className="opacity-40" />
                      <input
                        type="text"
                        value={editForm.instagram}
                        onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value })}
                        className="flex-1 px-4 py-3 rounded-2xl outline-none text-sm font-medium"
                        style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                        placeholder="username"
                      />
                    </div>
                  </div>
                </div>

                {/* Interests */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                    Interests (comma separated)
                  </label>
                  <input
                    type="text"
                    value={editForm.interests}
                    onChange={(e) => setEditForm({ ...editForm, interests: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl outline-none text-sm font-medium"
                    style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                    placeholder="Techno, Hardcore, Berlin..."
                  />
                </div>

                {/* Home City */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                    Home City
                  </label>
                  <select
                    value={editForm.homeCity}
                    onChange={(e) => setEditForm({ ...editForm, homeCity: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl outline-none text-sm font-medium"
                    style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                  >
                    {MOCK_CITIES.map(city => (
                      <option key={city.id} value={city.id}>{city.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <NeonButton className="flex-1" onClick={handleSave}>
                  Save Changes
                </NeonButton>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95"
                  style={{ backgroundColor: theme.surfaceAlt, color: theme.text }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
