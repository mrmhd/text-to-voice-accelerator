import { NextResponse } from 'next/server';

const API_KEY = process.env.SPARK_LUCID_API_KEY || 'sl_live_PQVNG98obY0Qlc7Gwui9LMObgpeQ7P1I';

export async function POST(request) {
  try {
    const { text, voice, language, speed } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const response = await fetch('https://speaklucid.com/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        text,
        voice: voice || 'emma',
        language: language || 'en',
        speed: speed || 1.0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    if (data.audio && data.format === 'mp3') {
      const audioBuffer = Buffer.from(data.audio, 'base64');
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length
        }
      });
    }

    if (data.audio_url) {
      const audioResponse = await fetch(data.audio_url);
      const audioBuffer = await audioResponse.arrayBuffer();
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.byteLength
        }
      });
    }

    return NextResponse.json(
      { error: 'No audio data in response', details: data },
      { status: 500 }
    );
  } catch (error) {
    console.error('TTS API proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}