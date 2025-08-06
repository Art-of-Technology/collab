import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const saltLength = 64;
const tagLength = 16;
const ivLength = 16;
const iterations = 100000;
const keyLength = 32;

export class EncryptionService {
  /**
   * Validates the strength and format of the encryption key.
   * Throws an error if the key is weak or improperly formatted.
   * @param key - The key to validate
   */
  private static validateKeyStrength(key: string): void {
    // Require at least 32 characters (for AES-256)
    if (key.length < 32) {
      throw new Error('ENCRYPTION_KEY is too short. It must be at least 32 characters long for AES-256.');
    }
    // Require a mix of character types (upper, lower, digit, symbol)
    const hasUpper = /[A-Z]/.test(key);
    const hasLower = /[a-z]/.test(key);
    const hasDigit = /[0-9]/.test(key);
    const hasSymbol = /[^A-Za-z0-9]/.test(key);
    if (!(hasUpper && hasLower && hasDigit && hasSymbol)) {
      throw new Error('ENCRYPTION_KEY must contain upper and lower case letters, digits, and symbols.');
    }
    // Optionally, check for common weak keys
    const weakKeys = ['password', '123456', 'qwerty', 'letmein', 'secret', 'admin'];
    if (weakKeys.some(wk => key.toLowerCase().includes(wk))) {
      throw new Error('ENCRYPTION_KEY is too weak or contains common words.');
    }
  }

  private static getKey(): string {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    this.validateKeyStrength(key);
    return key;
  }

  /**
   * Encrypts sensitive data using AES-256-GCM
   * @param data - The data to encrypt
   * @returns Base64 encoded encrypted data with salt, iv, and tag
   */
  static encrypt(data: string | object): string {
    try {
      const textToEncrypt = typeof data === 'string' ? data : JSON.stringify(data);
      const password = this.getKey();

      // Generate salt and derive key
      const salt = crypto.randomBytes(saltLength);
      const key = crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');

      // Generate IV and create cipher
      const iv = crypto.randomBytes(ivLength);
      const cipher = crypto.createCipheriv(algorithm, key, iv);

      // Encrypt the data
      const encrypted = Buffer.concat([
        cipher.update(textToEncrypt, 'utf8'),
        cipher.final()
      ]);

      // Get the authentication tag
      const tag = cipher.getAuthTag();

      // Combine salt, iv, tag, and encrypted data
      const combined = Buffer.concat([salt, iv, tag, encrypted]);

      return combined.toString('base64');
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts data encrypted with the encrypt method
   * @param encryptedData - Base64 encoded encrypted data
   * @returns Decrypted data (string or parsed object)
   */
  static decrypt(encryptedData: string): any {
    try {
      const password = this.getKey();
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = combined.subarray(0, saltLength);
      const iv = combined.subarray(saltLength, saltLength + ivLength);
      const tag = combined.subarray(saltLength + ivLength, saltLength + ivLength + tagLength);
      const encrypted = combined.subarray(saltLength + ivLength + tagLength);

      // Derive key from password and salt
      const key = crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');

      // Create decipher
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(tag);

      // Decrypt the data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]).toString('utf8');

      // Try to parse as JSON, otherwise return as string
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Validates that encryption/decryption is working correctly
   * @returns true if encryption is properly configured
   */
  static validateConfiguration(): boolean {
    try {
      const testData = { test: 'data', timestamp: Date.now() };
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      
      return JSON.stringify(testData) === JSON.stringify(decrypted);
    } catch (error) {
      console.error('Encryption validation failed:', error);
      return false;
    }
  }

  /**
   * Generates a secure encryption key
   * @returns Base64 encoded encryption key
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }
}