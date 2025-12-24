import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  fetchLatestBaileysVersion,
  delay
} from '@whiskeysockets/baileys';
import { upload, generateRandomFilename } from '../lib/mega.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// WhatsApp connection message
const SUCCESS_MESSAGE = `
🎉 *DARK NOVA XMD SESSION GENERATED* 🎉

✅ *Session created successfully!*

🔐 *Your session is securely stored*
📱 *You can now use WhatsApp Web*

⭐ *Support the Project:*
https://github.com/dula9x/DARK-NOVA-XMD

📢 *Join WhatsApp Channel:*
https://whatsapp.com/channel/0029Vb9yA9K9sBI799oc7U2T

👨‍💻 *Developers:*
Dulina Nethmira & Sheron Elijah

🔮 *Powered by WHITE ALPHA WOLF X TEAM*
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

  const sessionId = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const sessionPath = path.join('/tmp', sessionId); // Use /tmp for Vercel
  
  let sock = null;
  let qrSent = false;
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
        console.log(`🧹 Cleaned up session: ${sessionId}`);
      }
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }
  };

  // Set cleanup timeout
  cleanupTimer = setTimeout(async () => {
    if (!qrSent && !res.headersSent) {
      await cleanup();
      if (!res.headersSent) {
        res.status(408).json({ error: 'QR generation timeout' });
      }
    }
  }, 120000); // 2 minutes timeout

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
      keepAliveIntervalMs: 30000,
      defaultQueryTimeoutMs: 60000,
      emitOwnEvents: true
    });

    // Handle QR Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr && !qrSent) {
        try {
          qrSent = true;
          
          // Generate QR code
          const qrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300,
            color: {
              dark: '#FF003C',
              light: '#0A0A0F'
            }
          });

          // Send QR code to client
          if (!res.headersSent) {
            res.status(200).json({
              success: true,
              qr: qrDataUrl,
              sessionId,
              message: 'Scan QR with WhatsApp',
              instructions: [
                '1. Open WhatsApp on your phone',
                '2. Tap Settings → Linked Devices',
                '3. Tap "Link a Device"',
                '4. Scan the QR code above',
                '5. Wait for session generation'
              ]
            });
          }

        } catch (error) {
          console.error('QR generation error:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate QR code' });
          }
          await cleanup();
        }
      }

      if (connection === 'open') {
        console.log(`✅ WhatsApp connected for session: ${sessionId}`);
        
        try {
          // Wait a moment for everything to stabilize
          await delay(2000);
          
          // Read session credentials
          const credsPath = path.join(sessionPath, 'creds.json');
          if (await fs.pathExists(credsPath)) {
            const sessionData = await fs.readFile(credsPath, 'utf8');
            
            // Upload to MEGA
            const filename = generateRandomFilename('whatsapp_session', 'json');
            const megaUrl = await upload(sessionData, filename);
            
            // Extract file ID
            const fileId = megaUrl.replace('https://mega.nz/file/', '').split('#')[0];
            
            console.log(`📤 Session uploaded: ${fileId}`);
            
            // Send session info to user
            if (sock.user?.id) {
              await sock.sendMessage(sock.user.id, {
                text: `🔐 *YOUR SESSION ID*\n\n\`${fileId}\`\n\n${SUCCESS_MESSAGE}`
              });
              
              // Send a confirmation image/message
              await sock.sendMessage(sock.user.id, {
                image: {
                  url: 'https://raw.githubusercontent.com/dula9x/DARK-NOVA-XMD/main/images/logo.jpg'
                },
                caption: '✅ Session successfully generated!'
              });
            }
          }
          
          // Send success response if not already sent
          if (!res.headersSent) {
            res.status(200).json({
              success: true,
              message: 'Session generated successfully! Check your WhatsApp for session ID.',
              connected: true
            });
          }
          
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
          
          // Fallback: Send session data directly
          if (sock.user?.id) {
            try {
              const credsPath = path.join(sessionPath, 'creds.json');
              if (await fs.pathExists(credsPath)) {
                const sessionData = await fs.readFile(credsPath, 'utf8');
                const sessionObj = JSON.parse(sessionData);
                
                // Send important parts of session
                await sock.sendMessage(sock.user.id, {
                  text: `⚠️ *SESSION DATA*\n\nDue to storage issues, here's your session data:\n\n\`\`\`json\n${JSON.stringify({
                    me: sessionObj.me,
                    noiseKey: sessionObj.noiseKey?.public,
                    pairingCode: sessionObj.pairingCode
                  }, null, 2)}\n\`\`\`\n\n${SUCCESS_MESSAGE}`
                });
              }
            } catch (fallbackError) {
              console.error('Fallback error:', fallbackError);
            }
          }
        } finally {
          // Cleanup after 10 seconds
          setTimeout(async () => {
            await cleanup();
          }, 10000);
        }
      }

      if (connection === 'close') {
        console.log(`❌ Connection closed for session: ${sessionId}`);
        await cleanup();
        
        if (!qrSent && !res.headersSent) {
          res.status(500).json({ 
            error: 'Connection failed',
            reconnect: true 
          });
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle errors
    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'close') {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        console.log(`Disconnect status: ${statusCode}`);
      }
    });

  } catch (error) {
    console.error('Session creation error:', error);
    
    await cleanup();
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to create session',
        details: error.message,
        testMode: !process.env.MEGA_EMAIL || !process.env.MEGA_PASSWORD
      });
    }
  }
}
