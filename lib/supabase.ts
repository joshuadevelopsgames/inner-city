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
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.ts:35',message:'invokeSupabaseFunction called',data:{functionName,hasBody:!!body,bodyKeys:body?Object.keys(body):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    // Always include the anon key explicitly - Supabase Edge Functions require authentication
    // Get current session for user auth, but always include anon key as fallback
    const { data: { session } } = await supabase.auth.getSession();
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.ts:42',message:'Before invoke',data:{functionName,hasSession:!!session,hasAnonKey:!!supabaseAnonKey,anonKeyLength:supabaseAnonKey?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
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

    // Extract status code from error if available
    let statusCode: number | undefined;
    if (error) {
      // Try to extract status from error context or message
      const errorContext = (error as any).context;
      if (errorContext?.status) {
        statusCode = errorContext.status;
      } else if (error.message?.match(/\b(\d{3})\b/)) {
        const match = error.message.match(/\b(\d{3})\b/);
        statusCode = match ? parseInt(match[1], 10) : undefined;
      }
    }

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.ts:54',message:'After invoke',data:{functionName,hasError:!!error,hasData:!!data,errorMessage:error?.message||'none',errorStatus:statusCode||'none',errorContext:error?(error as any).context:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (error) {
      // Attach status code to error for better handling
      (error as any).statusCode = statusCode;
      
      // If 401, the function might not be accessible - handle gracefully without logging errors
      // The caller will handle this by skipping direct API fallback
      if (statusCode === 401 || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.ts:66',message:'401 Unauthorized error (handled gracefully)',data:{functionName,errorMessage:error.message,errorStatus:statusCode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        // Don't log as error - this is expected and handled gracefully by the caller
        if (import.meta.env.DEV) {
          console.warn(`Function ${functionName} returned 401 (handled gracefully - skipping direct API fallback).`);
        }
      }
      throw error;
    }

    return data as T;
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.ts:95',message:'invokeSupabaseFunction error',data:{functionName,errorMessage:error?.message||'unknown',errorStatus:error?.statusCode||error?.status||'unknown',errorCode:error?.code||'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    // Don't log 401 errors as errors - they're handled gracefully
    const statusCode = error?.statusCode || error?.status;
    if (statusCode !== 401) {
      console.error(`Error calling Supabase function ${functionName}:`, error);
    }
    throw error;
  }
}
