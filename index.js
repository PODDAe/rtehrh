import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { rateLimit } from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Apply to all requests
app.use(limiter);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
import qrRouter from './api/qr.js';
import pairRouter from './api/pair.js';

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

app.get('/qrpage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

app.get('/pairpage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

// API Routes with error handling
app.get('/qr', async (req, res, next) => {
  try {
    await qrRouter(req, res);
  } catch (error) {
    next(error);
  }
});

app.get('/code', async (req, res, next) => {
  try {
    await pairRouter(req, res);
  } catch (error) {
    next(error);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'DARK NOVA XMD',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start server for local development only
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║      DARK NOVA XMD Session Generator                 ║
║      🚀 Server running on port ${PORT}                  ║
║      📍 Local: http://localhost:${PORT}                  ║
╚══════════════════════════════════════════════════════╝
    `);
  });
}

export default app;
