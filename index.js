import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'main.html'));
});

app.get('/qrpage', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'qr.html'));
});

app.get('/pairpage', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'pair.html'));
});

// API Routes
app.use('/qr', (await import('./api/qr.js')).default);
app.use('/code', (await import('./api/pair.js')).default);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server only if not in Vercel environment
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
