import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { upload } from '../lib/mega.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MESSAGE = `
⚡ *DARK NOVA XMD - PAIR CODE SESSION* ⚡

✅ *Session Generated Successfully!*

🔑 *Your session has been created via Pair Code*

📁 *Session uploaded to secure storage*

💡 *How to use:*
1. Copy the session ID below
2. Configure in your bot settings
3. Start using powerful features!

🌟 *Project Repository:*
https://github.com/dula9x/DARK-NOVA-XMD

👥 *Join WhatsApp Channel:*
https://whatsapp.com/channel/0029Vb9yA9K9sBI799oc7U2T

⚙️ *Developers:*
Dulina Nethmira & Sheron Elijah

🚀 *Powered by WHITE ALPHA WOLF X TEAM*
`;

async function cleanupSession(sessionPath) {
  try {
    if (await fs.pathExists(sessionPath)) {
      await fs.remove(sessionPath);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

function formatPhoneNumber(number) {
  const cleaned = number.replace(/[^0-9]/g, '');
  if (cleaned.length < 11) return null;
  
  // Format: +XXX XXX XXXXXX
  const countryCode = cleaned.substring(0, 3);
  const rest = cleaned.substring(3);
  
  if (rest.length >= 9) {
    return `+${countryCode} ${rest.substring(0, 3)} ${rest.substring(3, 6)} ${rest.substring(6)}`;
  }
  
  return `+${cleaned}`;
}

router.get('/', async (req, res) => {
  let { number } = req.query;
  
  if (!number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Clean and validate number
  const cleanedNumber = number.replace(/[^0-9]/g, '');
  
  if (cleanedNumber.length < 11) {
    return res.status(400).json({ error: 'Invalid phone number format. Include country code.' });
  }

  const sessionId = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const sessionPath = path.join(__dirname, '..', 'temp_sessions', sessionId);

  try {
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
      printQRInTerminal: false,
      markOnlineOnConnect: false
    });

    if (!sock.authState.creds.registered) {
      await delay(1000);
      
      try {
        const pairingCode = await sock.requestPairingCode(cleanedNumber);
        
        if (!pairingCode) {
          throw new Error('Failed to generate pairing code');
        }

        // Format pairing code for display
        const formattedCode = pairingCode.match(/.{1,4}/g)?.join(' ') || pairingCode;
        
        res.json({
          success: true,
          code: formattedCode,
          formattedNumber: formatPhoneNumber(cleanedNumber) || `+${cleanedNumber}`,
          message: 'Enter this code on your phone in WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number'
        });

      } catch (pairError) {
        console.error('Pair code error:', pairError);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to generate pairing code. Please try again.' });
        }
        return cleanupSession(sessionPath);
      }
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;

      if (connection === 'open') {
        console.log('Paired successfully!');
        
        try {
          // Upload session to MEGA
          const credsPath = path.join(sessionPath, 'creds.json');
          if (await fs.pathExists(credsPath)) {
            const sessionData = await fs.readFile(credsPath, 'utf8');
            const megaUrl = await upload(sessionData, `${sessionId}.json`);
            
            const sessionCode = megaUrl.replace('https://mega.nz/file/', '');
            
            // Send session to user
            const userJid = jidNormalizedUser(`${cleanedNumber}@s.whatsapp.net`);
            await sock.sendMessage(userJid, {
              text: `🔐 *PAIR CODE SESSION CREATED!*\n\n📦 *Session ID:*\n\`${sessionCode}\`\n\n${MESSAGE}`
            });
          }
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
        } finally {
          // Cleanup after 5 seconds
          setTimeout(() => cleanupSession(sessionPath), 5000);
        }
      }

      if (connection === 'close') {
        cleanupSession(sessionPath);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Timeout after 3 minutes
    setTimeout(() => {
      cleanupSession(sessionPath);
    }, 180000);

  } catch (error) {
    console.error('Pair session error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create pairing session' });
    }
    cleanupSession(sessionPath);
  }
});

export default router;
