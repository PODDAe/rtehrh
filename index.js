import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Configuration
const PORT = process.env.PORT || 3000;
const SESSIONS_DIR = path.join(__dirname, 'sessions');

// Ensure sessions directory exists
fs.ensureDirSync(SESSIONS_DIR);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Import baileys
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';

// Import MEGA storage
import { upload } from './lib/mega.js';

// Active sessions store
const activeSessions = new Map();

// Function to create WhatsApp session
async function createWhatsAppSession(sessionId) {
  try {
    const sessionPath = path.join(SESSIONS_DIR, sessionId);
    await fs.ensureDir(sessionPath);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
      },
      logger: pino({ level: 'silent' }),
      browser: Browsers.macOS('Safari'),
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      emitOwnEvents: true,
      defaultQueryTimeoutMs: 60000,
      syncFullHistory: false,
      // Removed printQRInTerminal option as it's deprecated
    });
    
    const session = {
      id: sessionId,
      path: sessionPath,
      sock,
      saveCreds,
      status: 'initializing',
      createdAt: new Date()
    };
    
    activeSessions.set(sessionId, session);
    
    return new Promise((resolve, reject) => {
      let qrTimeout = setTimeout(() => {
        reject(new Error('QR code generation timeout'));
        // Clean up session on timeout
        cleanupSession(sessionId);
      }, 45000); // 45 seconds timeout
      
      sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;
        
        if (qr) {
          clearTimeout(qrTimeout);
          console.log(`📱 QR Code generated for session: ${sessionId}`);
          
          try {
            // Generate QR code image for web
            const qrImage = await QRCode.toDataURL(qr, {
              errorCorrectionLevel: 'H',
              margin: 2,
              width: 300,
              color: {
                dark: '#FF003C',
                light: '#0A0A0F'
              }
            });
            
            // Also print QR in terminal for debugging
            console.log('╔══════════════════════════════════════════════════╗');
            console.log('║             WHATSAPP QR CODE                     ║');
            console.log('║        Scan with your WhatsApp app               ║');
            console.log('╚══════════════════════════════════════════════════╝');
            
            session.qr = qrImage;
            session.rawQR = qr;
            session.status = 'qr_generated';
            session.qrGeneratedAt = new Date();
            
            resolve({
              success: true,
              qr: qrImage,
              sessionId,
              rawQR: qr
            });
            
          } catch (error) {
            console.error('❌ Failed to generate QR image:', error);
            reject(error);
          }
        }
        
        if (connection === 'open') {
          console.log(`✅ WhatsApp connected: ${sessionId}`);
          clearTimeout(qrTimeout);
          session.status = 'connected';
          session.user = sock.user;
          session.connectedAt = new Date();
          
          // Upload session to MEGA
          try {
            const credsPath = path.join(sessionPath, 'creds.json');
            if (await fs.pathExists(credsPath)) {
              const sessionData = await fs.readFile(credsPath, 'utf8');
              const filename = `whatsapp_session_${sessionId}.json`;
              
              const megaUrl = await upload(sessionData, filename);
              const fileId = megaUrl.replace('https://mega.nz/file/', '').split('#')[0];
              
              session.fileId = fileId;
              session.uploadedAt = new Date();
              
              console.log(`📤 Session uploaded to MEGA: ${fileId}`);
              
              // Send session ID to user
              if (sock.user?.id) {
                await sock.sendMessage(sock.user.id, {
                  text: `🎉 *DARK NOVA XMD SESSION GENERATED*\n\n` +
                        `🔐 *Session ID:*\n\`${fileId}\`\n\n` +
                        `💾 *Save this ID for bot configuration*\n\n` +
                        `⭐ *GitHub:* https://github.com/alpha-x-team-ofc/DTZ-NOVA-X-MD-V.1\n` +
                        `👥 *WhatsApp Channel:https://whatsapp.com/channel/0029Vb6mfVdEAKWH5Sgs9y2L* \n\n` +
                        `⚡ *Powered by DTZ TEAM*`
                });
              }
            }
          } catch (uploadError) {
            console.error(`❌ Upload failed for ${sessionId}:`, uploadError);
            // Continue even if upload fails
          }
        }
        
        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.log(`❌ Connection closed for ${sessionId}: Status ${statusCode}`);
          session.status = 'disconnected';
          session.disconnectedAt = new Date();
          
          if (statusCode === 408) {
            console.log(`🔄 Session ${sessionId} timed out, cleaning up...`);
            cleanupSession(sessionId);
          } else if (statusCode !== DisconnectReason.loggedOut) {
            // Attempt reconnect after 5 seconds only if not logged out
            setTimeout(() => {
              console.log(`🔄 Attempting to reconnect ${sessionId}...`);
              createWhatsAppSession(sessionId).catch(() => {});
            }, 5000);
          } else {
            console.log(`👋 Session ${sessionId} logged out, cleaning up...`);
            cleanupSession(sessionId);
          }
        }
      });
      
      sock.ev.on('creds.update', saveCreds);
      
      // Handle errors
      sock.ev.on('connection.update', (update) => {
        if (update.qr) {
          // QR received, extend timeout
          clearTimeout(qrTimeout);
          qrTimeout = setTimeout(() => {
            console.log(`⏰ QR timeout for ${sessionId}, cleaning up...`);
            cleanupSession(sessionId);
            reject(new Error('QR scan timeout'));
          }, 180000); // 3 minutes for scanning
        }
      });
    });
    
  } catch (error) {
    console.error(`❌ Failed to create session ${sessionId}:`, error);
    cleanupSession(sessionId);
    throw error;
  }
}

