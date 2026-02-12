#!/usr/bin/env node
/**
 * Generate a test JWT token for authentication testing
 * Usage: node scripts/generate-test-token.js [userId]
 */

const jwt = require('jsonwebtoken');

// Get JWT secret from environment or use default
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-for-testing-only';

// Get userId from command line or use default
const userId = process.argv[2] || 'test-user-123';

// Create JWT payload
const payload = {
  sub: userId,
  userId: userId,
  iat: Math.floor(Date.now() / 1000),
};

// Generate token
const token = jwt.sign(payload, JWT_SECRET, {
  algorithm: 'HS256',
  expiresIn: '24h',
});

console.log('\n🔑 Generated JWT Token:');
console.log('━'.repeat(60));
console.log(token);
console.log('━'.repeat(60));
console.log(`\n📋 Token Info:`);
console.log(`   User ID: ${userId}`);
console.log(`   Algorithm: HS256`);
console.log(`   Expires: 24 hours`);
console.log(`\n💡 Usage:`);
console.log(`   Authorization: Bearer ${token.substring(0, 20)}...`);
console.log('');
