import QRCode from 'qrcode';
import WhatsAppManager from '../lib/whatsapp.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const whatsappManager = new WhatsAppManager(SESSIONS_DIR);

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }
  
  try {
    // Create new session
    const sessionId = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = await whatsappManager.createSession(sessionId);
    
    // Wait for QR code (max 30 seconds)
    let qrCode = null;
    const startTime = Date.now();
    const timeout = 30000; // 30 seconds
    
    while (!qrCode && Date.now() - startTime < timeout) {
      const currentSession = whatsappManager.getSession(sessionId);
      if (currentSession && currentSession.qr) {
        qrCode = currentSession.qr;
        break;
      }
      
      // Wait 500ms before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!qrCode) {
      await whatsappManager.removeSession(sessionId);
      return res.status(408).json({
        success: false,
        error: 'QR code generation timeout'
      });
    }
    
    // Generate QR code image
    const qrImage = await QRCode.toDataURL(qrCode, {
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
      sessionId,
      qr: qrImage,
      message: 'Scan QR code with WhatsApp to generate session',
      instructions: [
        '1. Open WhatsApp on your phone',
        '2. Tap Settings → Linked Devices',
        '3. Tap "Link a Device"',
        '4. Scan the QR code above',
        '5. Wait for session to generate'
      ]
    });
    
  } catch (error) {
    console.error('❌ QR API Error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Failed to generate QR code'
    });
  }
}
