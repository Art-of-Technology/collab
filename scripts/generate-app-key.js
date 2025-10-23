#!/usr/bin/env node

import crypto from 'crypto';

/**
 * Generate a secure 32-character encryption key for APP_TOKENS_KEY
 */
function generateAppTokensKey() {
  const key = crypto.randomBytes(16).toString('hex'); // 32 characters
  return key;
}

const key = generateAppTokensKey();

console.log('🔐 Generated APP_TOKENS_KEY:');
console.log(key);
console.log('');
console.log('Add this to your .env.local file:');
console.log(`APP_TOKENS_KEY="${key}"`);
console.log('');
console.log('⚠️  Keep this key secure and never commit it to version control!');
