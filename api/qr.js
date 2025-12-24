import QRCode from 'qrcode';
import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  // Set headers for Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // For testing, generate a simple QR code with a test message
    const testMessage = `DARK-NOVA-XMD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Generate QR code
    const qrDataUrl = await QRCode.toDataURL(testMessage, {
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
      message: 'Scan QR with WhatsApp',
      testMode: true,
      instructions: [
        '1. Open WhatsApp on your phone',
        '2. Tap Settings → Linked Devices',
        '3. Tap "Link a Device"',
        '4. Scan the QR code above'
      ]
    });

  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate QR code',
      details: error.message 
    });
  }
}
