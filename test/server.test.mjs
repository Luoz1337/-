import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { encryptPassword, publicKeyPem } from '../server/lib/rsa.js';
import { startImport, runImport } from '../server/api.js';

test('RSA 公钥加密可被私钥解密', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  const jwk = publicKey.export({ format: 'jwk' });
  const nHex = Buffer.from(jwk.n, 'base64url').toString('hex');
  const eHex = Buffer.from(jwk.e, 'base64url').toString('hex');

  const password = 'P@ssw0rd-中文-123';
  const encrypted = encryptPassword(nHex, eHex, password);
  const decrypted = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(encrypted, 'base64'),
  ).toString('utf8');
  assert.equal(decrypted, password);
  assert.match(publicKeyPem(nHex, eHex), /BEGIN PUBLIC KEY/);
});

test('会话失效时给出提示', async () => {
  const result = await runImport({ sessionId: 'not-exist' });
  assert.equal(result.ok, false);
  assert.match(result.message, /过期/);
});

test('非法教务地址被拒绝', async () => {
  const result = await startImport({ adapter: 'zfsoft', baseUrl: 'jwxt.example.edu.cn' });
  assert.equal(result.ok, false);
  assert.match(result.message, /http/);
});
