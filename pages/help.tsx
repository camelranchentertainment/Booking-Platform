// pages/help.tsx
// Help Center — AI-powered platform assistant for Camel Ranch Booking.
// Accessible from any authenticated view via the "Help" nav link.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Suggested starter questions shown before first message
const SUGGESTED_QUESTIONS = [
  'How do I add a new venue?',
  'How do I set up email so I can send outreach?',
  'How do I invite a band member?',
  'How does the campaign system work?',
  'How do I connect Google Calendar?',
  'How do I create a booking?',
  'What can band members see vs. band admins?',
  'How do I track show income and expenses?',
];

export default function HelpPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [authError, setAuthError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? '' });
        setSessionToken(session.access_token);
        return;
      }
      // Fallback: localStorage for users who haven't fully migrated to Supabase sessions
      const stored = localStorage.getItem('loggedInUser');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setUser({ id: parsed.id, email: parsed.email });
          setAuthError(true); // Will show re-login nudge
          return;
        } catch {
          // malformed
        }
      }
      router.replace('/login');
    }
    checkAuth();
  }, [router]);

  // ── Scroll to bottom on new message ──────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || isLoading) return;
      if (!sessionToken) {
        setAuthError(true);
        return;
      }

      setInput('');
      setIsLoading(true);
      setStreamingContent('');

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);

      // Build conversation history for the API (user + assistant turns only)
      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const response = await fetch('/api/help/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ messages: history }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error ?? `HTTP ${response.status}`);
        }

        if (!response.body) throw new Error('No response body');

        // Read the SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let cancelled = false;

        abortRef.current = () => {
          cancelled = true;
          reader.cancel();
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;

            try {
              const parsed = JSON.parse(json);
              if (parsed.token) {
                accumulated += parsed.token;
                setStreamingContent(accumulated);
              }
              if (parsed.done) {
                // Commit the completed assistant message
                const assistantMessage: Message = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: accumulated,
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingContent('');
                accumulated = '';
              }
              if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch {
              // Malformed SSE line — skip silently
            }
          }
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong.';
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Sorry, I ran into an error: ${message} Please try again.`,
            timestamp: new Date(),
          },
        ]);
        setStreamingContent('');
      } finally {
        setIsLoading(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [input, isLoading, messages, sessionToken]
  );

  // ── Keyboard handler ──────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingText}>Loading…</div>
      </div>
    );
  }

  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.headerLeft}>
            <a href="/band" style={styles.backLink}>← Dashboard</a>
            <span style={styles.headerDivider} />
            <span style={styles.headerTitle}>Help Center</span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.headerEmail}>{user.email}</span>
          </div>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div style={styles.main}>
        {/* ── Chat column ── */}
        <div style={styles.chatCol}>
          {/* ── Empty state / welcome ── */}
          {!hasMessages && (
            <div style={styles.welcome}>
              <div style={styles.welcomeIcon}>?</div>
              <h1 style={styles.welcomeTitle}>How can we help?</h1>
              <p style={styles.welcomeSubtitle}>
                Ask anything about Camel Ranch Booking — venues, bookings,
                email setup, campaigns, financials, or anything else.
              </p>

              {authError && (
                <div style={styles.authWarning}>
                  Your session may have expired.{' '}
                  <a href="/login" style={styles.authWarningLink}>
                    Log in again
                  </a>{' '}
                  to use the AI assistant.
                </div>
              )}

              <div style={styles.suggestionsGrid}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    style={styles.suggestionBtn}
                    onClick={() => sendMessage(q)}
                    disabled={isLoading || authError}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        '#E8602A';
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(232,96,42,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        'rgba(255,255,255,0.1)';
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(255,255,255,0.03)';
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Message list ── */}
          {hasMessages && (
            <div style={styles.messageList}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    ...styles.messageRow,
                    justifyContent:
                      msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {msg.role === 'assistant' && (
                    <div style={styles.avatarAssistant}>AI</div>
                  )}
                  <div
                    style={
                      msg.role === 'user'
                        ? styles.bubbleUser
                        : styles.bubbleAssistant
                    }
                  >
                    <MessageContent content={msg.content} />
                  </div>
                  {msg.role === 'user' && (
                    <div style={styles.avatarUser}>
                      {user.email[0].toUpperCase()}
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming / in-progress bubble */}
              {streamingContent && (
                <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
                  <div style={styles.avatarAssistant}>AI</div>
                  <div style={styles.bubbleAssistant}>
                    <MessageContent content={streamingContent} />
                    <span style={styles.cursor} />
                  </div>
                </div>
              )}

              {/* Thinking indicator (before first token arrives) */}
              {isLoading && !streamingContent && (
                <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
                  <div style={styles.avatarAssistant}>AI</div>
                  <div style={styles.bubbleAssistant}>
                    <span style={styles.thinkingDot} />
                    <span style={styles.thinkingDot} />
                    <span style={styles.thinkingDot} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* ── Input bar ── */}
          <div style={styles.inputBar}>
            {authError && (
              <div style={styles.authBanner}>
                Session expired —{' '}
                <a href="/login" style={styles.authWarningLink}>
                  log in again
                </a>{' '}
                to continue.
              </div>
            )}
            <div style={styles.inputWrapper}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about the platform…"
                disabled={isLoading || authError}
                rows={1}
                style={styles.textarea}
              />
              {isLoading ? (
                <button
                  style={styles.stopBtn}
                  onClick={() => abortRef.current?.()}
                  title="Stop generating"
                >
                  ■
                </button>
              ) : (
                <button
                  style={{
                    ...styles.sendBtn,
                    opacity: !input.trim() || authError ? 0.4 : 1,
                    cursor: !input.trim() || authError ? 'not-allowed' : 'pointer',
                  }}
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || authError}
                  title="Send (Enter)"
                >
                  ↑
                </button>
              )}
            </div>
            <p style={styles.inputHint}>
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MessageContent ─────────────────────────────────────────────────────────
// Renders assistant markdown-lite: bold (**text**), code (`text`),
// numbered lists, and bullet lists. No external markdown library needed.
function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div style={{ lineHeight: 1.65, fontSize: '0.9375rem' }}>
      {lines.map((line, i) => {
        // Numbered list
        if (/^\d+\.\s/.test(line)) {
          return (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ color: '#E8602A', fontWeight: 700, minWidth: '1.25rem' }}>
                {line.match(/^\d+/)?.[0]}.
              </span>
              <span>{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
            </div>
          );
        }
        // Bullet list
        if (/^[-*]\s/.test(line)) {
          return (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ color: '#E8602A', minWidth: '0.75rem' }}>•</span>
              <span>{renderInline(line.replace(/^[-*]\s/, ''))}</span>
            </div>
          );
        }
        // Heading (###)
        if (/^###\s/.test(line)) {
          return (
            <p key={i} style={{ fontWeight: 700, fontSize: '0.875rem', color: '#E8602A', marginBottom: '0.5rem', marginTop: '0.75rem' }}>
              {line.replace(/^###\s/, '')}
            </p>
          );
        }
        // Empty line → spacer
        if (!line.trim()) return <div key={i} style={{ height: '0.5rem' }} />;
        // Normal paragraph
        return <p key={i} style={{ margin: '0 0 0.375rem 0' }}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold** and `code` patterns
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code
          key={i}
          style={{
            background: 'rgba(232,96,42,0.15)',
            color: '#F5EDD9',
            padding: '1px 5px',
            borderRadius: '4px',
            fontSize: '0.875em',
            fontFamily: 'monospace',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0E1628',
    color: '#F5EDD9',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    display: 'flex',
    flexDirection: 'column',
  },
  loadingScreen: {
    minHeight: '100vh',
    background: '#0E1628',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#F5EDD9',
    fontSize: '1rem',
  },

  // Header
  header: {
    background: '#0E1628',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    padding: '0 2rem',
    position: 'sticky',
    top: 0,
    zIndex: 50,
    backdropFilter: 'blur(8px)',
  },
  headerInner: {
    maxWidth: '900px',
    margin: '0 auto',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  backLink: {
    color: '#6B8FB5',
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: 500,
    transition: 'color 0.15s',
  },
  headerDivider: {
    width: '1px',
    height: '18px',
    background: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    color: '#F5EDD9',
    fontWeight: 700,
    fontSize: '0.9375rem',
    letterSpacing: '0.01em',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  headerEmail: {
    color: '#6B8FB5',
    fontSize: '0.8125rem',
  },

  // Main
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 1rem',
  },
  chatCol: {
    width: '100%',
    maxWidth: '760px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
  },

  // Welcome / empty state
  welcome: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '3rem',
    paddingBottom: '1rem',
    textAlign: 'center',
  },
  welcomeIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'rgba(232,96,42,0.15)',
    border: '2px solid rgba(232,96,42,0.35)',
    color: '#E8602A',
    fontSize: '1.5rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.5rem',
  },
  welcomeTitle: {
    color: '#F5EDD9',
    fontSize: '1.75rem',
    fontWeight: 700,
    margin: '0 0 0.75rem',
  },
  welcomeSubtitle: {
    color: '#6B8FB5',
    fontSize: '0.9375rem',
    maxWidth: '480px',
    lineHeight: 1.6,
    margin: '0 0 2rem',
  },
  authWarning: {
    background: 'rgba(232,96,42,0.12)',
    border: '1px solid rgba(232,96,42,0.4)',
    borderRadius: '8px',
    padding: '0.75rem 1.25rem',
    color: '#F5EDD9',
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
  },
  authWarningLink: {
    color: '#E8602A',
    fontWeight: 600,
    textDecoration: 'underline',
    textDecorationStyle: 'dotted' as const,
    cursor: 'pointer',
  },
  suggestionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '0.625rem',
    width: '100%',
    maxWidth: '680px',
  },
  suggestionBtn: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    color: '#F5EDD9',
    fontSize: '0.8125rem',
    padding: '0.625rem 0.875rem',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    lineHeight: 1.4,
  },

  // Message list
  messageList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '1.5rem 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.625rem',
  },
  avatarAssistant: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'rgba(232,96,42,0.2)',
    border: '1px solid rgba(232,96,42,0.4)',
    color: '#E8602A',
    fontSize: '0.6875rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    letterSpacing: '0.03em',
  },
  avatarUser: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'rgba(107,143,181,0.25)',
    border: '1px solid rgba(107,143,181,0.4)',
    color: '#6B8FB5',
    fontSize: '0.75rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubbleAssistant: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px 14px 14px 4px',
    padding: '0.75rem 1rem',
    maxWidth: '85%',
    color: '#F5EDD9',
    wordBreak: 'break-word' as const,
  },
  bubbleUser: {
    background: 'rgba(232,96,42,0.15)',
    border: '1px solid rgba(232,96,42,0.25)',
    borderRadius: '14px 14px 4px 14px',
    padding: '0.75rem 1rem',
    maxWidth: '75%',
    color: '#F5EDD9',
    wordBreak: 'break-word' as const,
    fontSize: '0.9375rem',
    lineHeight: 1.55,
  },
  cursor: {
    display: 'inline-block',
    width: '2px',
    height: '1em',
    background: '#E8602A',
    marginLeft: '2px',
    verticalAlign: 'text-bottom',
    animation: 'blink 0.9s step-end infinite',
  },
  thinkingDot: {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#6B8FB5',
    margin: '0 2px',
    animation: 'bounce 1.2s ease-in-out infinite',
  },

  // Input bar
  inputBar: {
    paddingTop: '1rem',
    paddingBottom: '1.25rem',
    position: 'sticky',
    bottom: 0,
    background: '#0E1628',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  authBanner: {
    background: 'rgba(232,96,42,0.1)',
    border: '1px solid rgba(232,96,42,0.3)',
    borderRadius: '8px',
    padding: '0.5rem 0.875rem',
    color: '#F5EDD9',
    fontSize: '0.8125rem',
    marginBottom: '0.75rem',
  },
  inputWrapper: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'flex-end',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '14px',
    padding: '0.5rem 0.5rem 0.5rem 1rem',
    transition: 'border-color 0.15s',
  },
  textarea: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#F5EDD9',
    fontSize: '0.9375rem',
    lineHeight: 1.55,
    resize: 'none' as const,
    maxHeight: '160px',
    overflowY: 'auto' as const,
    fontFamily: 'inherit',
    padding: '0.25rem 0',
  },
  sendBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: '#E8602A',
    border: 'none',
    color: 'white',
    fontSize: '1.1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.15s',
    fontWeight: 700,
  },
  stopBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'rgba(232,96,42,0.2)',
    border: '1px solid rgba(232,96,42,0.4)',
    color: '#E8602A',
    fontSize: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    cursor: 'pointer',
  },
  inputHint: {
    color: 'rgba(107,143,181,0.6)',
    fontSize: '0.75rem',
    textAlign: 'center' as const,
    marginTop: '0.5rem',
    margin: '0.5rem 0 0',
  },
};
