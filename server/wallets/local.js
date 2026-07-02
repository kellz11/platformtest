// LOCAL DEVELOPMENT wallet provider.
// Generates a real ed25519 keypair (Solana-compatible address = base58 of the raw
// 32-byte public key). The private key is AES-256-GCM encrypted with WALLET_MASTER_KEY
// and appended to a keystore file that lives OUTSIDE the application database.
// This provider exists so the full wallet flow is testable without external services.
// DO NOT use in production — set PRIVY_APP_ID/PRIVY_APP_SECRET instead.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { base58 } from '../lib/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYSTORE = process.env.WALLET_KEYSTORE_FILE || path.join(__dirname, '..', '..', 'var', 'dev-keystore.jsonl');

function masterKey() {
  const raw = process.env.WALLET_MASTER_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('WALLET_MASTER_KEY is required (or configure Privy).');
    // deterministic dev-only key so local runs "just work"; warned at startup
    return crypto.createHash('sha256').update('core-dev-insecure-master-key').digest();
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export async function createWallet(userId) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubRaw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url'); // 32 bytes
  const secretPkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' });

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(secretPkcs8), cipher.final()]);
  const tag = cipher.getAuthTag();

  fs.mkdirSync(path.dirname(KEYSTORE), { recursive: true });
  fs.appendFileSync(KEYSTORE, JSON.stringify({
    user_id: userId,
    address: base58(pubRaw),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: enc.toString('base64'),
    created_at: new Date().toISOString(),
  }) + '\n', { mode: 0o600 });

  return { providerName: 'local-dev', providerRef: null, publicAddress: base58(pubRaw) };
}
