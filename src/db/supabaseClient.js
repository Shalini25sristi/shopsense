"use strict";
/**
 * Supabase client configuration.
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)
 * from environment variables.
 */
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
} else {
  // If not configured, provide a clear warning when accessed
  // (app can still run in local SQLite fallback mode)
}

function getSupabaseClient() {
  if (!supabase) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Supabase credentials missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
      );
    }
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
}

module.exports = {
  getSupabaseClient,
  isSupabaseConfigured,
};