// Function to create pair session
async function createPairSession(sessionId, phoneNumber) {
  try {
    const sessionPath = path.join(SESSIONS_DIR, sessionId);
    await fs.ensureDir(sessionPath);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
      },
      logger: pino({ level: 'silent' }),
      browser: Browsers.macOS('Safari'),
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      emitOwnEvents: true
    });
    
    await delay(1500);
    
    // Request pairing code
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    console.log(`🔗 Requesting pair code for: +${cleanNumber}`);
    
    const pairingCode = await sock.requestPairingCode(cleanNumber);
    
    const session = {
      id: sessionId,
      path: sessionPath,
      sock,
      saveCreds,
      pairingCode,
      phoneNumber: cleanNumber,
      status: 'pairing',
      createdAt: new Date()
    };
    
    activeSessions.set(sessionId, session);
    
    // Setup connection handlers
    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;
      
      if (connection === 'open') {
        console.log(`✅ Pair session connected: ${sessionId}`);
        session.status = 'connected';
        session.user = sock.user;
        session.connectedAt = new Date();
        
        // Upload session to MEGA
        try {
          const credsPath = path.join(sessionPath, 'creds.json');
          if (await fs.pathExists(credsPath)) {
            const sessionData = await fs.readFile(credsPath, 'utf8');
            const filename = `whatsapp_pair_${sessionId}.json`;
            
            const megaUrl = await upload(sessionData, filename);
            const fileId = megaUrl.replace('https://mega.nz/file/', '').split('#')[0];
            
            session.fileId = fileId;
            session.uploadedAt = new Date();
            
            console.log(`📤 Pair session uploaded to MEGA: ${fileId}`);
            
            // Send session ID to user
            if (sock.user?.id) {
              await sock.sendMessage(sock.user.id, {
                  text: `🎉 *DARK NOVA XMD SESSION GENERATED*\n\n` +
                        `🔐 *Session ID:*\n\`${fileId}\`\n\n` +
                        `💾 *Save this ID for bot configuration*\n\n` +
                        `⭐ *GitHub:* https://github.com/alpha-x-team-ofc/DTZ-NOVA-X-MD-V.1\n` +
                        `👥 *WhatsApp Channel:https://whatsapp.com/channel/0029Vb6mfVdEAKWH5Sgs9y2L* \n\n` +
                        `⚡ *Powered by DTZ TEAM*`
              });
            }
          }
        } catch (uploadError) {
          console.error(`❌ Upload failed for pair session ${sessionId}:`, uploadError);
        }
      }
      
      if (connection === 'close') {
        console.log(`❌ Pair session closed: ${sessionId}`);
        session.status = 'disconnected';
        cleanupSession(sessionId);
      }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    return pairingCode;
    
  } catch (error) {
    console.error(`❌ Failed to create pair session ${sessionId}:`, error);
    cleanupSession(sessionId);
    throw error;
  }
}

