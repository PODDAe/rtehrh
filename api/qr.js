import express from 'express';
import QRCode from 'qrcode';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { upload } from '../lib/mega.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MESSAGE = `
✨ *DARK NOVA XMD - SESSION GENERATED* ✨

✅ *Session Created Successfully!*

📱 *How to use:*
1. Save this session ID
2. Use it in your bot configuration
3. Start using DARK NOVA XMD!

⭐ *Support the Project:*
https://github.com/dula9x/DARK-NOVA-XMD

📢 *Join Our Community:*
https://whatsapp.com/channel/0029Vb9yA9K9sBI799oc7U2T

👨‍💻 *Created by:*
Mr. Dulina Nethmira & Sheron Elijah

🔮 *Powered by:*
WHITE ALPHA WOLF X TEAM
`;

async function cleanupSession(sessionPath) {
  try {
    if (await fs.pathExists(sessionPath)) {
      await fs.remove(sessionPath);
      console.log('Cleaned up session:', sessionPath);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

router.get('/', async (req, res) => {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const sessionPath = path.join(__dirname, '..', 'temp_sessions', sessionId);
  
  let sock = null;
  let qrSent = false;

  try {
    await fs.ensureDir(sessionPath);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
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

    // Handle QR Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, qr } = update;

      if (qr && !qrSent) {
        try {
          qrSent = true;
          
          // Generate QR code as data URL
          const qrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300,
            color: {
              dark: '#FF003C',
              light: '#0A0A0F'
            }
          });

          res.json({
            success: true,
            qr: qrDataUrl,
            message: 'Scan QR with WhatsApp',
            sessionId,
            instructions: [
              '1. Open WhatsApp on your phone',
              '2. Tap Settings (⋮) → Linked Devices',
              '3. Tap "Link a Device"',
              '4. Scan the QR code above',
              '5. Wait for session to generate'
            ]
          });
        } catch (error) {
          console.error('QR generation error:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate QR code' });
          }
        }
      }

      if (connection === 'open') {
        console.log('Connected successfully!');
        
        try {
          // Upload session to MEGA
          const credsPath = path.join(sessionPath, 'creds.json');
          if (await fs.pathExists(credsPath)) {
            const sessionData = await fs.readFile(credsPath, 'utf8');
            const megaUrl = await upload(sessionData, `${sessionId}.json`);
            
            const sessionCode = megaUrl.replace('https://mega.nz/file/', '');
            
            // Send session to user
            if (sock.user?.id) {
              await sock.sendMessage(sock.user.id, {
                text: `🎉 *SESSION ID GENERATED!*\n\n🔐 *Your Session Code:*\n\`${sessionCode}\`\n\n${MESSAGE}`
              });
            }
          }
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
        } finally {
          // Cleanup
          setTimeout(() => cleanupSession(sessionPath), 5000);
        }
      }

      if (connection === 'close') {
        cleanupSession(sessionPath);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Timeout after 2 minutes
    setTimeout(() => {
      if (!qrSent && !res.headersSent) {
        res.status(408).json({ error: 'QR generation timeout' });
      }
      cleanupSession(sessionPath);
    }, 120000);

  } catch (error) {
    console.error('Session creation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create session' });
    }
    cleanupSession(sessionPath);
  }
});

export default router;
