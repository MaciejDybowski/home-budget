#!/usr/bin/env node
// Prints ONLY a hash to stdout; prompts go to stderr, never to shell arguments.
import argon2 from 'argon2';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

try {
  let password;
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--stdin', '--reset'].includes(arg)))
    throw new Error('Use --stdin and/or --reset, never password arguments.');
  if (args.includes('--stdin')) {
    const chunks = [];
    let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > 1026) throw new Error('Password is too long.');
      chunks.push(chunk);
    }
    password = Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '');
  } else {
    if (!process.stdin.isTTY)
      throw new Error(
        'Use an interactive terminal or --stdin. Do not pass passwords as arguments.',
      );
    const silent = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    });
    const reader = createInterface({
      input: process.stdin,
      output: silent,
      terminal: true,
    });
    try {
      process.stderr.write('Password (at least 12 characters): ');
      password = await reader.question('');
      process.stderr.write('\nRepeat password: ');
      const confirmation = await reader.question('');
      process.stderr.write('\n');
      if (password !== confirmation) throw new Error('Passwords do not match.');
    } finally {
      reader.close();
    }
  }
  if ([...password].length < 12 || Buffer.byteLength(password) > 1024)
    throw new Error('Use 12 or more characters, at most 1024 bytes.');
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 32768,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
  });
  if (args.includes('--reset')) {
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await client.query(
        'UPDATE "AuthAccount" SET "passwordHash"=$1, "version"=$2 WHERE id=1 RETURNING id',
        [hash, randomUUID()],
      );
      if (!result.rowCount)
        throw new Error(
          'No account exists. Complete first setup in the browser.',
        );
      await client.query('DELETE FROM "AuthSession"');
      await client.query('COMMIT');
      console.log('Password changed; all sessions revoked.');
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      throw error;
    } finally {
      client?.release();
      await pool.end();
    }
  } else console.log(hash);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
