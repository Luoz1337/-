import crypto from 'node:crypto';
import fs from 'node:fs';

const [zipPath, outPath, keyHex] = process.argv.slice(2);
const key = Buffer.from(keyHex, 'hex');
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
cipher.setAAD(Buffer.from('SuperTable-3.2.3'));
const zip = fs.readFileSync(zipPath);
const body = Buffer.concat([cipher.update(zip), cipher.final()]);
const tag = cipher.getAuthTag();
fs.writeFileSync(outPath, Buffer.concat([iv, body, tag]));
