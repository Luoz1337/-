
import crypto from 'node:crypto';

function derLength(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  let x = n;
  while (x > 0) {
    bytes.unshift(x & 0xff);
    x = Math.floor(x / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag, content) {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function derInteger(buffer) {
  let b = buffer;
  while (b.length > 1 && b[0] === 0) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return der(0x02, b);
}

const RSA_OID = Buffer.from('06092a864886f70d010101', 'hex');
const NULL = Buffer.from([0x05, 0x00]);

export function publicKeyPem(modulusHex, exponentHex) {
  const n = Buffer.from(String(modulusHex).trim(), 'hex');
  const e = Buffer.from(String(exponentHex).trim(), 'hex');
  if (!n.length || !e.length) throw new Error('公钥参数为空');
  const rsaPublicKey = der(0x30, Buffer.concat([derInteger(n), derInteger(e)]));
  const algorithm = der(0x30, Buffer.concat([RSA_OID, NULL]));
  const bitString = der(0x03, Buffer.concat([Buffer.from([0]), rsaPublicKey]));
  const spki = der(0x30, Buffer.concat([algorithm, bitString]));
  const lines = spki.toString('base64').match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

export function keyParamToHex(value) {
  const raw = String(value ?? '').trim().replace(/\\\//g, '/');
  if (!raw) throw new Error('公钥参数为空');
  if (/^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0) return raw.toLowerCase();
  const buf = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!buf.length) throw new Error('无法解析公钥参数');
  return buf.toString('hex');
}

export function encryptPassword(modulusHex, exponentHex, password) {
  const n = keyParamToHex(modulusHex);
  const e = keyParamToHex(exponentHex);
  const key = publicKeyPem(n, e);
  return crypto
    .publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(String(password), 'utf8'))
    .toString('base64');
}
