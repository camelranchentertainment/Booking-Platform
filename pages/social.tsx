import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';

type SocialStatus = 'pending' | 'approved' | 'posted' | 'dismissed';
type Platform = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'discord';

const PLATFORMS: { key: Platform; label: string; color: string; icon: string; autoPost: boolean; profileUrl: (creds: any) => string }[] = [
  { key: 'discord',   label: 'Discord',   color: '#5865f2', icon: '◈', autoPost: true,
    profileUrl: (c) => c?.server_id ? `https://discord.com/channels/${c.server_id}` : '' },
  { key: 'facebook',  label: 'Facebook',  color: '#1877f2', icon: '👥', autoPost: true,
    profileUrl: (c) => c?.page_handle ? `https://facebook.com/${c.page_handle}` : '' },
  { key: 'instagram', label: 'Instagram', color: '#e1306c', icon: '📸', autoPost: false,
    profileUrl: (c) => c?.handle ? `https://instagram.com/${c.handle}` : '' },
  { key: 'youtube',   label: 'YouTube',   color: '#ff0000', icon: '▶',  autoPost: false,
    profileUrl: (c) => c?.channel_id ? `https://youtube.com/channel/${c.channel_id}` : '' },
  { key: 'tiktok',    label: 'TikTok',    color: '#69c9d0', icon: '♪',  autoPost: false,
    profileUrl: (c) => c?.handle ? `https://tiktok.com/@${c.handle}` : '' },
];

const ALG_TIP: Record<Platform, string> = {
  instagram: 'Best time: weekday 9–11am or 7–9pm local · First line = hook · Saves > likes for reach',
  facebook:  'Best time: Tue–Thu 9am–3pm · Comments drive reach · Avoid "like/share this post"',
  youtube:   'Community posts reach subscribers first · Questions drive comments = more impressions',
  tiktok:    'Completion rate is king · Post at peak audience hours · Niche tags > mega tags',
  discord:   'Pin the announcement · Reply to reactions quickly · Post at active hours',
};

const STATUS_TABS: { key: SocialStatus | 'all'; label: string }[] = [
  { key: 'pending',   label: 'Pending' },
  { key: 'approved',  label: 'Approved' },
  { key: 'posted',    label: 'Posted' },
  { key: 'dismissed', label: 'Dismissed' },
];

