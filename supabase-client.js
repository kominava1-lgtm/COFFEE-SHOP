/* =====================================================
   SUPABASE CONNECTION
   This file sets up the connection to our backend
   (accounts + database, and later, photo storage).
   Everything else — auth, registering a cafe, admin
   approval — will be built on top of this one connection.
   ===================================================== */

const SUPABASE_URL = 'https://vnnnfdperzvhtfukyqkz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EGowxhShkWDZ4FQv2-XVtg_UEWnxTMq';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);