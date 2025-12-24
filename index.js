import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Import API routes
import qrRouter from './api/qr.js';
import pairRouter from './api/pair.js';

// API Routes
app.use('/qr', qrRouter);
app.use('/code', pairRouter);

// HTML Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

app.get('/qrpage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

app.get('/pairpage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'DARK NOVA XMD Session Generator',
    timestamp: new Date().toISOString(),
    endpoints: ['/', '/qrpage', '/pairpage', '/qr', '/code', '/health']
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'main.html'));
});

// Start server (for local testing)
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║    DARK NOVA XMD Session Generator              ║
║    🚀 Server running on port ${PORT}                ║
║    🌐 Home: http://localhost:${PORT}                ║
║    📱 QR Code: http://localhost:${PORT}/qrpage     ║
║    🔗 Pair Code: http://localhost:${PORT}/pairpage ║
║    🩺 Health: http://localhost:${PORT}/health      ║
╚══════════════════════════════════════════════════╝
    `);
  });
}

// Export for Vercel
export default app;
