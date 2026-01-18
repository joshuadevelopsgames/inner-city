import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NeonButton, Card } from '../components/UI';
import { Mail, Lock, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../store';

export const Login: React.FC = () => {
  const { theme, login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignup, setIsSignup] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignup) {
        // Sign up
        // Generate username from displayName or email
        const generatedUsername = username.trim() || 
          (displayName ? displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_') : '') ||
          email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        
        // Get the current site URL for redirect (production or localhost)
        const redirectTo = window.location.origin;
        
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName || email.split('@')[0],
              username: generatedUsername,
            },
            emailRedirectTo: redirectTo,
          },
        });

        if (signUpError) {
          console.error('Signup error:', signUpError);
          throw signUpError;
        }

        if (data.user) {
          // Profile will be auto-created by trigger, but it may take a moment
          // Wait a bit and retry if needed
          let profile = null;
          let retries = 0;
          while (!profile && retries < 5) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url, bio, interests, home_city, travel_cities, profile_mode, organizer_tier, verified, created_at')
              .eq('id', data.user.id)
              .maybeSingle();
            
            if (profileData) {
              profile = profileData;
              break;
            }
            retries++;
          }

          if (profile) {
            login(); // This will trigger user fetch from Supabase
            navigate('/');
          } else {
            // If profile still doesn't exist, proceed anyway - it will be created by the trigger
            // and the user can refresh or the auth state change will pick it up
            login();
            navigate('/');
          }
        }
      } else {
        // Sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        login(); // This will trigger user fetch from Supabase
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const isLight = theme.background === '#FFFFFF';

  return (
    <div className="h-full flex items-center justify-center p-6" style={{ background: theme.background }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="p-8">
          <div className="flex items-center justify-center mb-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-32 h-32 flex items-center justify-center relative"
            >
              <img 
                src="/inner-city.png" 
                alt="Inner City" 
                className="w-full h-full object-contain"
              />
            </motion.div>
          </div>

          <h1 className="text-3xl font-black italic tracking-tighter uppercase text-center mb-2">
            {isSignup ? 'Join Inner City' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-center opacity-60 mb-8">
            {isSignup ? 'Create your account to access the underground' : 'Sign in to continue'}
          </p>

          {error && (
            <div className="mb-6 p-4 rounded-2xl text-sm" style={{ backgroundColor: theme.surfaceAlt, color: '#ef4444' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                    Display Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl outline-none text-sm font-medium"
                      style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                      placeholder="Your name"
                      required={isSignup}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                    Username
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
                        // Only allow alphanumeric and underscores
                        const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                        setUsername(sanitized);
                      }}
                      className="w-full px-4 py-3 rounded-2xl outline-none text-sm font-medium"
                      style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                      placeholder="username"
                      pattern="[a-z0-9_]+"
                      minLength={3}
                      maxLength={30}
                    />
                  </div>
                  <p className="text-[9px] opacity-40 mt-1">Only letters, numbers, and underscores</p>
                </div>
              </>
            )}

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                Email
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 pl-12 rounded-2xl outline-none text-sm font-medium"
                  style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
                Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pl-12 rounded-2xl outline-none text-sm font-medium"
                  style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <NeonButton
              type="submit"
              className="w-full py-4 mt-6"
              disabled={loading}
            >
              {loading ? 'Loading...' : isSignup ? 'Create Account' : 'Sign In'}
            </NeonButton>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignup(!isSignup);
                setError(null);
                setDisplayName('');
                setUsername('');
              }}
              className="text-sm font-medium opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: theme.accent }}
            >
              {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};
