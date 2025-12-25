import { Storage } from 'megajs';
import dotenv from 'dotenv';

dotenv.config();

class MegaStorage {
  constructor() {
    this.config = {
      email: process.env.MEGA_EMAIL || 'camalkaakash2@gmail.com',
      password: process.env.MEGA_PASSWORD || 'dulina2011@##DULA-MD',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    this.storage = null;
    this.initialized = false;
  }
  
  async init() {
    if (this.initialized && this.storage) {
      return this.storage;
    }
    
    if (!this.config.email || !this.config.password) {
      console.log('⚠️ MEGA credentials not configured. Using local storage only.');
      return null;
    }
    
    try {
      console.log('🔐 Initializing MEGA storage...');
      
      this.storage = new Storage(this.config);
      
      await new Promise((resolve, reject) => {
        this.storage.on('ready', () => {
          console.log('✅ MEGA storage ready');
          this.initialized = true;
          resolve();
        });
        
        this.storage.on('error', reject);
        
        setTimeout(() => reject(new Error('MEGA initialization timeout')), 30000);
      });
      
      return this.storage;
      
    } catch (error) {
      console.error('❌ MEGA initialization failed:', error.message);
      this.storage = null;
      this.initialized = false;
      return null;
    }
  }
  
  async upload(data, filename) {
    try {
      const storage = await this.init();
      if (!storage) {
        // Return mock URL if MEGA is not configured
        return `https://mega.nz/file/MOCK_${Date.now()}`;
      }
      
      // Convert data to buffer
      let buffer;
      if (typeof data === 'string') {
        buffer = Buffer.from(data, 'utf8');
      } else if (Buffer.isBuffer(data)) {
        buffer = data;
      } else if (typeof data === 'object') {
        buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
      } else {
        throw new Error('Unsupported data type');
      }
      
      // Clean filename
      const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '_');
      
      console.log(`📤 Uploading to MEGA: ${cleanFilename}`);
      
      // Upload file
      const file = await storage.upload(cleanFilename, buffer).complete;
      
      // Get download link
      const url = await new Promise((resolve, reject) => {
        file.link((error, link) => {
          if (error) reject(error);
          else resolve(link);
        });
      });
      
      console.log(`✅ Upload successful: ${cleanFilename}`);
      return url;
      
    } catch (error) {
      console.error('❌ MEGA upload failed:', error.message);
      // Return mock URL on failure
      return `https://mega.nz/file/FAIL_${Date.now()}`;
    }
  }
  
  async close() {
    if (this.storage) {
      try {
        await this.storage.close();
        console.log('🔒 MEGA storage closed');
      } catch (error) {
        console.error('❌ Failed to close MEGA storage:', error);
      }
      this.storage = null;
      this.initialized = false;
    }
  }
}

// Create singleton instance
const megaStorage = new MegaStorage();

// Export functions
export const upload = async (data, filename) => {
  return megaStorage.upload(data, filename);
};

export const close = async () => {
  return megaStorage.close();
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  await megaStorage.close();
});

process.on('SIGINT', async () => {
  await megaStorage.close();
});

export default megaStorage;