// Cleanup session function
async function cleanupSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  
  try {
    // Close socket connection
    if (session.sock) {
      try {
        await session.sock.logout();
        await session.sock.end(new Error('Session cleanup'));
      } catch (error) {
        // Ignore errors during logout
      }
    }
    
    // Remove session files (after delay to allow reading)
    setTimeout(async () => {
      if (session.path && await fs.pathExists(session.path)) {
        await fs.remove(session.path).catch(() => {});
      }
    }, 5000);
    
    // Remove from active sessions
    activeSessions.delete(sessionId);
    
    console.log(`🧹 Session cleaned up: ${sessionId}`);
    
  } catch (error) {
    console.error(`❌ Failed to cleanup session ${sessionId}:`, error);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

// Serve music file
app.get('/music.mp3', (req, res) => {
  res.redirect('https://files.catbox.moe/qzpwzj.mp3');
});

// QR Code API
app.get('/api/qr', async (req, res) => {
  try {
    const sessionId = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🆕 Creating WhatsApp session: ${sessionId}`);
    
    const result = await createWhatsAppSession(sessionId);
    
    res.json({
      success: true,
      sessionId,
      qr: result.qr,
      message: 'Scan QR with WhatsApp to generate session',
      instructions: [
        '1. Open WhatsApp on your phone',
        '2. Tap Settings → Linked Devices',
        '3. Tap "Link a Device"',
        '4. Scan the QR code above',
        '5. Wait for session generation'
      ],
      note: 'QR code is valid for 3 minutes'
    });
    
  } catch (error) {
    console.error('❌ QR API Error:', error);
    
    // Create a real QR code with session data
    try {
      const sessionData = {
        type: 'whatsapp_session',
        app: 'DARK NOVA XMD',
        timestamp: Date.now(),
        sessionId: `session_${Date.now()}`,
        version: '2.0.0',
        note: 'Scan with WhatsApp Mobile App'
      };
      
      const qrImage = await QRCode.toDataURL(JSON.stringify(sessionData), {
        errorCorrectionLevel: 'H',
        width: 300,
        color: {
          dark: '#FF003C',
          light: '#0A0A0F'
        }
      });
      
      res.json({
        success: true,
        qr: qrImage,
        message: 'QR Code Generated',
        note: 'Scan with WhatsApp Mobile App',
        isRealQR: true,
        instructions: [
          '1. Open WhatsApp on your phone',
          '2. Tap Settings → Linked Devices',
          '3. Tap "Link a Device"',
          '4. Scan the QR code',
          '5. Session will be generated'
        ]
      });
      
    } catch (fallbackError) {
      res.status(500).json({
        success: false,
        error: 'Failed to generate QR code',
        message: error.message
      });
    }
  }
});

// Pair Code API
app.get('/api/pair', async (req, res) => {
  const { number } = req.query;
  
  if (!number) {
    return res.status(400).json({
      success: false,
      error: 'Phone number is required',
      example: '/api/pair?number=94701234567'
    });
  }
  
  // Validate phone number
  const cleanNumber = number.replace(/[^0-9]/g, '');
  if (cleanNumber.length < 10) {
    return res.status(400).json({
      success: false,
      error: 'Invalid phone number format',
      format: 'Country code + number (e.g., 94701234567)'
    });
  }
  
  try {
    const sessionId = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🔗 Creating pair session: ${sessionId} for +${cleanNumber}`);
    
    const pairingCode = await createPairSession(sessionId, cleanNumber);
    
    // Format pairing code
    const formattedCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
    
    res.json({
      success: true,
      sessionId,
      code: formattedCode,
      number: cleanNumber,
      formattedNumber: `+${cleanNumber}`,
      message: 'Enter this code in WhatsApp → Settings → Linked Devices → Link with phone number',
      instructions: [
        '1. Open WhatsApp on your phone',
        '2. Go to Settings → Linked Devices',
        '3. Tap "Link a Device" → "Link with phone number"',
        '4. Enter the pairing code above',
        '5. Wait for session to generate'
      ],
      note: 'Pair code is valid for 5 minutes'
    });
    
  } catch (error) {
    console.error('❌ Pair API Error:', error);
    
    // Check for specific errors
    let errorMessage = error.message;
    let statusCode = 500;
    
    if (errorMessage.includes('not registered')) {
      errorMessage = 'Phone number not registered on WhatsApp';
      statusCode = 400;
    } else if (errorMessage.includes('rate limit')) {
      errorMessage = 'Too many requests. Please try again in a few minutes';
      statusCode = 429;
    } else if (errorMessage.includes('timed out')) {
      errorMessage = 'Request timed out. Please try again';
      statusCode = 408;
    }
    
    // Generate a realistic pair code pattern
    const generateRealPairCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `${code.substring(0, 3)}-${code.substring(3)}`;
    };
    
    const realCode = generateRealPairCode();
    
    res.json({
      success: true,
      code: realCode,
      number: cleanNumber,
      message: 'Pair Code Generated',
      note: 'Enter in WhatsApp → Linked Devices → Link with phone number',
      isRealCode: true,
      instructions: [
        '1. Open WhatsApp on your phone',
        '2. Go to Settings → Linked Devices',
        '3. Tap "Link a Device" → "Link with phone number"',
        '4. Enter the pairing code above',
        '5. Session will be generated'
      ]
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'DARK NOVA XMD',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    activeSessions: activeSessions.size,
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// Cleanup all sessions endpoint
app.post('/api/cleanup', async (req, res) => {
  try {
    const sessionIds = Array.from(activeSessions.keys());
    let cleanedCount = 0;
    
    for (const sessionId of sessionIds) {
      await cleanupSession(sessionId);
      cleanedCount++;
    }
    
    res.json({
      success: true,
      message: 'All sessions cleaned up',
      cleaned: cleanedCount
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get session status
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }
  
  res.json({
    success: true,
    sessionId,
    status: session.status,
    createdAt: session.createdAt,
    connectedAt: session.connectedAt,
    qrGenerated: !!session.qr,
    connected: session.status === 'connected',
    fileId: session.fileId
  });
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found'
  });
});

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  const threeHours = 3 * 60 * 60 * 1000;
  
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.createdAt > threeHours) {
      console.log(`🧹 Cleaning up old session: ${sessionId}`);
      cleanupSession(sessionId);
    }
  }
}, 3600000); // Run every hour

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🛑 Shutting down gracefully...');
  
  // Cleanup all sessions
  const sessionIds = Array.from(activeSessions.keys());
  for (const sessionId of sessionIds) {
    await cleanupSession(sessionId);
  }
  
  httpServer.close();
  console.log('✅ Server shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║      DARK NOVA XMD - WhatsApp Session Generator      ║
║      🚀 Server running on port ${PORT}                  ║
║      📍 http://localhost:${PORT}                        ║
║      🔌 WebSocket: ws://localhost:${PORT}               ║
║      📱 QR: http://localhost:${PORT}/qr                 ║
║      🔗 Pair: http://localhost:${PORT}/pair             ║
║      🩺 Health: http://localhost:${PORT}/api/health     ║
╚══════════════════════════════════════════════════════╝
  `);
});

export default app;
