
import React, { useState, useEffect } from 'react';
import { useApp } from '../store';
import { useNavigate, useParams } from 'react-router-dom';
import { NeonButton, Card, Badge } from '../components/UI';
import { Settings, LogOut, Grid, Bookmark, MessageSquare, Palette, X, Twitter, Instagram, UserPlus, UserMinus, MessageCircle } from 'lucide-react';
import { THEMES } from '../theme';
import { MOCK_CITIES } from '../mockData';
import { motion, AnimatePresence } from 'framer-motion';
import { followUser, unfollowUser, isFollowing, getFollowers, getFollowing } from '../services/social';
import { User } from '../types';
import { supabase } from '../lib/supabase';

export const Profile: React.FC = () => {
  const { user: currentUser, theme, setThemeKey, logout, login, updateUser, activeCity } = useApp();
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
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
    avatarUrl: user?.avatarUrl || '',
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
    } else if (isViewingOtherProfile && !currentUser) {
      navigate('/login');
    } else if (!isViewingOtherProfile && currentUser) {
      // Load own follow counts
      loadFollowCounts();
    }
  }, [userId, currentUser, isViewingOtherProfile]);

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
        setViewedUser({
          id: data.id,
          username: data.username,
          displayName: data.display_name,
          avatarUrl: data.avatar_url,
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

  const handleSave = () => {
    if (!user) return;

    const interestsArray = editForm.interests
      .split(',')
      .map(i => i.trim())
      .filter(i => i.length > 0);

    updateUser({
      displayName: editForm.displayName,
      bio: editForm.bio,
      avatarUrl: editForm.avatarUrl,
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

  return (
    <div className="pb-20">
      {/* Profile Header */}
      <div className="px-6 pt-6 pb-10 flex flex-col items-center text-center">
        <div className="relative mb-6">
          <img src={user.avatarUrl} className="w-32 h-32 rounded-[2.5rem] object-cover border-4" style={{ borderColor: theme.accent }} />
          {user.verified && (
            <div className="absolute -bottom-2 -right-2 p-1.5 rounded-full" style={{ backgroundColor: theme.accent }}>
              <Badge label="Official" type="official" />
            </div>
          )}
        </div>
        <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-1">{user.displayName}</h2>
        <span className="text-sm font-bold opacity-50 mb-4">@{user.username}</span>
        <p className="text-sm leading-relaxed max-w-[280px] opacity-70 mb-6">{user.bio}</p>
        
        <div className="flex gap-8 mb-8">
          <div className="text-center">
            <span className="block font-black text-xl italic tracking-tighter">{followersCount || '0'}</span>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-40">Followers</span>
          </div>
          <div className="text-center">
            <span className="block font-black text-xl italic tracking-tighter">{followingCount || '0'}</span>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-40">Following</span>
          </div>
          <div className="text-center">
            <span className="block font-black text-xl italic tracking-tighter">12</span>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-40">Created</span>
          </div>
        </div>

        <div className="flex gap-3 w-full">
          {isViewingOtherProfile ? (
            <>
              <button
                onClick={handleFollow}
                disabled={isLoadingFollow}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ 
                  backgroundColor: isFollowingUser ? theme.surfaceAlt : theme.accent,
                  color: isFollowingUser ? theme.text : (theme.background === '#FFFFFF' ? '#FFF' : '#000')
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
            <>
              <NeonButton className="flex-1" onClick={() => {
                setEditForm({
                  displayName: user?.displayName || '',
                  bio: user?.bio || '',
                  avatarUrl: user?.avatarUrl || '',
                  twitter: user?.socials?.twitter || '',
                  instagram: user?.socials?.instagram || '',
                  interests: user?.interests?.join(', ') || '',
                  homeCity: user?.homeCity || '',
                });
                setShowEditModal(true);
              }}>
                Edit Profile
              </NeonButton>
              <button 
                onClick={() => navigate('/settings')}
                className="p-4 rounded-2xl transition-all active:scale-90" 
                style={{ backgroundColor: theme.surfaceAlt }}
              >
                <Settings size={20} />
              </button>
            </>
          )}
        </div>
      </div>

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
                {/* Avatar Preview */}
                {editForm.avatarUrl && (
                  <div className="flex justify-center mb-4">
                    <img 
                      src={editForm.avatarUrl} 
                      alt="Avatar preview" 
                      className="w-24 h-24 rounded-3xl object-cover border-2"
                      style={{ borderColor: theme.accent }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

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

                {/* Avatar URL */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                    Avatar URL
                  </label>
                  <input
                    type="url"
                    value={editForm.avatarUrl}
                    onChange={(e) => setEditForm({ ...editForm, avatarUrl: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl outline-none text-sm font-medium"
                    style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                    placeholder="https://..."
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

      {/* Theme Picker */}
      <div className="px-6 mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Palette size={18} color={theme.accent} />
          <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-40">Quick Identity</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(THEMES).slice(0, 4).map(([key, t]) => (
            <button 
              key={key} 
              onClick={() => setThemeKey(key)}
              className="p-4 rounded-2xl flex flex-col gap-2 border-2 transition-all active:scale-95"
              style={{ 
                backgroundColor: t.background, 
                borderColor: theme.name === t.name ? theme.accent : 'transparent' 
              }}
            >
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.accent }} />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.surface }} />
              </div>
              <span 
                className="text-[10px] font-black uppercase tracking-tight"
                style={{ color: t.text }}
              >
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 mb-10">
        <div className="flex justify-between mb-6">
          <button className="flex flex-col items-center gap-2 opacity-100">
            <Grid size={22} color={theme.accent} />
            <div className="h-1 w-4 rounded-full" style={{ backgroundColor: theme.accent }} />
          </button>
          <button className="flex flex-col items-center gap-2 opacity-30">
            <Bookmark size={22} />
          </button>
          <button className="flex flex-col items-center gap-2 opacity-30">
            <MessageSquare size={22} />
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <img key={i} src={`https://picsum.photos/seed/${i + 20}/300/300`} className="w-full aspect-square rounded-3xl object-cover grayscale hover:grayscale-0 transition-all cursor-pointer" />
          ))}
        </div>
      </div>
    </div>
  );
};
