
import pino from 'pino';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { Boom } from '@hapi/boom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import baileys-dtz v5.4.0
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion
} = await import('@whiskeysockets/baileys');

// Import MEGA storage
import { upload } from './mega.js';

class WhatsAppManager {
  constructor(sessionsDir) {
    this.sessionsDir = sessionsDir;
    this.sessions = new Map();
    
    // Ensure directory exists
    fs.ensureDirSync(sessionsDir);
    
    console.log(`📁 Sessions directory: ${sessionsDir}`);
    
    // Cleanup old sessions on startup
    this.cleanupOldSessions();
  }
  
  async createSession(sessionId) {
    try {
      console.log(`🆕 Creating WhatsApp session: ${sessionId}`);
      
      const sessionPath = path.join(this.sessionsDir, sessionId);
      await fs.ensureDir(sessionPath);
      
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();
      
      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
        },
        logger: pino({ level: 'fatal' }),
        printQRInTerminal: true,
        browser: Browsers.macOS('Safari'),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        defaultQueryTimeoutMs: 60000,
        syncFullHistory: false
      });
      
      const session = {
        id: sessionId,
        path: sessionPath,
        sock,
        saveCreds,
        status: 'initializing',
        createdAt: new Date(),
        lastUpdate: new Date()
      };
      
      this.sessions.set(sessionId, session);
      
      // Setup event handlers
      this.setupEventHandlers(sessionId, sock, saveCreds);
      
      return session;
      
    } catch (error) {
      console.error(`❌ Failed to create session ${sessionId}:`, error);
      throw error;
    }
  }
  
  async createPairSession(sessionId, phoneNumber) {
    try {
      console.log(`🔗 Creating pair session: ${sessionId} for ${phoneNumber}`);
      
      const sessionPath = path.join(this.sessionsDir, sessionId);
      await fs.ensureDir(sessionPath);
      
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();
      
      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
        },
        logger: pino({ level: 'fatal' }),
        browser: Browsers.macOS('Safari'),
        printQRInTerminal: false,
        connectTimeoutMs: 60000
      });
      
      await delay(1500);
      
      // Request pairing code
      const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
      const pairingCode = await sock.requestPairingCode(cleanNumber);
      
      const session = {
        id: sessionId,
        path: sessionPath,
        sock,
        saveCreds,
        pairingCode,
        phoneNumber: cleanNumber,
        status: 'pairing',
        createdAt: new Date(),
        lastUpdate: new Date()
      };
      
      this.sessions.set(sessionId, session);
      
      // Setup event handlers
      this.setupEventHandlers(sessionId, sock, saveCreds);
      
      return session;
      
    } catch (error) {
      console.error(`❌ Failed to create pair session ${sessionId}:`, error);
      throw error;
    }
  }
  
  setupEventHandlers(sessionId, sock, saveCreds) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    sock.ev.on('connection.update', async (update) => {
      session.lastUpdate = new Date();
      
      const { connection, qr, lastDisconnect } = update;
      
      // Update session status
      if (connection) {
        session.status = connection;
        session.connected = connection === 'open';
        
        if (connection === 'open') {
          console.log(`✅ WhatsApp connected: ${sessionId}`);
          session.user = sock.user;
          
          // Upload session to MEGA
          await this.uploadSessionToMEGA(sessionId);
        }
      }
      
      if (qr) {
        session.qr = qr;
        console.log(`📱 QR generated for ${sessionId}`);
      }
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`❌ Connection closed for ${sessionId}: ${statusCode}`);
        
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          console.log(`🔄 Reconnecting ${sessionId} in 5 seconds...`);
          setTimeout(async () => {
            try {
              await this.reconnectSession(sessionId);
            } catch (error) {
              console.error(`❌ Failed to reconnect ${sessionId}:`, error);
            }
          }, 5000);
        } else {
          console.log(`🗑️ Cleaning up logged out session: ${sessionId}`);
          await this.removeSession(sessionId);
        }
      }
    });
    
    sock.ev.on('creds.update', saveCreds);
  }
  
  async uploadSessionToMEGA(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    try {
      const credsPath = path.join(session.path, 'creds.json');
      if (!await fs.pathExists(credsPath)) {
        console.log(`❌ No credentials file for ${sessionId}`);
        return;
      }
      
      const sessionData = await fs.readFile(credsPath, 'utf8');
      const filename = `whatsapp_session_${sessionId}.json`;
      
      const megaUrl = await upload(sessionData, filename);
      const fileId = megaUrl.replace('https://mega.nz/file/', '').split('#')[0];
      
      session.fileId = fileId;
      session.uploadedAt = new Date();
      
      console.log(`📤 Session ${sessionId} uploaded to MEGA: ${fileId}`);
      
      // Send session ID to user
      if (session.sock?.user?.id) {
        await session.sock.sendMessage(session.sock.user.id, {
          text: `🎉 *DARK NOVA XMD SESSION GENERATED*\n\n` +
                `🔐 *Session ID:*\n\`${fileId}\`\n\n` +
                `💾 *Save this ID for bot configuration*\n\n` +
                `⭐ *GitHub:* https://github.com/dula9x/DARK-NOVA-XMD\n` +
                `👥 *WhatsApp Channel:* https://whatsapp.com/channel/0029Vb9yA9K9sBI799oc7U2T\n\n` +
                `⚡ *Powered by WHITE ALPHA WOLF X TEAM*`
        });
      }
      
    } catch (error) {
      console.error(`❌ Failed to upload session ${sessionId}:`, error);
    }
  }
  
  async reconnectSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    try {
      const { state, saveCreds } = await useMultiFileAuthState(session.path);
      const { version } = await fetchLatestBaileysVersion();
      
      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
        },
        logger: pino({ level: 'fatal' }),
        browser: Browsers.macOS('Safari'),
        printQRInTerminal: false
      });
      
      session.sock = sock;
      session.saveCreds = saveCreds;
      session.status = 'reconnecting';
      
      this.setupEventHandlers(sessionId, sock, saveCreds);
      
    } catch (error) {
      console.error(`❌ Reconnection failed for ${sessionId}:`, error);
      await this.removeSession(sessionId);
    }
  }
  
  async removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    try {
      // Close socket connection
      if (session.sock) {
        try {
          await session.sock.logout();
          await session.sock.end(new Error('Session removal'));
        } catch (error) {
          // Ignore errors during logout
        }
      }
      
      // Remove session files
      if (session.path && await fs.pathExists(session.path)) {
        await fs.remove(session.path);
      }
      
      // Remove from sessions map
      this.sessions.delete(sessionId);
      
      console.log(`🧹 Session removed: ${sessionId}`);
      
    } catch (error) {
      console.error(`❌ Failed to remove session ${sessionId}:`, error);
    }
  }
  
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    return {
      id: session.id,
      status: session.status,
      connected: session.connected,
      user: session.user,
      fileId: session.fileId,
      qr: session.qr,
      pairingCode: session.pairingCode,
      createdAt: session.createdAt,
      lastUpdate: session.lastUpdate
    };
  }
  
  getSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      status: session.status,
      connected: session.connected,
      createdAt: session.createdAt,
      lastUpdate: session.lastUpdate
    }));
  }
  
  async cleanup() {
    console.log('🧹 Cleaning up all sessions...');
    
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.removeSession(sessionId);
    }
    
    console.log(`✅ Cleaned up ${sessionIds.length} sessions`);
  }
  
  async cleanupOldSessions() {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      
      for (const file of files) {
        const filePath = path.join(this.sessionsDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > oneDay) {
          await fs.remove(filePath);
          console.log(`🧹 Removed old session: ${file}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to cleanup old sessions:', error);
    }
  }
}

export default WhatsAppManager;
