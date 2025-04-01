import { Ai } from '@cloudflare/ai';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS configuration
app.use('/*', cors({
  origin: ['https://audio.antoinemoyroud.com', 'http://localhost:3001'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Mistral-Api-Key'],
  exposeHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// Health check endpoint
app.get('/', (c) => c.json({ status: 'ok' }));

// Upload endpoint
app.post('/upload', async (c) => {
  try {
    const mistralApiKey = c.req.header('X-Mistral-Api-Key');
    if (!mistralApiKey) {
      return c.json({ error: 'Mistral API key is required' }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Convert the file to an ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Initialize the AI model
    const ai = new Ai(c.env.AI);

    // Transcribe the audio using Whisper
    const transcription = await ai.run('@cf/openai/whisper', {
      audio: {
        data: Array.from(new Uint8Array(arrayBuffer)),
        type: file.type || 'audio/m4a'
      },
      model: 'large-v2',
      language: 'en',
      response_format: 'text'
    });

    // Generate summary using Mistral
    const summary = await ai.run('@cf/mistral/mistral-7b-instruct-v0.2', {
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes audio transcriptions. Keep the summary concise and focused on the main points.'
        },
        {
          role: 'user',
          content: `Please summarize this transcription: ${transcription}`
        }
      ],
      stream: false,
      model: 'mistral-7b-instruct-v0.2',
      max_tokens: 500,
      temperature: 0.7,
      top_p: 0.95,
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`
      }
    });

    // Return the results
    return c.json({
      transcription,
      summary: summary.response,
      stats: {
        processing_time: 0, // You might want to track this
        audio_duration: 0   // You might want to calculate this
      }
    });

  } catch (error) {
    console.error('Error processing audio:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app; 