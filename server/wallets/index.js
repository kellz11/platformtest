// Embedded Solana wallet provisioning — provider abstraction.
//
// Security model:
//   • The application database stores ONLY { user_id, provider, provider_ref, public_address }.
//   • Private key material NEVER enters the app DB, logs, API responses, or the browser.
//   • Production provider: Privy server wallets (key material held by Privy's TEE/KMS —
//     non-custodial-style distributed key management; we hold an opaque wallet id).
//   • Development provider: generates an ed25519 keypair locally; the secret is AES-256-GCM
//     encrypted with WALLET_MASTER_KEY and written to a keystore file OUTSIDE the app DB.
//     This provider is for local development/testing only and says so loudly.
//
// Provisioning is fire-and-forget after email verification: a failure never blocks
// signup; a retry sweep re-provisions missing wallets.
import { q } from '../db.js';
import { audit } from '../lib/util.js';
import * as privy from './privy.js';
import * as localdev from './local.js';

function provider() {
  if (process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET) return privy;
  return localdev;
}

export async function provisionWalletFor(userId) {
  const existing = q.get('SELECT public_address FROM wallet_associations WHERE user_id = ?', userId);
  if (existing) return existing.public_address;
  const p = provider();
  const { providerName, providerRef, publicAddress } = await p.createWallet(userId);
  q.run(
    'INSERT INTO wallet_associations (user_id, provider, provider_ref, public_address) VALUES (?,?,?,?)',
    userId, providerName, providerRef, publicAddress
  );
  audit(null, 'wallet.provisioned', 'user', userId, { provider: providerName });
  return publicAddress;
}

// Retry sweep: provision wallets for verified users who don't have one yet.
export async function provisionMissingWallets() {
  const rows = q.all(
    `SELECT u.id FROM users u
     LEFT JOIN wallet_associations w ON w.user_id = u.id
     WHERE u.email_verified_at IS NOT NULL AND u.status = 'active' AND w.user_id IS NULL LIMIT 100`
  );
  for (const row of rows) {
    try { await provisionWalletFor(row.id); } catch (err) { console.error('wallet provisioning failed for', row.id, err.message); }
  }
  return rows.length;
}
