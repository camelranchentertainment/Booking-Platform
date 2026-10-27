// pages/band/agent.tsx
//
// The booking agent in its own window. Opened from the "Pop out" button on the
// band dashboard (window name `crb-booking-agent`), so the user can drag it to
// another screen and keep chatting while they work anywhere on the site.
//
// While this window is open the dashboard shows a placeholder instead of the
// chat; closing or docking it hands the conversation back (both read the same
// saved chat). Messaging between the two: lib/agent/agentWindow.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import PopoutShell from '../../components/layout/PopoutShell';
import BookingAgentPanel from '../../components/agent/BookingAgentPanel';
import { supabase } from '../../lib/supabase';
import { getActId } from '../../lib/bookingQueries';
import { fetchAgentGreetingStats } from '../../lib/agent/agentGreeting';
import { isAgentWindowMessage, openAgentChannel, postAgentMessage, type AgentChannel } from '../../lib/agent/agentWindow';

type ActInfo = { id: string; act_name: string | null };
type Stats = { toursCount: number; targetsCount: number };

/** Loads what the agent needs, then shows it. Rendered inside PopoutShell, so the user is signed in. */
function AgentWindow() {
  const router = useRouter();
  const [act, setAct] = useState<ActInfo | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'no-band' | 'error'>('loading');
  const channelRef = useRef<AgentChannel | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return; // PopoutShell is redirecting to /login
        const actId = await getActId(supabase, user.id);
        if (!actId) { if (!cancelled) setState('no-band'); return; }
        const [actRes, profileRes] = await Promise.all([
          supabase.from('acts').select('id, act_name').eq('id', actId).eq('is_active', true).maybeSingle(),
          supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
        ]);
        if (actRes.error) throw new Error(`band lookup failed: ${actRes.error.message}`);
        if (cancelled) return;
        if (!actRes.data) { setState('no-band'); return; }
        setAct({ id: actRes.data.id, act_name: actRes.data.act_name ?? null });
        setDisplayName(profileRes.data?.display_name ?? null);
        setState('ready');
        // The greeting can wait for the counts; a failure here only means a 0/0 greeting.
        try {
          const s = await fetchAgentGreetingStats(supabase, actId);
          if (!cancelled) setStats(s);
        } catch (err) {
          console.error('[band/agent] greeting counts:', err);
          if (!cancelled) setStats({ toursCount: 0, targetsCount: 0 });
        }
      } catch (err) {
        console.error('[band/agent] load:', err);
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Tell dashboards this window holds the chat; answer their pings; obey focus/dock requests.
  useEffect(() => {
    const channel = openAgentChannel();
    channelRef.current = channel;
    if (!channel) return;
    channel.onmessage = (event: MessageEvent) => {
      const msg: unknown = event.data;
      if (!isAgentWindowMessage(msg)) return;
      if (msg.type === 'ping') postAgentMessage(channel, { type: 'popout-opened' });
      else if (msg.type === 'focus') window.focus();
      else if (msg.type === 'dock') window.close();
    };
    postAgentMessage(channel, { type: 'popout-opened' });
    const onPageHide = () => postAgentMessage(channel, { type: 'popout-closed' });
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      postAgentMessage(channel, { type: 'popout-closed' });
      channelRef.current = null;
      channel.close();
    };
  }, []);

  const onDataChanged = useCallback(() => {
    postAgentMessage(channelRef.current, { type: 'data-changed' });
  }, []);

  const onDock = useCallback(() => {
    postAgentMessage(channelRef.current, { type: 'popout-closed' });
    try { window.opener?.focus(); } catch { /* opener gone or cross-origin */ }
    window.close();
    // Browsers only let script close windows script opened. If this page was
    // opened by hand (typed URL, new tab), go to the dashboard instead.
    setTimeout(() => { if (!window.closed) void router.push('/band'); }, 150);
  }, [router]);

  const title = act?.act_name ? `Booking Agent · ${act.act_name}` : 'Booking Agent';

  return (
    <>
      <Head><title>{title}</title></Head>
      {state === 'loading' && (
        <div role="status" style={{ padding: '2rem', color: 'var(--text-muted)', fontSize: 14 }}>Opening the booking agent…</div>
      )}
      {state === 'no-band' && (
        <div role="alert" style={{ padding: '2rem', color: 'var(--text-muted)', fontSize: 14 }}>
          The booking agent needs a band profile. Set one up from the dashboard first.
        </div>
      )}
      {state === 'error' && (
        <div role="alert" style={{ padding: '2rem', color: '#f87171', fontSize: 14 }}>
          The booking agent could not load. Close this window and try Pop out again.
        </div>
      )}
      {state === 'ready' && act && (
        <BookingAgentPanel
          act={act}
          displayName={displayName}
          greetingStats={stats}
          mode="popout"
          onDataChanged={onDataChanged}
          onDock={onDock}
        />
      )}
    </>
  );
}

export default function BandAgentPopoutPage() {
  return (
    <PopoutShell requireRole="band_admin">
      <AgentWindow />
    </PopoutShell>
  );
}
