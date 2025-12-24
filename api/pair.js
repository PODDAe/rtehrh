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
  
  const { number } = req.query;
  
  if (!number) {
    return res.status(400).json({
      success: false,
      error: 'Phone number is required',
      example: '/api/pair?number=94701234567'
    });
  }
  
  // Validate phone number
  const cleanNumber = number.replace(/[^0-9]/g, '');
  if (cleanNumber.length < 10) {
    return res.status(400).json({
      success: false,
      error: 'Invalid phone number format',
      format: 'Country code + number (e.g., 94701234567)'
    });
  }
  
  try {
    // Create pair session
    const sessionId = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = await whatsappManager.createPairSession(sessionId, cleanNumber);
    
    // Format pairing code
    const formattedCode = session.pairingCode.match(/.{1,4}/g)?.join('-') || session.pairingCode;
    
    res.status(200).json({
      success: true,
      sessionId,
      code: formattedCode,
      number: cleanNumber,
      formattedNumber: `+${cleanNumber}`,
      message: 'Enter this code in WhatsApp → Settings → Linked Devices → Link with phone number',
      instructions: [
        '1. Open WhatsApp on your phone',
        '2. Go to Settings → Linked Devices',
        '3. Tap "Link a Device" → "Link with phone number"',
        '4. Enter the pairing code above',
        '5. Wait for session to generate'
      ]
    });
    
  } catch (error) {
    console.error('❌ Pair API Error:', error);
    
    // Check for specific WhatsApp errors
    let errorMessage = error.message;
    let errorCode = 500;
    
    if (errorMessage.includes('not registered')) {
      errorMessage = 'Phone number not registered on WhatsApp';
      errorCode = 400;
    } else if (errorMessage.includes('rate limit')) {
      errorMessage = 'Too many requests. Please try again in a few minutes';
      errorCode = 429;
    } else if (errorMessage.includes('timed out')) {
      errorMessage = 'Request timed out. Please try again';
      errorCode = 408;
    }
    
    res.status(errorCode).json({
      success: false,
      error: errorMessage,
      details: 'Failed to generate pair code'
    });
  }
}
