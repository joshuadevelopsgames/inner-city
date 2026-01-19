/**
 * Supabase Client Configuration
 * 
 * Get your Supabase URL and anon key from:
 * https://app.supabase.com/project/_/settings/api
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase URL and Anon Key are required. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file'
  );
} else {
  console.log('✅ Supabase connected:', supabaseUrl);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Helper function to call Supabase Edge Functions
export async function invokeSupabaseFunction<T = any>(
  functionName: string,
  body?: any
): Promise<T> {
  try {
    // Always include the anon key explicitly - Supabase Edge Functions require authentication
    // Get current session for user auth, but always include anon key as fallback
    const { data: { session } } = await supabase.auth.getSession();
    
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: {
        // Always include anon key - required for Edge Functions
        Authorization: session 
          ? `Bearer ${session.access_token}` 
          : `Bearer ${supabaseAnonKey}`,
        // Also include as apikey header (some Supabase setups require this)
        apikey: supabaseAnonKey,
      },
    });

    if (error) {
      // If 401, the function might not be accessible
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        console.error(`Function ${functionName} returned 401. Check if function allows anonymous access.`);
        console.error('Error details:', error);
      }
      throw error;
    }

    return data as T;
  } catch (error: any) {
    console.error(`Error calling Supabase function ${functionName}:`, error);
    throw error;
  }
}
