const NETWORK = 'devnet';
const CFG = {
  devnet: { rpc: 'https://api.devnet.solana.com', mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' },
  mainnet: { rpc: 'https://api.mainnet-beta.solana.com', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
};
const subs = new Set();
const state = { address: null, balance: null };
const emit = () => subs.forEach((f) => f());

function provider() {
  if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
  if (window.solflare && window.solflare.isSolflare) return window.solflare;
  return window.solana || null;
}

async function refresh() {
  if (!state.address) return;
  try {
    const c = CFG[NETWORK];
    const r = await fetch(c.rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner',
        params: [state.address, { mint: c.mint }, { encoding: 'jsonParsed' }],
      }),
    });
    const j = await r.json();
    state.balance = ((j.result && j.result.value) || []).reduce(
      (s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount || 0), 0);
  } catch (_) { state.balance = null; }
  emit();
}

async function connect() {
  const p = provider();
  if (!p) { const e = new Error('no wallet'); e.code = 'no-wallet'; throw e; }
  await p.connect();
  state.address = p.publicKey.toString();
  try { localStorage.setItem('chatfi_wallet', '1'); } catch (_) {}
  emit();
  refresh();
  return state.address;
}

async function restore() {
  let want = false;
  try { want = !!localStorage.getItem('chatfi_wallet'); } catch (_) {}
  const p = provider();
  if (!want || !p) return;
  try {
    await p.connect({ onlyIfTrusted: true });
    state.address = p.publicKey.toString();
    emit();
    refresh();
  } catch (_) {}
}

async function disconnect() {
  const p = provider();
  try { if (p && p.disconnect) await p.disconnect(); } catch (_) {}
  state.address = null;
  state.balance = null;
  try { localStorage.removeItem('chatfi_wallet'); } catch (_) {}
  emit();
}

async function sign(nonce) {
  const p = provider();
  if (!p || !state.address) throw new Error('not connected');
  const msg = new TextEncoder().encode('ChatFi Play sign-in\nNonce: ' + nonce);
  const r = await p.signMessage(msg, 'utf8');
  const bytes = r.signature || r;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { pubkey: state.address, sig: btoa(bin) };
}

export const wallet = {
  state,
  network: NETWORK,
  subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
  connect, restore, disconnect, sign, refresh,
};
