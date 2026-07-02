// Privy server wallets (https://docs.privy.io) — production provider.
// Requires: PRIVY_APP_ID, PRIVY_APP_SECRET.
// Privy holds key material in their TEE-based key management system; the app only
// ever receives an opaque wallet id and the public Solana address.
const API = 'https://api.privy.io/v1';

function authHeader() {
  const basic = Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64');
  return { Authorization: `Basic ${basic}`, 'privy-app-id': process.env.PRIVY_APP_ID, 'Content-Type': 'application/json' };
}

export async function createWallet(userId) {
  const res = await fetch(`${API}/wallets`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ chain_type: 'solana', idempotency_key: `core-user-${userId}` }),
  });
  if (!res.ok) throw new Error(`Privy wallet creation failed: ${res.status} ${await res.text()}`);
  const wallet = await res.json();
  return { providerName: 'privy', providerRef: wallet.id, publicAddress: wallet.address };
}