const CREDENTIAL_FIELDS: Record<Platform, { key: string; label: string; placeholder: string; secret?: boolean }[]> = {
  discord:   [{ key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...', secret: true },
               { key: 'server_id',  label: 'Server ID (optional, for feed link)', placeholder: '1234567890' }],
  facebook:  [{ key: 'page_id',           label: 'Page ID', placeholder: '123456789012345' },
               { key: 'page_access_token', label: 'Page Access Token', placeholder: 'EAA...', secret: true },
               { key: 'page_handle',       label: 'Page Handle (for profile link)', placeholder: 'YourBandPage' }],
  instagram: [{ key: 'ig_user_id',        label: 'Instagram Business User ID', placeholder: '17841400...' },
               { key: 'page_access_token', label: 'Meta Page Access Token', placeholder: 'EAA...', secret: true },
               { key: 'handle',            label: 'Instagram Handle', placeholder: 'yourbandname' }],
  youtube:   [{ key: 'channel_id', label: 'YouTube Channel ID', placeholder: 'UCxxxxxxxxxxxxxx' },
               { key: 'handle',    label: 'YouTube Handle', placeholder: '@yourbandname' }],
  tiktok:    [{ key: 'handle', label: 'TikTok Handle', placeholder: 'yourbandname' }],
};

export default function SocialQueue() {
  const [acts, setActs]           = useState<any[]>([]);
  const [selAct, setSelAct]       = useState('');
  const [accounts, setAccounts]   = useState<Record<Platform, any>>({} as any);
  const [posts, setPosts]         = useState<any[]>([]);
  const [view, setView]           = useState<SocialStatus | 'all'>('pending');
  const [platFilter, setPlatFilter] = useState<Platform | 'all'>('all');
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving]       = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<Record<string, string>>({});
  const [showConnect, setShowConnect] = useState(false);
  const [connectPlatform, setConnectPlatform] = useState<Platform>('discord');
  const [credForm, setCredForm]   = useState<Record<string, string>>({});
  const [credSaving, setCredSaving] = useState(false);
  const [credSaved, setCredSaved]   = useState(false);
  const [copyDone, setCopyDone]     = useState<string | null>(null);

  useEffect(() => { loadActs(); }, []);
  useEffect(() => { loadPosts(); }, [view]);
  useEffect(() => { if (selAct) loadAccounts(); }, [selAct]);

  const loadActs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('acts').select('id, act_name').eq('owner_id', user.id).order('act_name');
    setActs(data || []);
    if (data?.length) setSelAct(data[0].id);
  };

  const loadAccounts = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !selAct) return;
    const res = await fetch(`/api/social/accounts?actId=${selAct}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return;
    const rows: any[] = await res.json();
    const map: Record<string, any> = {};
    for (const r of rows) map[r.platform] = r;
    setAccounts(map as any);
  };

  const loadPosts = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const url = view === 'all' ? '/api/social/queue' : `/api/social/queue?status=${view}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) setPosts(await res.json());
    setLoading(false);
  };

  const updatePost = async (id: string, status: SocialStatus, content?: string) => {
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
      body: JSON.stringify({ id, content: editDraft }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPosts(p => p.map(post => post.id === id ? { ...post, content: updated.content } : post));
      setEditing(null);
    }
    setSaving(null);
  };

  const publishPost = async (post: any) => {
    const platInfo = PLATFORMS.find(p => p.key === post.platform)!;
    if (!platInfo.autoPost) {
      navigator.clipboard.writeText(post.content);
      setCopyDone(post.id);
      setTimeout(() => setCopyDone(null), 2500);
      const profileUrl = platInfo.profileUrl(accounts[post.platform as Platform]?.credentials);
      if (profileUrl) window.open(profileUrl, '_blank');
      return;
    }
    setPublishing(post.id);
    setPublishResult(r => ({ ...r, [post.id]: '' }));
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/social/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ postId: post.id }),
    });
    const data = await res.json();
    if (res.ok) {
      setPosts(p => p.filter(x => x.id !== post.id));
    } else {
      setPublishResult(r => ({ ...r, [post.id]: data.error || 'Failed' }));
    }
    setPublishing(null);
  };

  const saveCredentials = async () => {
    if (!selAct) return;
    setCredSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const fields = CREDENTIAL_FIELDS[connectPlatform];
    const credentials: Record<string, string> = {};
    for (const f of fields) if (credForm[f.key]) credentials[f.key] = credForm[f.key];
    const handle = credForm['handle'] || credForm['page_handle'] || '';
    const res = await fetch('/api/social/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ actId: selAct, platform: connectPlatform, credentials, handle }),
    });
    setCredSaving(false);
    if (res.ok) {
      setCredSaved(true);
      setTimeout(() => setCredSaved(false), 2500);
      await loadAccounts();
    }
  };

  const disconnectPlatform = async (platform: Platform) => {
    if (!selAct) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch('/api/social/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ actId: selAct, platform }),
    });
    await loadAccounts();
  };

  const openConnectModal = (platform: Platform) => {
    setConnectPlatform(platform);
    setCredForm({});
    setCredSaved(false);
    setShowConnect(true);
  };

  const filteredPosts = platFilter === 'all'
    ? posts
    : posts.filter(p => p.platform === platFilter);

  const pendingCount = posts.filter(p => p.status === 'pending').length;

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Social Queue</h1>
          <div className="page-sub">AI-drafted posts pending your approval</div>
        </div>
        {acts.length > 1 && (
          <select className="select" style={{ width: 200 }} value={selAct} onChange={e => setSelAct(e.target.value)}>
            {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
          </select>
        )}
      </div>

      {/* Platform connection status bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {PLATFORMS.map(p => {
          const connected = !!accounts[p.key];
          return (
            <button
              key={p.key}
              onClick={() => openConnectModal(p.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.35rem 0.75rem',
                border: `1px solid ${connected ? p.color + '55' : 'var(--border)'}`,
                background: connected ? p.color + '12' : 'transparent',
                color: connected ? p.color : 'var(--text-muted)',
                fontFamily: 'var(--font-body)', fontSize: '0.78rem', letterSpacing: '0.06em',
                textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? p.color : 'var(--text-muted)', flexShrink: 0 }} />
              {p.label}
              {connected && accounts[p.key]?.handle && (
                <span style={{ opacity: 0.7, fontSize: '0.72rem' }}>· {accounts[p.key].handle}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
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

      {/* Platform filter pills */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {(['all', ...PLATFORMS.map(p => p.key)] as const).map(pf => {
          const meta = PLATFORMS.find(p => p.key === pf);
          const isActive = platFilter === pf;
          return (
            <button
              key={pf}
              onClick={() => setPlatFilter(pf)}
              style={{
                padding: '0.25rem 0.65rem', fontSize: '0.76rem', letterSpacing: '0.06em',
                fontFamily: 'var(--font-body)', textTransform: 'uppercase',
                border: `1px solid ${isActive ? (meta?.color || 'var(--accent)') : 'var(--border)'}`,
                background: isActive ? (meta?.color || 'var(--accent)') + '18' : 'transparent',
                color: isActive ? (meta?.color || 'var(--accent)') : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {pf === 'all' ? 'All Platforms' : meta!.label}
            </button>
          );
        })}
      </div>

      {/* Post cards */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading…</div>
      ) : filteredPosts.length === 0 ? (
        <div className="card">
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem', textAlign: 'center', padding: '2rem 0' }}>
            {view === 'pending'
              ? 'No posts waiting for approval. Confirm a show from a tour to generate social posts.'
              : 'No posts in this category.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredPosts.map(post => {
            const meta = PLATFORMS.find(p => p.key === post.platform);
            const isConnected = !!accounts[post.platform as Platform];
            return (
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
                  {meta && (
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.76rem', letterSpacing: '0.06em',
                      textTransform: 'uppercase', padding: '0.2rem 0.6rem', flexShrink: 0,
                      border: `1px solid ${meta.color}44`, color: meta.color,
                    }}>
                      {meta.icon} {meta.label}
                    </span>
                  )}
                </div>

                {/* Post content */}
                {editing === post.id ? (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <textarea
                      className="textarea"
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
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
                      background: 'var(--bg-overlay)', padding: '0.85rem 1rem',
                      fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--text-secondary)',
                      marginBottom: '0.75rem', whiteSpace: 'pre-wrap',
                      cursor: post.status === 'pending' ? 'text' : 'default',
                    }}
                    onClick={() => { if (post.status === 'pending') { setEditing(post.id); setEditDraft(post.content); } }}
                    title={post.status === 'pending' ? 'Click to edit' : undefined}
                  >
                    {post.content}
                  </div>
                )}

                {/* Algorithm tip */}
                {post.status === 'pending' && editing !== post.id && meta && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: meta.color, opacity: 0.8, marginBottom: '0.6rem' }}>
                    ⚡ {ALG_TIP[post.platform as Platform]}
                  </div>
                )}

                {/* Publish result */}
                {publishResult[post.id] && (
                  <div style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                    ✕ {publishResult[post.id]}
                  </div>
                )}
                {copyDone === post.id && (
                  <div style={{ color: '#34d399', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                    ✓ Copied to clipboard — opening platform…
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {post.status === 'pending' && editing !== post.id && (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={saving === post.id}
                        onClick={() => updatePost(post.id, 'approved')}
                      >
                        {saving === post.id ? 'Approving…' : '✓ Approve'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          navigator.clipboard.writeText(post.content);
                          setCopyDone(post.id);
                          setTimeout(() => setCopyDone(null), 2500);
                        }}
                      >
                        {copyDone === post.id ? '✓ Copied' : 'Copy'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#f87171' }}
                        disabled={saving === post.id}
                        onClick={() => updatePost(post.id, 'dismissed')}
                      >
                        Dismiss
                      </button>
                    </>
                  )}

                  {post.status === 'approved' && (
                    <>
                      {meta?.autoPost ? (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={publishing === post.id || !isConnected}
                          title={!isConnected ? `Connect ${meta.label} to enable auto-posting` : undefined}
                          onClick={() => publishPost(post)}
                          style={{ background: meta?.color, borderColor: meta?.color, color: '#fff' }}
                        >
                          {publishing === post.id ? 'Posting…' : `Post to ${meta?.label}`}
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => publishPost(post)}
                          style={{ background: meta?.color, borderColor: meta?.color, color: '#fff' }}
                        >
                          Copy + Open {meta?.label}
                        </button>
                      )}
                      {!isConnected && meta?.autoPost && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: meta?.color, fontSize: '0.76rem' }}
                          onClick={() => openConnectModal(post.platform as Platform)}
                        >
                          Connect {meta?.label} →
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => updatePost(post.id, 'posted')}
                        disabled={saving === post.id}
                      >
                        Mark Posted
                      </button>
                    </>
                  )}

                  {(post.status === 'approved' || post.status === 'posted') && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={() => { navigator.clipboard.writeText(post.content); }}
                    >
                      Copy Text
                    </button>
                  )}

                  {post.status === 'dismissed' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={saving === post.id}
                      onClick={() => updatePost(post.id, 'pending')}
                    >
                      Restore
                    </button>
                  )}
                </div>

                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Generated {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect platform modal */}
      {showConnect && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h3 className="modal-title">Connect Platforms</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowConnect(false)}>✕</button>
            </div>

            {/* Platform selector tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
              {PLATFORMS.map(p => {
                const connected = !!accounts[p.key];
                return (
                  <button
                    key={p.key}
                    onClick={() => { setConnectPlatform(p.key); setCredForm({}); setCredSaved(false); }}
                    style={{
                      padding: '0.45rem 0.65rem', fontSize: '0.76rem', letterSpacing: '0.04em',
                      fontFamily: 'var(--font-body)', textTransform: 'uppercase',
                      border: 'none', background: 'none', cursor: 'pointer',
                      color: connectPlatform === p.key ? p.color : 'var(--text-muted)',
                      borderBottom: connectPlatform === p.key ? `2px solid ${p.color}` : '2px solid transparent',
                      marginBottom: '-1px', position: 'relative',
                    }}
                  >
                    {p.label}
                    {connected && <span style={{ marginLeft: '0.3rem', color: '#34d399', fontSize: '0.7rem' }}>●</span>}
                  </button>
                );
              })}
            </div>

            {(() => {
              const p = PLATFORMS.find(x => x.key === connectPlatform)!;
              const connected = !!accounts[connectPlatform];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    {p.autoPost
                      ? `Auto-posting enabled for ${p.label}. Fill in the credentials below.`
                      : `${p.label} doesn't support text-only auto-posting via API. Save your handle/ID and the "Copy + Open ${p.label}" button will copy the post text and open your profile.`}
                  </div>

                  {CREDENTIAL_FIELDS[connectPlatform].map(f => (
                    <div key={f.key} className="field">
                      <label className="field-label">{f.label}</label>
                      <input
                        className="input"
                        type={f.secret ? 'password' : 'text'}
                        placeholder={f.placeholder}
                        value={credForm[f.key] || ''}
                        onChange={e => setCredForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        autoComplete="off"
                      />
                    </div>
                  ))}

                  {connected && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>
                      ● Connected{accounts[connectPlatform]?.handle ? ` · ${accounts[connectPlatform].handle}` : ''}
                      <button
                        style={{ marginLeft: '0.75rem', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}
                        onClick={() => { disconnectPlatform(connectPlatform); }}
                      >
                        Disconnect
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button className="btn btn-primary" onClick={saveCredentials} disabled={credSaving}>
                      {credSaving ? 'Saving…' : 'Save Connection'}
                    </button>
                    {credSaved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>✓ Saved</span>}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </AppShell>
  );
}
