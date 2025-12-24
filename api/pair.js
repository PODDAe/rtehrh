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
    const { number } = req.query;
    
    if (!number) {
      return res.status(400).json({ 
        error: 'Phone number is required',
        example: 'Use /code?number=94701234567'
      });
    }

    // Generate a mock pairing code for testing
    const generatePairCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      // Format as XXX-XXX
      return `${code.substring(0, 3)}-${code.substring(3)}`;
    };

    const pairCode = generatePairCode();
    
    res.status(200).json({
      success: true,
      code: pairCode,
      number: number,
      formattedNumber: `+${number}`,
      message: 'Enter this code in WhatsApp → Settings → Linked Devices',
      testMode: true,
      note: 'This is a test mode. For real pairing, configure MEGA credentials.'
    });

  } catch (error) {
    console.error('Pair code error:', error);
    res.status(500).json({ 
      error: 'Failed to generate pair code',
      details: error.message 
    });
  }
}
