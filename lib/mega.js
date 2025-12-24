import { Storage } from 'megajs';
import fs from 'fs';
import { Readable } from 'stream';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class MegaStorage {
  constructor() {
    this.storage = null;
    this.isInitialized = false;
    this.initPromise = null;
    
    // Configuration
    this.config = {
      email: process.env.MEGA_EMAIL || 'camalkaakash2@gmail.com',
      password: process.env.MEGA_PASSWORD || 'dulina2011@##DULA-MD',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      keepalive: true,
      autologin: true
    };
  }

  /**
   * Initialize MEGA storage connection
   */
  async init() {
    if (this.isInitialized) return this.storage;
    
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      try {
        // Validate credentials
        if (!this.config.email || !this.config.password) {
          throw new Error('MEGA credentials not configured. Please set MEGA_EMAIL and MEGA_PASSWORD environment variables.');
        }

        console.log('🔐 Initializing MEGA storage...');
        
        // Create storage instance
        this.storage = new Storage(this.config);
        
        // Wait for storage to be ready
        await new Promise((resolve, reject) => {
          this.storage.on('ready', resolve);
          this.storage.on('error', reject);
          
          // Timeout after 30 seconds
          setTimeout(() => reject(new Error('MEGA storage initialization timeout')), 30000);
        });
        
        console.log('✅ MEGA storage initialized successfully');
        console.log(`📊 Storage space: ${this.formatBytes(this.storage.usedBytes)} / ${this.formatBytes(this.storage.totalBytes)}`);
        
        this.isInitialized = true;
        return this.storage;
        
      } catch (error) {
        console.error('❌ MEGA initialization failed:', error.message);
        this.storage = null;
        this.isInitialized = false;
        this.initPromise = null;
        throw error;
      }
    })();
    
    return this.initPromise;
  }

  /**
   * Upload file to MEGA
   * @param {Buffer|string|Readable|Object} data - Data to upload
   * @param {string} filename - Name for the uploaded file
   * @returns {Promise<string>} - MEGA file URL
   */
  async upload(data, filename) {
    try {
      // Ensure storage is initialized
      const storage = await this.init();
      
      // Prepare data for upload
      let uploadData;
      if (Buffer.isBuffer(data)) {
        uploadData = data;
      } else if (typeof data === 'string') {
        uploadData = Buffer.from(data, 'utf8');
      } else if (data instanceof Readable) {
        // For streams, we need to collect the data
        uploadData = await this.streamToBuffer(data);
      } else if (typeof data === 'object') {
        // For JSON objects
        uploadData = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
      } else {
        throw new Error(`Unsupported data type: ${typeof data}`);
      }

      // Clean filename
      const cleanFilename = this.sanitizeFilename(filename);
      
      console.log(`📤 Uploading file: ${cleanFilename} (${this.formatBytes(uploadData.length)})`);
      
      // Upload file
      const uploadStream = storage.upload({
        name: cleanFilename,
        attributes: {
          created: new Date(),
          type: 'application/json'
        },
        allowUploadBuffering: true
      }, uploadData);
      
      // Wait for upload to complete
      const file = await new Promise((resolve, reject) => {
        uploadStream.on('complete', resolve);
        uploadStream.on('error', reject);
        
        // Timeout after 60 seconds
        setTimeout(() => reject(new Error('Upload timeout')), 60000);
      });
      
      // Get download link
      const url = await new Promise((resolve, reject) => {
        file.link((error, link) => {
          if (error) reject(error);
          else resolve(link);
        });
        
        // Timeout after 30 seconds
        setTimeout(() => reject(new Error('Link generation timeout')), 30000);
      });
      
      console.log(`✅ File uploaded successfully: ${cleanFilename}`);
      console.log(`🔗 Download URL: ${url}`);
      
      return url;
      
    } catch (error) {
      console.error('❌ Upload failed:', error.message);
      
      // If it's an authentication error, reset storage
      if (error.message.includes('authentication') || error.message.includes('credentials')) {
        console.log('🔄 Resetting MEGA storage due to authentication error...');
        await this.reset();
      }
      
      throw error;
    }
  }

  /**
   * Upload from file path
   * @param {string} filePath - Path to local file
   * @param {string} filename - Optional custom filename
   * @returns {Promise<string>} - MEGA file URL
   */
  async uploadFile(filePath, filename = null) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Read file
      const fileData = fs.readFileSync(filePath);
      const uploadFilename = filename || this.getFilenameFromPath(filePath);
      
      return await this.upload(fileData, uploadFilename);
      
    } catch (error) {
      console.error('❌ File upload failed:', error.message);
      throw error;
    }
  }

  /**
   * List files in MEGA storage
   * @returns {Promise<Array>} - List of files
   */
  async listFiles() {
    try {
      const storage = await this.init();
      const files = [];
      
      storage.root.children.forEach(file => {
        files.push({
          name: file.name,
          size: file.size,
          type: file.directory ? 'directory' : 'file',
          created: file.timestamp,
          downloadLink: file.downloadLink
        });
      });
      
      return files;
    } catch (error) {
      console.error('❌ Failed to list files:', error.message);
      throw error;
    }
  }

  /**
   * Delete file from MEGA storage
   * @param {string} filename - File to delete
   */
  async deleteFile(filename) {
    try {
      const storage = await this.init();
      const file = storage.root.children.find(f => f.name === filename);
      
      if (file) {
        await file.delete();
        console.log(`🗑️ File deleted: ${filename}`);
        return true;
      } else {
        console.log(`⚠️ File not found: ${filename}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to delete file:', error.message);
      throw error;
    }
  }

  /**
   * Close MEGA storage connection
   */
  async close() {
    try {
      if (this.storage) {
        await this.storage.close();
        console.log('🔒 MEGA storage connection closed');
      }
      this.storage = null;
      this.isInitialized = false;
      this.initPromise = null;
    } catch (error) {
      console.error('❌ Failed to close storage:', error.message);
    }
  }

  /**
   * Reset storage connection
   */
  async reset() {
    await this.close();
    return this.init();
  }

  /**
   * Get storage info
   */
  async getInfo() {
    try {
      const storage = await this.init();
      return {
        used: this.formatBytes(storage.usedBytes),
        total: this.formatBytes(storage.totalBytes),
        free: this.formatBytes(storage.totalBytes - storage.usedBytes),
        percentage: Math.round((storage.usedBytes / storage.totalBytes) * 100)
      };
    } catch (error) {
      console.error('❌ Failed to get storage info:', error.message);
      throw error;
    }
  }

  // Helper methods

  /**
   * Convert stream to buffer
   */
  async streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // Remove invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 255); // Limit length
  }

  /**
   * Extract filename from path
   */
  getFilenameFromPath(filePath) {
    return filePath.split(/[\\/]/).pop();
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Generate random filename
   */
  generateRandomFilename(prefix = 'session', extension = 'json') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}_${random}.${extension}`;
  }

  /**
   * Extract file ID from MEGA URL
   */
  extractFileId(url) {
    const match = url.match(/mega\.nz\/file\/([^#]+)/);
    return match ? match[1] : null;
  }

  /**
   * Create download URL from file ID
   */
  createDownloadUrl(fileId) {
    return `https://mega.nz/file/${fileId}`;
  }

  /**
   * Test MEGA connection
   */
  async testConnection() {
    try {
      console.log('🧪 Testing MEGA connection...');
      
      const storage = await this.init();
      
      // Create a test file
      const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        service: 'DARK-NOVA-XMD Session Generator'
      };
      
      const testFilename = `test_${Date.now()}.json`;
      const url = await this.upload(testData, testFilename);
      
      // Verify upload
      const fileId = this.extractFileId(url);
      
      if (!fileId) {
        throw new Error('Failed to extract file ID from URL');
      }
      
      console.log('✅ MEGA connection test successful!');
      console.log(`📄 Test file: ${testFilename}`);
      console.log(`🔗 Test URL: ${url}`);
      
      // Clean up test file
      try {
        await this.deleteFile(testFilename);
        console.log('🧹 Test file cleaned up');
      } catch (cleanupError) {
        console.warn('⚠️ Could not clean up test file:', cleanupError.message);
      }
      
      return {
        success: true,
        url,
        fileId,
        message: 'MEGA connection test successful'
      };
      
    } catch (error) {
      console.error('❌ MEGA connection test failed:', error.message);
      
      return {
        success: false,
        error: error.message,
        message: 'MEGA connection test failed'
      };
    }
  }
}

// Create singleton instance
const megaStorage = new MegaStorage();

// Export functions
export const upload = async (data, filename) => {
  return megaStorage.upload(data, filename);
};

export const uploadFile = async (filePath, filename) => {
  return megaStorage.uploadFile(filePath, filename);
};

export const listFiles = async () => {
  return megaStorage.listFiles();
};

export const deleteFile = async (filename) => {
  return megaStorage.deleteFile(filename);
};

export const close = async () => {
  return megaStorage.close();
};

export const getInfo = async () => {
  return megaStorage.getInfo();
};

export const testConnection = async () => {
  return megaStorage.testConnection();
};

export const generateRandomFilename = (prefix, extension) => {
  return megaStorage.generateRandomFilename(prefix, extension);
};

export const extractFileId = (url) => {
  return megaStorage.extractFileId(url);
};

export const createDownloadUrl = (fileId) => {
  return megaStorage.createDownloadUrl(fileId);
};

// Export default instance
export default megaStorage;
