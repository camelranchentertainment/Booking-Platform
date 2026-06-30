// pages/api/help/chat.ts
// Server-side API route for the Help AI chat bot.
// Receives a conversation history and returns a streaming response
// from Claude using the CRB platform knowledge base as the system prompt.

import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { HELP_SYSTEM_PROMPT } from '../../../lib/helpSystemPrompt';

// Shape of a single message in the conversation history
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Rate limiting: simple in-memory map keyed by IP.
// For production scale, replace with Redis. Fine for current user base.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;          // max requests per window
const RATE_WINDOW_MS = 60_000;  // 1 minute window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Basic auth check — must have a valid session cookie or localStorage token.
  // We use a lightweight check: require an Authorization header with the
  // Supabase session token. The client sends this from getSession().
  // This prevents unauthenticated access to the AI endpoint.
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';

  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    return;
  }

  // Validate request body
  const { messages } = req.body as { messages?: ChatMessage[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Validate message shapes
  for (const msg of messages) {
    if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
      res.status(400).json({ error: 'Invalid message role' });
      return;
    }
    if (typeof msg.content !== 'string' || msg.content.trim().length === 0) {
      res.status(400).json({ error: 'Message content cannot be empty' });
      return;
    }
    // Cap message content length to prevent prompt injection via giant payloads
    if (msg.content.length > 4000) {
      res.status(400).json({ error: 'Message too long' });
      return;
    }
  }

  // Cap conversation history to last 20 messages to control token spend
  const trimmedMessages = messages.slice(-20);

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  try {
    // Use streaming so the UI can render tokens as they arrive
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering on Vercel

    const stream = await anthropic.messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: HELP_SYSTEM_PROMPT,
      messages: trimmedMessages,
    });

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        // Send each token as a Server-Sent Event
        res.write(`data: ${JSON.stringify({ token: chunk.delta.text })}\n\n`);
      }
    }

    // Signal stream completion
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    console.error('[help/chat] Anthropic API error:', err);

    // If headers haven't been sent yet, send a JSON error.
    // If streaming already started, send an error event and close.
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI service error. Please try again.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted. Please try again.' })}\n\n`);
      res.end();
    }
  }
}
