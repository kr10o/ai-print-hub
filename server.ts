import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '10mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Parse orders using Gemini 3.5 Flash
app.post('/api/parse-orders', async (req, res) => {
  try {
    const { csvData } = req.body;
    if (!csvData) {
      return res.status(400).json({ error: 'Missing CSV data' });
    }

    const systemInstruction = `
You are a DTF prepress and order parsing expert.
Extract the orders from the following CSV.
Determine for each order if it is a simple "Logo palčića" / "Logo udruge" order (with NO other custom text/graphics), or a "custom" order.
Also, parse the items (apparel sizes, colors, categories: Tekstil or Promo).
Output a JSON array of parsed orders matching this structure:
[
  {
    "invoiceNumber": "string",
    "clientName": "string",
    "oib": "string",
    "total": "string",
    "invoiceDate": "string",
    "paymentDate": "string",
    "rawDescription": "string",
    "isCustom": boolean, // false if only "Logo palčića"/"Logo udruge", true otherwise
    "contactPhone": "string",
    "parsedItems": [
      {
        "category": "Tekstil" | "Promo",
        "itemName": "string",
        "quantity": number,
        "size": "string" | null,
        "color": "string" | null
      }
    ]
  }
]
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: csvData,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const parsedData = JSON.parse(response.text || '[]');
    res.json({ orders: parsedData });
  } catch (error) {
    console.error('Error parsing orders:', error);
    res.status(500).json({ error: 'Failed to parse orders' });
  }
});

async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, '..', 'client')));
    app.use(express.static(path.join(__dirname, 'client')));
    app.use(express.static(path.join(__dirname)));
    
    app.use('*', (req, res) => {
      let indexHtml = path.join(__dirname, 'index.html');
      if (!fs.existsSync(indexHtml)) {
        indexHtml = path.join(__dirname, 'client', 'index.html');
      }
      res.sendFile(indexHtml);
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
