import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function deriveKey(clientSecret: string) {
  return createHash('sha256')
    .update('x-sync:oauth-token:v1\0')
    .update(clientSecret)
    .digest();
}

export function encryptToken(token: string, clientSecret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(clientSecret), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptToken(value: string, clientSecret: string) {
  const [version, ivValue, tagValue, encryptedValue, extra] = value.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue || extra) {
    throw new Error('Stored X token has an invalid format.');
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(clientSecret),
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Stored X token could not be decrypted. Reconnect the X account.');
  }
}
