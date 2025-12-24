import QRCode from 'qrcode';
import pino from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';

// Use Vercel's /tmp directory for temporary files
import { join } from 'path';
import { mkdir, rm, readFile } from 'fs/promises';
import { createWriteStream } from 'fs';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = Date.now().toString();
  const sessionPath = join('/tmp', `session_${sessionId}`);

  try {
    await mkdir(sessionPath, { recursive: true });
    
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
      printQRInTerminal: false,
      markOnlineOnConnect: false
    });

    sock.ev.on('connection.update', async (update) => {
      const { qr } = update;
      
      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300,
            color: {
              dark: '#FF003C',
              light: '#0A0A0F'
            }
          });

          res.status(200).json({
            success: true,
            qr: qrDataUrl,
            sessionId,
            message: 'Scan QR with WhatsApp'
          });

          // Cleanup after response
          setTimeout(async () => {
            try {
              await rm(sessionPath, { recursive: true, force: true });
            } catch (e) {
              console.error('Cleanup error:', e);
            }
          }, 30000);

        } catch (error) {
          console.error('QR generation error:', error);
          res.status(500).json({ error: 'Failed to generate QR code' });
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'QR generation timeout' });
      }
    }, 30000);

  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
    
    // Cleanup on error
    try {
      await rm(sessionPath, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}
