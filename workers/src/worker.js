import { Ai } from '@cloudflare/ai';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// Configure CORS
app.use('*', cors({
  origin: ['https://audio.antoinemoyroud.com', 'http://localhost:3001'],
  allowHeaders: ['X-Mistral-Api-Key', 'Content-Type'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  maxAge: 86400,
}));

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'healthy' });
});

// Upload and process endpoint
app.post('/upload', async (c) => {
  try {
    const mistralApiKey = c.req.header('X-Mistral-Api-Key');
    if (!mistralApiKey) {
      return c.json({ error: 'Mistral API key is required' }, 400);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');
    
    if (!file) {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    // Initialize AI
    const ai = new Ai(c.env.AI);

    // Process audio with Whisper
    const transcription = await ai.audio.transcribe({
      audio: file,
      model: '@cf/openai/whisper',
    });

    // Generate summary with Mistral
    const summary = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes transcribed audio content.',
          },
          {
            role: 'user',
            content: `Please provide a concise summary of this transcription: ${transcription.text}`,
          },
        ],
      }),
    }).then(res => res.json());

    return c.json({
      transcription: transcription.text,
      summary: summary.choices[0].message.content,
    });
  } catch (error) {
    console.error('Error processing request:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app; 