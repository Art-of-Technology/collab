import nodemailer from 'nodemailer';

/**
 * This script generates test SMTP credentials using Ethereal.email
 * You can use these credentials for testing email functionality in development
 * 
 * Run with: npx ts-node scripts/generate-test-email.ts
 */
async function generateTestCredentials() {
  console.log('Creating test SMTP credentials with Ethereal...');
  
  try {
    // Generate test SMTP service account from ethereal.email
    const testAccount = await nodemailer.createTestAccount();
    
    console.log('✅ Test credentials generated successfully!');
    console.log('\nAdd these credentials to your .env file:');
    console.log('\nEMAIL_HOST=smtp.ethereal.email');
    console.log(`EMAIL_PORT=587`);
    console.log(`EMAIL_USER=${testAccount.user}`);
    console.log(`EMAIL_PASSWORD=${testAccount.pass}`);
    console.log(`EMAIL_SECURE=false`);
    
    console.log('\nPreview URL: any emails sent will be captured at:');
    console.log(`https://ethereal.email/login`);
    console.log('Login with:');
    console.log(`Email: ${testAccount.user}`);
    console.log(`Password: ${testAccount.pass}`);
  } catch (error) {
    console.error('Error generating test credentials:', error);
  }
}

generateTestCredentials(); 