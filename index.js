import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Import routes dynamically
let qrRouter, pairRouter;

// Lazy load routes to handle ES modules properly
const loadRoutes = async () => {
  try {
    qrRouter = (await import('./api/qr.js')).default;
    pairRouter = (await import('./api/pair.js')).default;
  } catch (error) {
    console.error('Error loading routes:', error);
  }
};

loadRoutes();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

app.get('/qr', async (req, res) => {
  try {
    if (!qrRouter) await loadRoutes();
    return qrRouter(req, res);
  } catch (error) {
    console.error('QR route error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.get('/code', async (req, res) => {
  try {
    if (!pairRouter) await loadRoutes();
    return pairRouter(req, res);
  } catch (error) {
    console.error('Pair route error:', error);
    res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

app.get('/qrpage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

app.get('/pairpage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   DARK NOVA XMD SESSION GENERATOR     ║
║   🚀 Server running on port ${PORT}     ║
║   📱 QR: http://localhost:${PORT}/qrpage  ║
║   🔗 Pair: http://localhost:${PORT}/pairpage ║
╚═══════════════════════════════════════╝
  `);
});

export default app;
