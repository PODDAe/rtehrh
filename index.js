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

// Import WhatsApp Manager
import WhatsAppManager from './lib/whatsapp.js';
const whatsappManager = new WhatsAppManager(SESSIONS_DIR);

// Import API routes
import qrRouter from './api/qr.js';
import pairRouter from './api/pair.js';

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

// API Routes
app.use('/api/qr', qrRouter);
app.use('/api/pair', pairRouter);

// Health check
app.get('/api/health', (req, res) => {
  const sessions = whatsappManager.getSessions();
  
  res.json({
    status: 'healthy',
    service: 'DARK NOVA XMD',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    activeSessions: sessions.length,
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    }
  });
});

// Session management endpoints
app.get('/api/sessions', (req, res) => {
  const sessions = whatsappManager.getSessions();
  res.json({ success: true, sessions });
});

app.delete('/api/session/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await whatsappManager.removeSession(id);
    res.json({ success: true, message: 'Session removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('create-qr-session', async () => {
    try {
      const sessionId = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const session = await whatsappManager.createSession(sessionId);
      
      socket.emit('session-created', { sessionId });
      socket.join(sessionId);
      
      // Send QR updates
      session.sock.ev.on('connection.update', (update) => {
        if (update.qr) {
          socket.emit('qr-update', { sessionId, qr: update.qr });
        }
        if (update.connection === 'open') {
          socket.emit('session-connected', { sessionId, user: session.sock.user });
        }
      });
      
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
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
  res.status(404).json({ success: false, error: 'Not found' });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🛑 Shutting down gracefully...');
  await whatsappManager.cleanup();
  httpServer.close();
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
