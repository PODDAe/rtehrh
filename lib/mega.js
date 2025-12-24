
import { Storage } from 'megajs';

const auth = {
  email: process.env.MEGA_EMAIL || 'your-email@example.com',
  password: process.env.MEGA_PASSWORD || 'your-password',
  userAgent: 'DARK-NOVA-XMD/2.0.0'
};

class MegaStorage {
  constructor() {
    this.storage = null;
  }

  async init() {
    if (!this.storage) {
      this.storage = new Storage(auth);
      await this.storage.ready;
    }
    return this.storage;
  }

  async upload(data, filename) {
    try {
      const storage = await this.init();
      
      // Convert data to buffer if needed
      let buffer;
      if (typeof data === 'string') {
        buffer = Buffer.from(data);
      } else if (data instanceof Buffer) {
        buffer = data;
      } else if (typeof data === 'object') {
        buffer = Buffer.from(JSON.stringify(data));
      } else {
        throw new Error('Unsupported data type');
      }

      const file = await storage.upload(
        filename,
        buffer,
        { allowUploadBuffering: true }
      ).complete;

      const url = await file.link();
      return url;
    } catch (error) {
      console.error('MEGA Upload Error:', error);
      throw error;
    }
  }

  async close() {
    if (this.storage) {
      await this.storage.close();
      this.storage = null;
    }
  }
}

// Singleton instance
const megaStorage = new MegaStorage();

export const upload = async (data, filename) => {
  return megaStorage.upload(data, filename);
};

export default megaStorage;
