// Cloud features through Supabase: sign-in, syncing saved entries, and AI food scanning.
// Everything here is optional: when assets/config.js is empty, `configured` is false
// and the pages keep working in this browser only.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let sbPromise = null;

export function client() {
  if (!configured) return Promise.resolve(null);
  if (!sbPromise) {
    sbPromise = import('./vendor/supabase.mjs')
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'dsj-auth' }
      }))
      .catch(e => { sbPromise = null; throw e; });
  }
  return sbPromise;
}

/* ---------- account ---------- */
export async function currentUser() {
  const sb = await client(); if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data && data.session ? data.session.user : null;
}
export async function onAuthChange(cb) {
  const sb = await client(); if (!sb) return;
  sb.auth.onAuthStateChange((event, session) => cb(event, session ? session.user : null));
}
const pageUrl = () => location.origin + location.pathname;
function friendly(e) {
  const m = (e && e.message) || '';
  if (/invalid login credentials/i.test(m)) return new Error('Wrong email or password.');
  if (/email not confirmed/i.test(m)) return new Error('Confirm your email first. Check your inbox for the link.');
  if (/already (been )?registered/i.test(m)) return new Error('That email already has an account. Sign in instead.');
  if (/signups? (are )?not allowed|signup.*disabled/i.test(m)) return new Error('New accounts are turned off for this site.');
  if (/password should be at least/i.test(m)) return new Error('Use a password with at least 6 characters.');
  if (/rate limit|too many/i.test(m)) return new Error('Too many tries. Wait a few minutes and try again.');
  if (/fetch|network|load failed/i.test(m)) return new Error("Couldn't reach the sign-in service. Check your connection.");
  return new Error(m || 'Something went wrong. Try again.');
}
async function need() { const sb = await client(); if (!sb) throw new Error('Sign-in is not set up on this site yet.'); return sb; }
export async function signIn(email, password) {
  const sb = await need();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw friendly(error);
  return data.user;
}
export async function signUp(email, password) {
  const sb = await need();
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: pageUrl() } });
  if (error) throw friendly(error);
  return { user: data.user, needsConfirm: !data.session };
}
export async function signOut() { const sb = await need(); await sb.auth.signOut(); }
export async function sendReset(email) {
  const sb = await need();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: pageUrl() });
  if (error) throw friendly(error);
}
export async function setPassword(password) {
  const sb = await need();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw friendly(error);
}

/* ---------- sync: one table, `entries`, keyed by (user, kind, key) ---------- */
export async function pull(kinds) {
  const sb = await client(); if (!sb) return [];
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('entries').select('kind,key,data').in('kind', kinds).order('key').range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
export async function push(rows) {
  if (!rows.length) return;
  const sb = await client(); const user = await currentUser();
  if (!sb || !user) return;
  const payload = rows.map(r => ({ user_id: user.id, kind: r.kind, key: r.key, data: r.data, updated_at: new Date(r.data.u || Date.now()).toISOString() }));
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await sb.from('entries').upsert(payload.slice(i, i + 200), { onConflict: 'user_id,kind,key' });
    if (error) throw error;
  }
}

/* ---------- AI food scanning through the server function ---------- */
export async function scanFood(body, signal) {
  const sb = await client();
  if (!sb) throw { code: 'config', message: 'AI scanning through your account is not set up yet.' };
  const { data, error } = await sb.functions.invoke('scan-food', { body, signal, timeout: 170000 });
  if (signal && signal.aborted) throw { code: 'cancelled', message: '' };
  if (error) {
    let msg = '';
    try { if (error.context && typeof error.context.json === 'function') { const j = await error.context.json(); msg = j && j.error; } } catch (e) { /* not JSON */ }
    const status = error.context && error.context.status;
    if (!msg && status === 404) msg = "The AI scanner isn't installed on the server yet.";
    if (!msg && error.name === 'FunctionsFetchError') msg = "Couldn't reach the AI scanner. Check your connection.";
    throw { code: 'server', message: msg || 'The AI scanner had a problem. Try again in a moment.' };
  }
  if (!data || !Array.isArray(data.items)) throw { code: 'parse', message: "The AI's answer couldn't be read. Try again." };
  return data;
}
