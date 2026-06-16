// Settings > API dans le dashboard Supabase (projet vote-rcfc)
const SUPABASE_URL  = 'REMPLACE_PAR_TON_URL';
const SUPABASE_ANON = 'REMPLACE_PAR_TA_CLE_ANON';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
