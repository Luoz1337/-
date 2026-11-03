import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptPassword, keyParamToHex } from '../server/lib/rsa.js';
test('base64 公钥（正方 V9）可加密并由私钥解密', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  const jwk = publicKey.export({ format: 'jwk' });
  const password = 'Test@1234';
  const encrypted = encryptPassword(jwk.n, jwk.e, password);
  const decrypted = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(encrypted, 'base64')).toString('utf8');
  assert.equal(decrypted, password);
  assert.match(keyParamToHex(jwk.e), /^010001$/);
});
