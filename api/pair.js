import pino from 'pino';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { upload, generateRandomFilename } from '../lib/mega.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUCCESS_MESSAGE = `
🔐 *DARK NOVA XMD - PAIR CODE SESSION*

✅ *Session generated via Pair Code!*

📦 *Your session is securely stored*
📱 *Ready for WhatsApp Multi-Device*

⭐ *GitHub Repository:*
https://github.com/dula9x/DARK-NOVA-XMD

👥 *WhatsApp Channel:*
https://whatsapp.com/channel/0029Vb9yA9K9sBI799oc7U2T

⚙️ *Developed by:*
Dulina Nethmira & Sheron Elijah

🚀 *Powered by WHITE ALPHA WOLF X TEAM*
`;

export default async function handler(req, res) {
  // Set headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { number } = req.query;
  
  if (!number) {
    return res.status(400).json({ 
      error: 'Phone number is required',
      example: 'Use /code?number=94701234567'
    });
  }

  // Validate number format
  const cleanNumber = number.replace(/[^0-9]/g, '');
  if (cleanNumber.length < 10) {
    return res.status(400).json({ 
      error: 'Invalid phone number format',
      format: 'Country code + number (e.g., 94701234567)'
    });
  }

  const sessionId = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const sessionPath = path.join('/tmp', sessionId);
  
  let sock = null;
  let cleanupTimer = null;

  // Cleanup function
  const cleanup = async () => {
    try {
      if (cleanupTimer) clearTimeout(cleanupTimer);
      
      if (sock) {
        try {
          await sock.logout();
          await sock.end(new Error('Session cleanup'));
        } catch (e) {
          // Ignore logout errors
        }
      }
      
      if (await fs.pathExists(sessionPath)) {
        await fs.remove(sessionPath);
        console.log(`🧹 Cleaned up pair session: ${sessionId}`);
      }
    } catch (error) {
      console.error('Pair cleanup error:', error.message);
    }
  };

  // Set cleanup timeout
  cleanupTimer = setTimeout(async () => {
    if (!res.headersSent) {
      await cleanup();
      res.status(408).json({ error: 'Pairing timeout' });
    }
  }, 180000); // 3 minutes timeout

  try {
    // Create session directory
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
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000
    });

    // Request pairing code
    if (!sock.authState.creds.registered) {
      await delay(1500);
      
      try {
        const pairingCode = await sock.requestPairingCode(cleanNumber);
        
        // Format pairing code for display
        const formattedCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
        
        // Send pairing code to client
        res.status(200).json({
          success: true,
          code: formattedCode,
          number: cleanNumber,
          formattedNumber: `+${cleanNumber.substring(0, 2)} ${cleanNumber.substring(2)}`,
          message: 'Enter this code in WhatsApp → Settings → Linked Devices → Link with phone number',
          sessionId
        });
        
      } catch (pairError) {
        console.error('Pair code error:', pairError);
        await cleanup();
        
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Failed to generate pairing code',
            details: pairError.message,
            testMode: !process.env.MEGA_EMAIL || !process.env.MEGA_PASSWORD
          });
        }
        return;
      }
    }

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;

      if (connection === 'open') {
        console.log(`✅ WhatsApp paired for number: ${cleanNumber}`);
        
        try {
          // Wait for session to stabilize
          await delay(3000);
          
          // Read session credentials
          const credsPath = path.join(sessionPath, 'creds.json');
          if (await fs.pathExists(credsPath)) {
            const sessionData = await fs.readFile(credsPath, 'utf8');
            
            // Upload to MEGA
            const filename = generateRandomFilename('whatsapp_pair', 'json');
            const megaUrl = await upload(sessionData, filename);
            
            // Extract file ID
            const fileId = megaUrl.replace('https://mega.nz/file/', '').split('#')[0];
            
            console.log(`📤 Pair session uploaded: ${fileId}`);
            
            // Send session info to user
            const userJid = jidNormalizedUser(`${cleanNumber}@s.whatsapp.net`);
            
            await sock.sendMessage(userJid, {
              text: `🔐 *PAIR CODE SESSION ID*\n\n\`${fileId}\`\n\n${SUCCESS_MESSAGE}`
            });
            
            // Send confirmation
            await sock.sendMessage(userJid, {
              text: '✅ Your session has been created successfully! Use the Session ID above in your bot configuration.'
            });
          }
          
        } catch (uploadError) {
          console.error('Pair upload error:', uploadError);
          
          // Fallback: Send session data directly
          try {
            const credsPath = path.join(sessionPath, 'creds.json');
            if (await fs.pathExists(credsPath)) {
              const sessionData = await fs.readFile(credsPath, 'utf8');
              const sessionObj = JSON.parse(sessionData);
              
              const userJid = jidNormalizedUser(`${cleanNumber}@s.whatsapp.net`);
              
              await sock.sendMessage(userJid, {
                text: `⚠️ *DIRECT SESSION DATA*\n\n\`\`\`json\n${JSON.stringify({
                  me: sessionObj.me,
                  noiseKey: sessionObj.noiseKey?.public,
                  registered: sessionObj.registered
                }, null, 2)}\n\`\`\`\n\n${SUCCESS_MESSAGE}`
              });
            }
          } catch (fallbackError) {
            console.error('Pair fallback error:', fallbackError);
          }
        } finally {
          // Cleanup after 15 seconds
          setTimeout(async () => {
            await cleanup();
          }, 15000);
        }
      }

      if (connection === 'close') {
        console.log(`❌ Pair connection closed: ${cleanNumber}`);
        await cleanup();
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (error) {
    console.error('Pair session error:', error);
    
    await cleanup();
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to create pair session',
        details: error.message,
        testMode: !process.env.MEGA_EMAIL || !process.env.MEGA_PASSWORD
      });
    }
  }
}
