import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
let qrRouter, pairRouter;

// Home page - serves main.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// QR page
app.get('/qrpage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

// Pair page
app.get('/pairpage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

// API Routes
app.get('/qr', async (req, res) => {
  try {
    if (!qrRouter) {
      qrRouter = (await import('./api/qr.js')).default;
    }
    return qrRouter(req, res);
  } catch (error) {
    console.error('QR route error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.get('/code', async (req, res) => {
  try {
    if (!pairRouter) {
      pairRouter = (await import('./api/pair.js')).default;
    }
    return pairRouter(req, res);
  } catch (error) {
    console.error('Pair route error:', error);
    res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server (only for local development)
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

export default app;
