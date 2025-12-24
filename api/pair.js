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
      example: '/code?number=94701234567'
    });
  }

  try {
    console.log(`📱 Processing pair request for: ${number}`);
    
    // Generate a demo pair code
    const generateDemoCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `${code.substring(0, 3)}-${code.substring(3)}`;
    };
    
    const demoCode = generateDemoCode();
    
    res.status(200).json({
      success: true,
      code: demoCode,
      number: number,
      demo: true,
      message: 'Demo Pair Code Generated',
      important: '⚠️ For real WhatsApp pairing, deploy on VPS/Dedicated server',
      instructions: [
        'Vercel cannot maintain WhatsApp WebSocket connections',
        '1. Deploy on DigitalOcean/AWS/Google Cloud',
        '2. Minimum: 1GB RAM, 25GB SSD',
        '3. Install Node.js 18+',
        '4. Set up PM2 for process management',
        '5. Configure environment variables'
      ],
      exampleDeployment: {
        digitalOcean: 'https://m.do.co/c/your-referral',
        railway: 'https://railway.app',
        aws: 'https://aws.amazon.com/ec2',
        port: 'Use port 3000 or 8080'
      }
    });

  } catch (error) {
    console.error('❌ Pair code error:', error);
    
    res.status(500).json({
      error: 'Failed to generate pair code',
      message: error.message,
      solution: 'Deploy on VPS with persistent connection support'
    });
  }
}
