import { Ai } from '@cloudflare/ai';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS configuration
app.use('/*', cors({
  origin: ['https://audio.antoinemoyroud.com', 'http://localhost:3001'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Mistral-Api-Key', 'Origin', 'Accept'],
  exposeHeaders: ['Content-Type', 'Access-Control-Allow-Origin'],
  maxAge: 86400,
  credentials: true
}));

// Request logging middleware
app.use('/*', async (c, next) => {
  console.log('Incoming request:', {
    method: c.req.method,
    url: c.req.url,
    headers: Object.fromEntries(c.req.headers.entries()),
    origin: c.req.header('Origin')
  });
  await next();
});

// Handle OPTIONS requests explicitly
app.options('/*', async (c) => {
  console.log('Handling OPTIONS request');
  return c.json({ success: true });
});

// Health check endpoint
app.get('/', (c) => c.json({ status: 'ok' }));

// Upload endpoint
app.post('/upload', async (c) => {
  try {
    console.log('Processing upload request');
    const mistralApiKey = c.req.header('X-Mistral-Api-Key');
    if (!mistralApiKey) {
      console.log('Missing Mistral API key');
      return c.json({ error: 'Mistral API key is required' }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');
    
    if (!file) {
      console.log('No file provided');
      return c.json({ error: 'No file provided' }, 400);
    }

    console.log('File received:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    // Convert the file to an ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    console.log('ArrayBuffer size:', arrayBuffer.byteLength);
    console.log('ArrayBuffer type:', typeof arrayBuffer);
    
    // Initialize the AI model
    const ai = new Ai(c.env.AI);
    console.log('AI model initialized');

    // Transcribe the audio using Whisper
    console.log('Starting transcription');
    
    // Convert ArrayBuffer to array of integers (0-255)
    const audioData = Array.from(new Uint8Array(arrayBuffer));
    console.log('Audio data length:', audioData.length);
    console.log('Audio data sample:', audioData.slice(0, 10));

    const whisperInput = {
      audio: audioData
    };
    console.log('Whisper input structure:', JSON.stringify({
      ...whisperInput,
      audio: {
        length: audioData.length,
        sample: audioData.slice(0, 10)
      }
    }, null, 2));

    let transcription;
    try {
      transcription = await ai.run('@cf/openai/whisper', whisperInput);
      console.log('Transcription successful:', transcription);
    } catch (whisperError) {
      console.error('Whisper API error:', whisperError);
      console.error('Whisper error details:', {
        name: whisperError.name,
        message: whisperError.message,
        stack: whisperError.stack
      });
      return c.json({ error: `Whisper API error: ${whisperError.message}` }, 500);
    }

    // Generate summary using Mistral
    console.log('Starting summary generation');
    let summary;
    try {
      summary = await ai.run('@cf/mistral/mistral-7b-instruct-v0.1', {
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes audio transcriptions. Keep the summary concise and focused on the main points.'
          },
          {
            role: 'user',
            content: `Please summarize this transcription: ${transcription.text}`
          }
        ],
        stream: false,
        max_tokens: 500,
        temperature: 0.7,
        top_p: 0.95
      });
      console.log('Summary generation successful');
    } catch (mistralError) {
      console.error('Mistral API error:', mistralError);
      // Return just the transcription if Mistral fails
      return c.json({ 
        transcription: transcription.text,
        error: `Mistral API error: ${mistralError.message}` 
      }, 200); // Changed to 200 since we still have a valid transcription
    }

    console.log('Processing complete');
    // Return the results
    return c.json({
      transcription: transcription.text,
      summary: summary.response,
      stats: {
        processing_time: 0,
        audio_duration: 0
      }
    });

  } catch (error) {
    console.error('Error processing audio:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app; 