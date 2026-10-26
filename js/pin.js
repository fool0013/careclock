// caregiver PIN: stored as a salted SHA-256 hash, never as the digits themselves.
// honest scope: a 4-6 digit PIN only stops accidental edits in simple mode. it is not encryption,
// and anyone with the unlocked phone could still read the data (see SECURITY.md).

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hashPin(pin, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`careclock:${salt}:${pin}`));
  return `sha256:${salt}:${hex(h)}`;
}

export async function checkPin(pin, stored) {
  const salt = String(stored).split(':')[1];
  if (!salt) return false;
  return (await hashPin(pin, salt)) === stored;
}

// slow down guessing: 5 wrong tries -> wait 60s (doubles each time). survives a page reload.
const MAX_TRIES = 5;
const KEY = 'careclock.pinlock';
const load = () => {
  try {
    const o = JSON.parse(localStorage.getItem(KEY));
    return { fails: Number(o.fails) || 0, until: Number(o.until) || 0, penalty: Number(o.penalty) || 60000 };
  } catch {
    return { fails: 0, until: 0, penalty: 60000 };
  }
};
let st = load();
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode: in-memory only */ }
};

export const lockRemaining = (now = Date.now()) => Math.max(0, Math.ceil((st.until - now) / 1000));

export function recordFail(now = Date.now()) {
  st.fails++;
  if (st.fails >= MAX_TRIES) {
    st.until = now + st.penalty;
    st.penalty = Math.min(st.penalty * 2, 3600000);
    st.fails = 0;
  }
  save();
}

export function recordSuccess() {
  st = { fails: 0, until: 0, penalty: 60000 };
  save();
}
