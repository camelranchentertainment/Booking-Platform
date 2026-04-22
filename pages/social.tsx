import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';

type SocialStatus = 'pending' | 'approved' | 'posted' | 'dismissed';

const STATUS_TABS: { key: SocialStatus | 'all'; label: string }[] = [
  { key: 'pending',   label: 'Pending Approval' },
  { key: 'approved',  label: 'Approved' },
  { key: 'posted',    label: 'Posted' },
  { key: 'dismissed', label: 'Dismissed' },
];

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook:  'Facebook',
  both:      'Instagram + Facebook',
};

export default function SocialQueue() {
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
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Social Queue</h1>
          <div className="page-sub">AI-drafted posts pending your approval</div>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '0.6rem 1rem',
              border: 'none', background: 'none', cursor: 'pointer',
              color: view === tab.key ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: view === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
            {tab.key === 'pending' && pendingCount > 0 && view !== 'pending' && (
              <span style={{ marginLeft: '0.35rem', background: '#f87171', color: '#fff', borderRadius: '8px', padding: '0.05rem 0.4rem', fontSize: '0.62rem' }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>Loading...</div>
      ) : posts.length === 0 ? (
        <div className="card">
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textAlign: 'center', padding: '2rem 0' }}>
            {view === 'pending'
              ? 'No posts waiting for approval. Confirm a show from a tour to generate social posts.'
              : 'No posts in this category.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {posts.map(post => (
            <div key={post.id} className="card">
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                    {post.act?.act_name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {post.venue?.name} · {post.venue?.city}, {post.venue?.state}
                    {post.show_date && ` · ${new Date(post.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.08em',
                    textTransform: 'uppercase', padding: '0.2rem 0.55rem',
                    border: '1px solid var(--border)', borderRadius: '3px',
                    color: 'var(--text-muted)',
                  }}>
                    {PLATFORM_LABELS[post.platform] || post.platform}
                  </span>
                </div>
              </div>

              {/* Post content */}
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
                      {saving === post.id ? 'Saving...' : 'Save Edit'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem 1rem', fontSize: '0.88rem', lineHeight: 1.7,
                    color: 'var(--text-secondary)', marginBottom: '0.75rem',
                    whiteSpace: 'pre-wrap', cursor: post.status === 'pending' ? 'text' : 'default',
                  }}
                  onClick={() => {
                    if (post.status === 'pending') { setEditing(post.id); setDraft(post.content); }
                  }}
                  title={post.status === 'pending' ? 'Click to edit' : undefined}
                >
                  {post.content}
                </div>
              )}

              {post.status === 'pending' && editing !== post.id && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                  Click post text to edit before approving
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {post.status === 'pending' && (
                  <>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={saving === post.id || editing === post.id}
                      onClick={() => update(post.id, 'approved')}
                    >
                      {saving === post.id ? 'Approving...' : '✓ Approve'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: '#f87171' }}
                      disabled={saving === post.id}
                      onClick={() => update(post.id, 'dismissed')}
                    >
                      Dismiss
                    </button>
                  </>
                )}
                {post.status === 'approved' && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={saving === post.id}
                    onClick={() => update(post.id, 'posted')}
                  >
                    {saving === post.id ? 'Marking...' : 'Mark as Posted'}
                  </button>
                )}
                {(post.status === 'approved' || post.status === 'posted') && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => {
                      navigator.clipboard.writeText(post.content);
                    }}
                    title="Copy to clipboard"
                  >
                    Copy Text
                  </button>
                )}
                {post.status === 'dismissed' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={saving === post.id}
                    onClick={() => update(post.id, 'pending')}
                  >
                    Restore to Pending
                  </button>
                )}
              </div>

              {/* Timestamp */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Generated {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
