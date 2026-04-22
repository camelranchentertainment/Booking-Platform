import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';

type SocialStatus = 'pending' | 'approved' | 'posted' | 'dismissed';

const STATUS_TABS: { key: SocialStatus | 'all'; label: string }[] = [
  { key: 'pending',   label: 'Pending Approval' },
  { key: 'approved',  label: 'Approved' },
  { key: 'posted',    label: 'Posted' },
  { key: 'dismissed', label: 'Dismissed' },
];

const PLATFORM_META: Record<string, { label: string; color: string; icon: string; tip: string }> = {
  instagram: { label: 'Instagram', color: '#e1306c', icon: '📸', tip: 'Best time: weekday 9–11am or 7–9pm local · First line = hook · Saves > likes for reach' },
  facebook:  { label: 'Facebook',  color: '#1877f2', icon: '👥', tip: 'Best time: Tue–Thu 9am–3pm · Comments drive reach · Avoid "like/share this post"' },
  youtube:   { label: 'YouTube',   color: '#ff0000', icon: '▶',  tip: 'Community posts reach subscribers first · Questions drive comments = more impressions' },
  tiktok:    { label: 'TikTok',    color: '#69c9d0', icon: '♪',  tip: 'Completion rate is king · Post when your analytics show peak audience time · Niche tags > mega tags' },
  discord:   { label: 'Discord',   color: '#5865f2', icon: '◈',  tip: 'Pin the announcement · Reply to reactions quickly · Chronological — post at active hours' },
};

export default function BandSocial() {
  const [posts, setPosts]     = useState<any[]>([]);
  const [view, setView]       = useState<SocialStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState('');
  const [saving, setSaving]   = useState<string | null>(null);

  useEffect(() => { load(); }, [view]);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const url = view === 'all' ? '/api/social/queue' : `/api/social/queue?status=${view}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) setPosts(await res.json());
    setLoading(false);
  };

  const update = async (id: string, status: SocialStatus, content?: string) => {
    setSaving(id);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/social/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id, status, ...(content !== undefined ? { content } : {}) }),
    });
    if (res.ok) {
      setPosts(p => p.filter(post => post.id !== id));
      if (editing === id) setEditing(null);
    }
    setSaving(null);
  };

  const saveEdit = async (id: string) => {
    setSaving(id);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/social/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id, content: draft }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPosts(p => p.map(post => post.id === id ? { ...post, content: updated.content } : post));
      setEditing(null);
    }
    setSaving(null);
  };

  const pendingCount = posts.filter(p => p.status === 'pending').length;

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Social Posts</h1>
          <div className="page-sub">AI-drafted show announcements for your band</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.82rem', letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '0.6rem 1rem',
              border: 'none', background: 'none', cursor: 'pointer',
              color: view === tab.key ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: view === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
            {tab.key === 'pending' && pendingCount > 0 && view !== 'pending' && (
              <span style={{ marginLeft: '0.35rem', background: '#f87171', color: '#fff', borderRadius: '8px', padding: '0.05rem 0.4rem', fontSize: '0.76rem' }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading…</div>
      ) : posts.length === 0 ? (
        <div className="card">
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem', textAlign: 'center', padding: '2rem 0' }}>
            {view === 'pending'
              ? 'No posts waiting for approval. Posts are generated when a booking is confirmed.'
              : 'No posts in this category.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {posts.map(post => (
            <div key={post.id} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                    {post.act?.act_name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {post.venue?.name} · {post.venue?.city}, {post.venue?.state}
                    {post.show_date && ` · ${new Date(post.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {(() => {
                    const meta = PLATFORM_META[post.platform];
                    return meta ? (
                      <span title={meta.tip} style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.76rem', letterSpacing: '0.06em',
                        textTransform: 'uppercase', padding: '0.2rem 0.6rem',
                        border: `1px solid ${meta.color}44`, color: meta.color, cursor: 'help',
                      }}>
                        {meta.icon} {meta.label}
                      </span>
                    ) : (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', padding: '0.2rem 0.55rem', border: '1px solid var(--border)' }}>
                        {post.platform}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {editing === post.id ? (
                <div style={{ marginBottom: '0.75rem' }}>
                  <textarea
                    className="textarea"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={5}
                    style={{ fontSize: '0.88rem', lineHeight: 1.6 }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(post.id)} disabled={saving === post.id}>
                      {saving === post.id ? 'Saving…' : 'Save Edit'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'var(--bg-overlay)', padding: '0.85rem 1rem', fontSize: '0.88rem',
                    lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '0.75rem',
                    whiteSpace: 'pre-wrap', cursor: post.status === 'pending' ? 'text' : 'default',
                  }}
                  onClick={() => { if (post.status === 'pending') { setEditing(post.id); setDraft(post.content); } }}
                  title={post.status === 'pending' ? 'Click to edit' : undefined}
                >
                  {post.content}
                </div>
              )}

              {post.status === 'pending' && editing !== post.id && PLATFORM_META[post.platform] && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: PLATFORM_META[post.platform].color, opacity: 0.8, marginBottom: '0.6rem' }}>
                  ⚡ {PLATFORM_META[post.platform].tip}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {post.status === 'pending' && (
                  <>
                    <button className="btn btn-primary btn-sm" disabled={saving === post.id || editing === post.id} onClick={() => update(post.id, 'approved')}>
                      {saving === post.id ? 'Approving…' : '✓ Approve'}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#f87171' }} disabled={saving === post.id} onClick={() => update(post.id, 'dismissed')}>
                      Dismiss
                    </button>
                  </>
                )}
                {post.status === 'approved' && (
                  <button className="btn btn-primary btn-sm" disabled={saving === post.id} onClick={() => update(post.id, 'posted')}>
                    {saving === post.id ? 'Marking…' : 'Mark as Posted'}
                  </button>
                )}
                {(post.status === 'approved' || post.status === 'posted') && (
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-muted)' }} onClick={() => navigator.clipboard.writeText(post.content)}>
                    Copy Text
                  </button>
                )}
                {post.status === 'dismissed' && (
                  <button className="btn btn-ghost btn-sm" disabled={saving === post.id} onClick={() => update(post.id, 'pending')}>
                    Restore to Pending
                  </button>
                )}
              </div>

              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Generated {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
