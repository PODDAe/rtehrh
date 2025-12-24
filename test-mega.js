import { testConnection, upload, getInfo } from './lib/mega.js';
import dotenv from 'dotenv';

dotenv.config();

async function testMEGA() {
  console.log('🚀 Starting MEGA Storage Test...\n');
  
  try {
    // Test 1: Connection test
    console.log('1️⃣ Testing MEGA connection...');
    const connectionTest = await testConnection();
    console.log('Result:', JSON.stringify(connectionTest, null, 2));
    
    if (!connectionTest.success) {
      console.error('❌ MEGA credentials are invalid or not configured!');
      console.log('💡 Please check:');
      console.log('   - MEGA_EMAIL environment variable');
      console.log('   - MEGA_PASSWORD environment variable');
      console.log('   - Internet connection');
      console.log('   - MEGA account status\n');
      
      // Show example .env format
      console.log('📝 Example .env file:');
      console.log('MEGA_EMAIL=camalkaakash2@gmail.com');
      console.log('MEGA_PASSWORD=dulina2011@##DULA-MD\n');
      return;
    }
    
    // Test 2: Get storage info
    console.log('\n2️⃣ Getting storage information...');
    const info = await getInfo();
    console.log('Storage Info:', info);
    
    // Test 3: Upload test file
    console.log('\n3️⃣ Uploading test session file...');
    const testSession = {
      sessionId: `test_${Date.now()}`,
      phoneNumber: '94701234567',
      timestamp: new Date().toISOString(),
      platform: 'DARK-NOVA-XMD',
      test: true
    };
    
    const filename = `test_session_${Date.now()}.json`;
    const url = await upload(testSession, filename);
    console.log('✅ Upload successful!');
    console.log('📄 File:', filename);
    console.log('🔗 URL:', url);
    
    // Test 4: Extract file ID
    const fileId = url.replace('https://mega.nz/file/', '').split('#')[0];
    console.log('🆔 File ID:', fileId);
    
    console.log('\n🎉 All MEGA tests completed successfully!');
    console.log('✅ Your MEGA storage is properly configured.');
    console.log('✅ Files can be uploaded and accessed.');
    console.log('✅ Ready for WhatsApp session generation.');
    
  } catch (error) {
    console.error('\n❌ MEGA test failed:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.message.includes('credentials')) {
      console.log('\n🔧 Troubleshooting tips:');
      console.log('1. Create a .env file in your project root');
      console.log('2. Add your MEGA credentials:');
      console.log('   MEGA_EMAIL=camalkaakash2@gmail.com');
      console.log('   MEGA_PASSWORD=your-password');
      console.log('3. Restart the application');
      console.log('\n⚠️  For Vercel deployment:');
      console.log('   Add these as Environment Variables in Vercel dashboard');
    }
  }
}

// Run test
testMEGA();
