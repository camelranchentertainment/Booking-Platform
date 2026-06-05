import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';
import PlatformSetup from '../components/settings/PlatformSetup';

const TIER_LABELS: Record<string, string> = {
  band_admin: 'Band Admin — $18 / month',
  member:     'Band Member — Free',
};

const STATUS_LABELS: Record<string, string> = {
  active:   'Active',
  trialing: 'Free Trial',
  past_due: 'Past Due',
  cancelled:'Cancelled',
  inactive: 'Inactive',
};

export default function Settings() {
  const router = useRouter();
  const [profile, setProfile]       = useState<UserProfile | null>(null);
  const [form, setForm]             = useState({ display_name: '', agency_name: '', phone: '', email: '', personal_gmail: '' });
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError]         = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pwForm, setPwForm]       = useState({ newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwSaved, setPwSaved]     = useState(false);
  const [pwError, setPwError]     = useState('');

  const [portalLoading, setPortalLoading]   = useState(false);
  const [isSuperAdmin, setIsSuperAdmin]     = useState(false);
  const [icsCopied, setIcsCopied]           = useState(false);

  const [gcal, setGcal]         = useState<{ connected: boolean; sync_enabled?: boolean; selected_calendar_id?: string; calendars?: Array<{ id: string; summary: string; primary?: boolean }> } | null>(null);
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [gcalSaving, setGcalSaving]         = useState(false);

  const [myAct, setMyAct]       = useState<any>(null);
  const [actForm, setActForm]   = useState({
    act_name: '', genre: '', bio: '', website: '',
    instagram: '', facebook: '', tiktok_url: '', spotify: '', contact_email: '',
    contact_phone: '', home_city: '', home_state: '', username: '', epk_link: '',
  });
  const [actSaving, setActSaving]           = useState(false);
  const [actSaved, setActSaved]             = useState(false);
  const [actPhotoUrl, setActPhotoUrl]       = useState<string | null>(null);
  const [actPhotoUploading, setActPhotoUploading] = useState(false);
  const [actPhotoError, setActPhotoError]   = useState('');
  const actPhotoRef = useRef<HTMLInputElement>(null);

  const [logoUrl, setLogoUrl]               = useState<string | null>(null);
  const [logoUploading, setLogoUploading]   = useState(false);
  const [logoError, setLogoError]           = useState('');
  const logoRef = useRef<HTMLInputElement>(null);

  const [gcalMsg, setGcalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Team members
  const [members, setMembers]                 = useState<any[]>([]);
  const [pendingInvites, setPendingInvites]   = useState<any[]>([]);
  const [inviteEmail, setInviteEmail]         = useState('');
  const [inviteRole, setInviteRole]           = useState<'member' | 'band_admin'>('member');
  const [inviteSending, setInviteSending]     = useState(false);
  const [inviteMsg, setInviteMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revoking, setRevoking]               = useState<string | null>(null);

  // Notification preferences
  const [notifPrefs, setNotifPrefs]           = useState({ venue_reply_email: true, followup_reminder_email: true });
  const [notifSaving, setNotifSaving]         = useState(false);
  const [notifSaved, setNotifSaved]           = useState(false);

  // Follow-up automation
  const [followupRule, setFollowupRule]         = useState<any>(null);
  const [followupForm, setFollowupForm]         = useState({
    enabled: true, first_followup_days: 7, second_followup_days: 14, max_followups: 2, followup_template_id: '',
  });
  const [followupSaving, setFollowupSaving]     = useState(false);
  const [followupSaved, setFollowupSaved]       = useState(false);
  const [followupTemplates, setFollowupTemplates] = useState<any[]>([]);

  // Danger zone
  const [deleteConfirm, setDeleteConfirm]     = useState('');
  const [deleting, setDeleting]               = useState(false);
  const [deleteError, setDeleteError]         = useState('');

  useEffect(() => { load(); loadGcal(); loadTeam(); loadFollowupRule(); }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.calendar_connected) {
      setGcalMsg({ type: 'success', text: 'Google Calendar connected successfully.' });
      loadGcal();
      router.replace('/settings', undefined, { shallow: true });
    } else if (router.query.calendar_error) {
      setGcalMsg({ type: 'error', text: `Google Calendar error: ${router.query.calendar_error}` });
      router.replace('/settings', undefined, { shallow: true });
    }
  }, [router.isReady, router.query]);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (data) {
      setProfile(data);
      setAvatarUrl(data.avatar_url || null);
      setForm({ display_name: data.display_name || '', agency_name: data.agency_name || '', phone: data.phone || '', email: data.email || '', personal_gmail: (data as any).personal_gmail || '' });
      setIsSuperAdmin(data.role === 'superadmin');

      if (data.role === 'band_admin' || data.role === 'superadmin') {
        let act: any = null;
        const { data: owned } = await supabase.from('acts').select('*').eq('owner_id', user.id).eq('is_active', true).limit(1).maybeSingle();
        if (owned) {
          act = owned;
        } else if (data.act_id) {
          const { data: linked } = await supabase.from('acts').select('*').eq('id', data.act_id).maybeSingle();
          act = linked;
        }
        if (act) {
          setMyAct(act);
          setActPhotoUrl(act.profile_photo_url || null);
          setLogoUrl(act.logo_url || null);
          setActForm({
            act_name:      act.act_name      || '',
            genre:         act.genre         || '',
            bio:           act.bio           || '',
            website:       act.website       || '',
            instagram:     act.instagram     || '',
            facebook:      act.facebook      || '',
            tiktok_url:    act.tiktok_url    || '',
            spotify:       act.spotify       || '',
            contact_email: act.contact_email || '',
            contact_phone: act.contact_phone || '',
            home_city:     act.home_city     || '',
            home_state:    act.home_state    || '',
            username:      act.username      || '',
            epk_link:      act.epk_link      || '',
          });
        }
      }
    }
  };

  const loadGcal = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await fetch('/api/google/calendars', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setGcal(await res.json());
    } catch {}
  };

  const loadTeam = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prof } = await supabase.from('profiles').select('act_id, notification_preferences').eq('id', user.id).single();
    if (!prof?.act_id) return;

    const [membersRes, invitesRes] = await Promise.all([
      supabase.from('profiles').select('id, display_name, email, role').eq('act_id', prof.act_id),
      supabase.from('act_invitations').select('id, email, role, expires_at').eq('act_id', prof.act_id).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
    ]);
    setMembers(membersRes.data || []);
    setPendingInvites(invitesRes.data || []);
    if (prof.notification_preferences) {
      setNotifPrefs({
        venue_reply_email:       (prof.notification_preferences as any).venue_reply_email       ?? true,
        followup_reminder_email: (prof.notification_preferences as any).followup_reminder_email ?? true,
      });
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    setInviteMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setInviteSending(false); return; }
    const res = await fetch('/api/invites/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    const data = await res.json();
    if (res.ok) {
      setInviteMsg({ type: 'success', text: data.message });
      setInviteEmail('');
      loadTeam();
    } else {
      setInviteMsg({ type: 'error', text: data.error });
    }
    setInviteSending(false);
  };

  const revokeInvite = async (id: string) => {
    setRevoking(id);
    await supabase.from('act_invitations').update({ status: 'revoked' }).eq('id', id);
    setPendingInvites(prev => prev.filter(i => i.id !== id));
    setRevoking(null);
  };

  const loadFollowupRule = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prof } = await supabase.from('profiles').select('act_id, role').eq('id', user.id).single();
    if (!prof?.act_id || !['band_admin', 'superadmin'].includes(prof.role)) return;
    const [ruleRes, tmplRes] = await Promise.all([
      supabase.from('followup_rules').select('*').eq('act_id', prof.act_id).maybeSingle(),
      supabase.from('email_templates').select('id, category').eq('act_id', prof.act_id),
    ]);
    if (ruleRes.data) {
      setFollowupRule(ruleRes.data);
      setFollowupForm({
        enabled:             ruleRes.data.enabled,
        first_followup_days: ruleRes.data.first_followup_days,
        second_followup_days:ruleRes.data.second_followup_days,
        max_followups:       ruleRes.data.max_followups,
        followup_template_id:ruleRes.data.followup_template_id || '',
      });
    }
    setFollowupTemplates(tmplRes.data || []);
  };

  const saveFollowupRule = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prof } = await supabase.from('profiles').select('act_id').eq('id', user.id).single();
    if (!prof?.act_id) return;
    setFollowupSaving(true);
    const upsertData = {
      act_id:               prof.act_id,
      enabled:              followupForm.enabled,
      first_followup_days:  followupForm.first_followup_days,
      second_followup_days: followupForm.second_followup_days,
      max_followups:        followupForm.max_followups,
      followup_template_id: followupForm.followup_template_id || null,
      updated_at:           new Date().toISOString(),
    };
    await supabase.from('followup_rules').upsert(upsertData, { onConflict: 'act_id' });
    setFollowupSaving(false);
    setFollowupSaved(true);
    setTimeout(() => setFollowupSaved(false), 3000);
  };

  const saveNotifPrefs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setNotifSaving(true);
    await supabase.from('profiles').update({ notification_preferences: notifPrefs }).eq('id', user.id);
    setNotifSaving(false);
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 3000);
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setDeleting(false); return; }
    const res = await fetch('/api/account/delete', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      await supabase.auth.signOut();
      window.location.href = '/';
    } else {
      const data = await res.json();
      setDeleteError(data.error || 'Failed to delete account');
      setDeleting(false);
    }
  };

  const connectGoogle = async () => {
    setGcalConnecting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setGcalConnecting(false); return; }
    const res = await fetch('/api/auth/google', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const { url } = await res.json();
      window.location.href = url;
    } else {
      setGcalConnecting(false);
    }
  };

  const saveGcalSettings = async (patch: { selected_calendar_id?: string; sync_enabled?: boolean }) => {
    setGcalSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setGcalSaving(false); return; }
    await fetch('/api/google/calendars', {
      method:  'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    setGcal(prev => prev ? { ...prev, ...patch } : prev);
    setGcalSaving(false);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('Passwords do not match'); return; }
    if (pwForm.newPassword.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    setPwError('');
    setPwSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: pwForm.newPassword });
    setPwSaving(false);
    if (err) { setPwError(err.message); return; }
    setPwForm({ newPassword: '', confirmPassword: '' });
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 3000);
  };

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Image must be under 5 MB'); return; }
    setAvatarError('');
    setAvatarUploading(true);
    const ext  = file.name.split('.').pop() || 'jpg';
    const path = `${profile.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setAvatarError(upErr.message); setAvatarUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
    setAvatarUrl(url);
    setAvatarUploading(false);
  };

  const uploadActPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myAct) return;
    if (!file.type.startsWith('image/')) { setActPhotoError('Please choose an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setActPhotoError('Image must be under 5 MB'); return; }
    setActPhotoError('');
    setActPhotoUploading(true);
    const ext  = file.name.split('.').pop() || 'jpg';
    const path = `act-${myAct.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setActPhotoError(upErr.message); setActPhotoUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from('acts').update({ profile_photo_url: url }).eq('id', myAct.id);
    setActPhotoUrl(url);
    setActPhotoUploading(false);
    // Reset file input so same file can be re-uploaded
    if (actPhotoRef.current) actPhotoRef.current.value = '';
  };

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myAct) return;
    if (!file.type.startsWith('image/')) { setLogoError('Please choose an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { setLogoError('Logo must be under 10 MB'); return; }
    setLogoError('');
    setLogoUploading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLogoUploading(false); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('is_primary_logo', 'true');
    fd.append('file_type', 'logo');
    const res = await fetch('/api/media/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json();
      setLogoError(err.error || 'Upload failed');
      setLogoUploading(false);
      return;
    }
    const record = await res.json();
    setLogoUrl(record.public_url);
    setLogoUploading(false);
    if (logoRef.current) logoRef.current.value = '';
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    await supabase.from('profiles').update({
      display_name:   form.display_name,
      agency_name:    form.agency_name    || null,
      phone:          form.phone          || null,
      personal_gmail: form.personal_gmail || null,
    } as any).eq('id', profile.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const saveAct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myAct) return;
    setActSaving(true);
    await supabase.from('acts').update({
      act_name:      actForm.act_name      || null,
      genre:         actForm.genre         || null,
      bio:           actForm.bio           || null,
      website:       actForm.website       || null,
      instagram:     actForm.instagram     || null,
      facebook:      actForm.facebook      || null,
      tiktok_url:    actForm.tiktok_url    || null,
      spotify:       actForm.spotify       || null,
      contact_email: actForm.contact_email || null,
      contact_phone: actForm.contact_phone || null,
      home_city:     actForm.home_city     || null,
      home_state:    actForm.home_state    || null,
      username:      actForm.username      || null,
      epk_link:      actForm.epk_link      || null,
    }).eq('id', myAct.id);
    setActSaving(false);
    setActSaved(true);
    setTimeout(() => setActSaved(false), 3000);
  };

  const setAct = (k: keyof typeof actForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setActForm(f => ({ ...f, [k]: e.target.value }));

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const sectionLabelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'var(--text-muted)',
    marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
  };

  return (
    <AppShell requireRole={['band_admin', 'superadmin', 'member']}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">
            {isSuperAdmin ? 'Platform configuration & profile'
              : profile?.role === 'member' ? 'Account & password'
              : 'Agent profile & preferences'}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

        {/* Platform Setup — superadmin only */}
        {isSuperAdmin && <PlatformSetup />}

        {/* ── BAND PROFILE ── */}
        {myAct && profile?.role !== 'member' && (
          <div>
            <div style={sectionLabelStyle}>Band Profile</div>
            <form onSubmit={saveAct}>
              <div className="card">
                <div className="card-header"><span className="card-title">ACT DETAILS</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                  {/* Act photo upload */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                    <div
                      onClick={() => !actPhotoUploading && actPhotoRef.current?.click()}
                      style={{
                        width: 88, height: 88, flexShrink: 0,
                        background: actPhotoUrl ? 'transparent' : 'rgba(224,120,32,0.1)',
                        border: '2px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: actPhotoUploading ? 'wait' : 'pointer',
                        overflow: 'hidden', position: 'relative', transition: 'border-color 0.15s',
                      }}
                      title="Click to upload band photo"
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      {actPhotoUrl
                        ? <img src={actPhotoUrl} alt="Band photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--accent)', lineHeight: 1 }}>
                            {(actForm.act_name || '?')[0].toUpperCase()}
                          </span>
                      }
                      {actPhotoUploading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#fff', fontSize: '0.72rem', fontFamily: 'var(--font-body)' }}>Uploading…</span>
                        </div>
                      )}
                      {!actPhotoUploading && !actPhotoUrl && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(224,120,32,0.7)', padding: '2px 0', textAlign: 'center', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', color: '#000', textTransform: 'uppercase' }}>Upload</div>
                      )}
                    </div>
                    <input ref={actPhotoRef} type="file" accept="image/*" onChange={uploadActPhoto} style={{ display: 'none' }} />
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.2rem' }}>Band Photo</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Shown in your dashboard header.<br />PNG or JPG · max 5 MB · square crop recommended
                      </div>
                      {actPhotoUrl && (
                        <button type="button" onClick={() => actPhotoRef.current?.click()} className="btn btn-ghost btn-sm" style={{ marginTop: '0.35rem', fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}>
                          Replace photo
                        </button>
                      )}
                      {actPhotoError && <div style={{ color: '#f87171', fontSize: '0.75rem', fontFamily: 'var(--font-body)', marginTop: '0.25rem' }}>{actPhotoError}</div>}
                    </div>
                  </div>

                  {/* Logo upload */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                    <div
                      onClick={() => !logoUploading && logoRef.current?.click()}
                      style={{
                        width: 88, height: 88, flexShrink: 0,
                        background: logoUrl ? 'transparent' : 'rgba(224,120,32,0.1)',
                        border: '2px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: logoUploading ? 'wait' : 'pointer',
                        overflow: 'hidden', position: 'relative', transition: 'border-color 0.15s',
                      }}
                      title="Click to upload act logo"
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      {logoUrl
                        ? <img src={logoUrl} alt="Act logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                        : <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--accent)', lineHeight: 1, textAlign: 'center' }}>LOGO</span>
                      }
                      {logoUploading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#fff', fontSize: '0.72rem', fontFamily: 'var(--font-body)' }}>Uploading…</span>
                        </div>
                      )}
                      {!logoUploading && !logoUrl && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(224,120,32,0.7)', padding: '2px 0', textAlign: 'center', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', color: '#000', textTransform: 'uppercase' }}>Upload</div>
                      )}
                    </div>
                    <input ref={logoRef} type="file" accept="image/*" onChange={uploadLogo} style={{ display: 'none' }} />
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.2rem' }}>Act Logo</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Used in email templates and media kit.<br />PNG, SVG or JPG · max 10 MB · transparent background ideal
                      </div>
                      {logoUrl && (
                        <button type="button" onClick={() => logoRef.current?.click()} className="btn btn-ghost btn-sm" style={{ marginTop: '0.35rem', fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}>
                          Replace logo
                        </button>
                      )}
                      {logoError && <div style={{ color: '#f87171', fontSize: '0.75rem', fontFamily: 'var(--font-body)', marginTop: '0.25rem' }}>{logoError}</div>}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="field">
                      <label className="field-label">Act Name</label>
                      <input className="input" value={actForm.act_name} onChange={setAct('act_name')} placeholder="Your act name" />
                    </div>
                    <div className="field">
                      <label className="field-label">Genre</label>
                      <input className="input" value={actForm.genre} onChange={setAct('genre')} placeholder="e.g. Rock, Pop, Jazz, Hip-Hop" />
                    </div>
                    <div className="field">
                      <label className="field-label">Home City</label>
                      <input className="input" value={actForm.home_city} onChange={setAct('home_city')} placeholder="Nashville" />
                    </div>
                    <div className="field">
                      <label className="field-label">Home State</label>
                      <input className="input" value={actForm.home_state} onChange={setAct('home_state')} placeholder="TN" maxLength={2} />
                    </div>
                    <div className="field">
                      <label className="field-label">Contact Email</label>
                      <input className="input" type="email" value={actForm.contact_email} onChange={setAct('contact_email')} placeholder="booking@yourband.com" />
                    </div>
                    <div className="field">
                      <label className="field-label">Contact Phone</label>
                      <input className="input" type="tel" value={actForm.contact_phone} onChange={setAct('contact_phone')} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label">Bio</label>
                    <textarea className="input" value={actForm.bio} onChange={setAct('bio')} placeholder="Short act bio for email pitches…" rows={3} style={{ resize: 'vertical', minHeight: 72 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="field">
                      <label className="field-label">Website</label>
                      <input className="input" value={actForm.website} onChange={setAct('website')} placeholder="https://yourband.com" />
                    </div>
                    <div className="field">
                      <label className="field-label">EPK Link</label>
                      <input className="input" value={actForm.epk_link} onChange={setAct('epk_link')} placeholder="Electronic press kit URL" />
                    </div>
                    <div className="field">
                      <label className="field-label">Instagram</label>
                      <input className="input" value={actForm.instagram} onChange={setAct('instagram')} placeholder="@handle" />
                    </div>
                    <div className="field">
                      <label className="field-label">Facebook</label>
                      <input className="input" value={actForm.facebook} onChange={setAct('facebook')} placeholder="facebook.com/yourpage" />
                    </div>
                    <div className="field">
                      <label className="field-label">TikTok</label>
                      <input className="input" value={actForm.tiktok_url} onChange={setAct('tiktok_url')} placeholder="tiktok.com/@handle" />
                    </div>
                    <div className="field">
                      <label className="field-label">Spotify</label>
                      <input className="input" value={actForm.spotify} onChange={setAct('spotify')} placeholder="Spotify artist URL" />
                    </div>
                    <div className="field">
                      <label className="field-label">Username / Slug</label>
                      <input className="input" value={actForm.username} onChange={setAct('username')} placeholder="your-act-slug" />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={actSaving}>{actSaving ? 'Saving...' : 'Save Band Profile'}</button>
                  {actSaved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>✓ Saved</span>}
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ── ACCOUNT ── */}
        <div>
          <div style={sectionLabelStyle}>Account</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Profile */}
            <form onSubmit={save}>
              <div className="card">
                <div className="card-header"><span className="card-title">PROFILE</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Avatar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                    <div
                      onClick={() => !avatarUploading && fileInputRef.current?.click()}
                      style={{
                        width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
                        background: avatarUrl ? 'transparent' : 'var(--bg-overlay)',
                        border: '2px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: avatarUploading ? 'wait' : 'pointer',
                        overflow: 'hidden', position: 'relative', transition: 'border-color 0.15s',
                      }}
                      title="Click to upload avatar"
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      {avatarUrl
                        ? <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--accent)', lineHeight: 1 }}>
                            {(form.display_name || profile?.email || '?')[0].toUpperCase()}
                          </span>
                      }
                      {avatarUploading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#fff', fontSize: '0.7rem', fontFamily: 'var(--font-body)' }}>Uploading…</span>
                        </div>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadAvatar} style={{ display: 'none' }} />
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.2rem' }}>Profile Photo</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Click your avatar to upload.<br />PNG or JPG · max 5 MB · ideal 200×200 px
                      </div>
                      {avatarError && <div style={{ color: '#f87171', fontSize: '0.75rem', fontFamily: 'var(--font-body)', marginTop: '0.25rem' }}>{avatarError}</div>}
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label">Your Name</label>
                    <input className="input" value={form.display_name} onChange={set('display_name')} placeholder="Your full name" />
                  </div>
                  <div className="field">
                    <label className="field-label">Phone</label>
                    <input className="input" type="tel" value={form.phone} onChange={set('phone')} />
                  </div>
                  <div className="field">
                    <label className="field-label">Email</label>
                    <input className="input" type="email" value={form.email} disabled style={{ opacity: 0.5 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Email cannot be changed here</span>
                  </div>
                  <div className="field">
                    <label className="field-label">Personal Gmail</label>
                    <input className="input" type="email" value={form.personal_gmail} onChange={set('personal_gmail')} placeholder="yourname@gmail.com" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Used for advance &amp; thank-you reminder emails</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
                  {saved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>✓ Saved</span>}
                </div>
              </div>
            </form>

            {/* Change Password */}
            <form onSubmit={changePassword}>
              <div className="card">
                <div className="card-header"><span className="card-title">CHANGE PASSWORD</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="field">
                    <label className="field-label">New Password</label>
                    <input className="input" type="password" value={pwForm.newPassword}
                      onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                      placeholder="Min. 8 characters" autoComplete="new-password" />
                  </div>
                  <div className="field">
                    <label className="field-label">Confirm New Password</label>
                    <input className="input" type="password" value={pwForm.confirmPassword}
                      onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      placeholder="Repeat password" autoComplete="new-password" />
                  </div>
                  {pwError && <div style={{ color: '#f87171', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>{pwError}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={pwSaving}>{pwSaving ? 'Saving...' : 'Update Password'}</button>
                  {pwSaved && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#34d399' }}>✓ Password Updated</span>}
                </div>
              </div>
            </form>

          </div>
        </div>

        {/* ── PLAN & BILLING ── */}
        {profile && profile.role !== 'superadmin' && profile.role !== 'member' && (
          <div>
            <div style={sectionLabelStyle}>Plan &amp; Billing</div>
            <div className="card">
              <div className="card-header"><span className="card-title">BILLING</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Plan</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{TIER_LABELS[profile.subscription_tier || 'band_admin'] || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</span>
                  <span style={{
                    color: profile.subscription_status === 'active' ? '#34d399'
                         : profile.subscription_status === 'trialing' ? '#fbbf24'
                         : '#f87171',
                  }}>
                    {STATUS_LABELS[profile.subscription_status || 'inactive']}
                    {profile.subscription_status === 'trialing' && profile.trial_ends_at && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                        (expires {new Date(profile.trial_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                {profile.stripe_customer_id ? (
                  <button className="btn btn-secondary" onClick={openPortal} disabled={portalLoading}>
                    {portalLoading ? 'Opening...' : 'Manage Billing'}
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => router.push('/pricing')}>Subscribe</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CALENDAR FEED ── */}
        {(profile?.role === 'band_admin' || profile?.role === 'superadmin') && myAct && (
          <div>
            <div style={sectionLabelStyle}>Calendar</div>
            <div className="card">
              <div className="card-header"><span className="card-title">SUBSCRIBE FEED</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Your shows are available as a live calendar feed. Paste the link below into Google Calendar, Apple Calendar, or Outlook to keep your shows in sync automatically.
                </div>

                {/* URL row */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    readOnly
                    className="input"
                    value={`https://camelranchbooking.com/api/calendar/${myAct.id}.ics`}
                    style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'text' }}
                    onFocus={e => e.target.select()}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ whiteSpace: 'nowrap', minWidth: 96 }}
                    onClick={() => {
                      navigator.clipboard.writeText(`https://camelranchbooking.com/api/calendar/${myAct.id}.ics`);
                      setIcsCopied(true);
                      setTimeout(() => setIcsCopied(false), 2500);
                    }}
                  >
                    {icsCopied ? '✓ Copied' : 'Copy Link'}
                  </button>
                </div>

                {/* Instructions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>How to subscribe:</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Google Calendar</span> → Other calendars → From URL → paste link → Add Calendar<br />
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Apple Calendar</span> → File → New Calendar Subscription → paste link<br />
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Outlook</span> → Add calendar → Subscribe from web → paste link
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── GOOGLE CALENDAR SYNC ── */}
        {(profile?.role === 'band_admin' || profile?.role === 'superadmin') && (
          <div>
            <div style={sectionLabelStyle}>Google Calendar Sync</div>
            <div className="card">
              <div className="card-header"><span className="card-title">SYNC SHOWS TO GOOGLE CALENDAR</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

                {gcalMsg && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: gcalMsg.type === 'success' ? '#4caf50' : '#f44336', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>
                    {gcalMsg.text}
                  </div>
                )}

                {!gcal?.connected ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      Connect Google Calendar to automatically sync confirmed shows as events.
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ alignSelf: 'flex-start', minWidth: 160 }}
                      onClick={connectGoogle}
                      disabled={gcalConnecting}
                    >
                      {gcalConnecting ? 'Redirecting...' : 'Connect Google Calendar'}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: '#4caf50' }}>
                      Google Calendar connected
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
                        Calendar
                      </label>
                      <select
                        className="input"
                        value={gcal.selected_calendar_id || ''}
                        onChange={e => saveGcalSettings({ selected_calendar_id: e.target.value })}
                        style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}
                      >
                        <option value="">— select a calendar —</option>
                        {(gcal.calendars || []).map(c => (
                          <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (primary)' : ''}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input
                        type="checkbox"
                        id="gcal-sync-enabled"
                        checked={gcal.sync_enabled ?? false}
                        onChange={e => saveGcalSettings({ sync_enabled: e.target.checked })}
                        disabled={gcalSaving}
                      />
                      <label htmlFor="gcal-sync-enabled" style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        Automatically sync confirmed shows
                      </label>
                    </div>

                    <button
                      className="btn btn-sm"
                      style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      onClick={connectGoogle}
                    >
                      Reconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TEAM MEMBERS ── */}
        {(profile?.role === 'band_admin' || profile?.role === 'superadmin') && myAct && (
          <div>
            <div style={sectionLabelStyle}>Team Members</div>
            <div className="card">
              <div className="card-header"><span className="card-title">MEMBERS</span></div>

              {/* Current members */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {members.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{m.display_name || m.email}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.email}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: m.role === 'band_admin' ? '#a78bfa' : 'var(--text-muted)' }}>
                      {m.role === 'band_admin' ? 'Band Admin' : 'Member'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pending invites */}
              {pendingInvites.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                    Pending Invites
                  </div>
                  {pendingInvites.map(inv => (
                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{inv.email}</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {inv.role === 'band_admin' ? 'Band Admin' : 'Member'} · expires {new Date(inv.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#f87171', fontSize: '0.7rem' }}
                        onClick={() => revokeInvite(inv.id)}
                        disabled={revoking === inv.id}
                      >
                        {revoking === inv.id ? '…' : 'Revoke'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Invite form */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  Invite Member
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    type="email"
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    style={{ flex: '1 1 200px', fontSize: '16px' }}
                  />
                  <select
                    className="input select"
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as any)}
                    style={{ flex: '0 0 130px', fontSize: '16px' }}
                  >
                    <option value="member">Member</option>
                    <option value="band_admin">Band Admin</option>
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={sendInvite}
                    disabled={inviteSending || !inviteEmail.trim()}
                    style={{ flex: '0 0 auto', minHeight: 44 }}
                  >
                    {inviteSending ? 'Sending…' : 'Send Invite'}
                  </button>
                </div>
                {inviteMsg && (
                  <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: inviteMsg.type === 'success' ? '#4ade80' : '#f87171' }}>
                    {inviteMsg.text}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── NOTIFICATION PREFERENCES ── */}
        {profile && profile.role !== 'superadmin' && (
          <div>
            <div style={sectionLabelStyle}>Notifications</div>
            <div className="card">
              <div className="card-header"><span className="card-title">EMAIL NOTIFICATIONS</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={notifPrefs.venue_reply_email}
                    onChange={e => setNotifPrefs(p => ({ ...p, venue_reply_email: e.target.checked }))}
                  />
                  <div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Venue replies</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Email me when a venue replies to an outreach</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={notifPrefs.followup_reminder_email}
                    onChange={e => setNotifPrefs(p => ({ ...p, followup_reminder_email: e.target.checked }))}
                  />
                  <div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Follow-up reminders</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Email me when a follow-up is due</div>
                  </div>
                </label>
                <button
                  className="btn btn-secondary"
                  onClick={saveNotifPrefs}
                  disabled={notifSaving}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {notifSaving ? 'Saving…' : notifSaved ? '✓ Saved' : 'Save Preferences'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FOLLOW-UP AUTOMATION ── */}
        {profile && profile.role === 'band_admin' && (
          <div>
            <div style={sectionLabelStyle}>Follow-up Automation</div>
            <div className="card">
              <div className="card-header"><span className="card-title">AUTOMATIC FOLLOW-UPS</span></div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.1rem', lineHeight: 1.6 }}>
                Automatically queue follow-up emails for venues that haven't responded after N days.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={followupForm.enabled}
                    onChange={e => setFollowupForm(f => ({ ...f, enabled: e.target.checked }))} />
                  <div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      Enable follow-up automation
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Run the daily cron job to queue follow-ups automatically
                    </div>
                  </div>
                </label>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>FIRST FOLLOW-UP AFTER (DAYS)</span>
                    <input type="number" className="input" style={{ width: 100 }} min={1} max={60}
                      value={followupForm.first_followup_days}
                      onChange={e => setFollowupForm(f => ({ ...f, first_followup_days: parseInt(e.target.value, 10) || 7 }))} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>SECOND FOLLOW-UP AFTER (DAYS)</span>
                    <input type="number" className="input" style={{ width: 100 }} min={1} max={90}
                      value={followupForm.second_followup_days}
                      onChange={e => setFollowupForm(f => ({ ...f, second_followup_days: parseInt(e.target.value, 10) || 14 }))} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>MAX FOLLOW-UPS</span>
                    <select className="select" style={{ width: 90 }}
                      value={followupForm.max_followups}
                      onChange={e => setFollowupForm(f => ({ ...f, max_followups: parseInt(e.target.value, 10) }))}>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </label>
                </div>

                {followupTemplates.length > 0 && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>FOLLOW-UP EMAIL TEMPLATE</span>
                    <select className="select" style={{ maxWidth: 320 }}
                      value={followupForm.followup_template_id}
                      onChange={e => setFollowupForm(f => ({ ...f, followup_template_id: e.target.value }))}>
                      <option value="">Use default template</option>
                      {followupTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.category}</option>
                      ))}
                    </select>
                  </label>
                )}

                <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}
                  onClick={saveFollowupRule} disabled={followupSaving}>
                  {followupSaving ? 'Saving…' : followupSaved ? '✓ Saved' : 'Save Follow-up Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DANGER ZONE ── */}
        {profile && profile.role !== 'superadmin' && (
          <div>
            <div style={{ ...sectionLabelStyle, color: '#f87171' }}>Danger Zone</div>
            <div className="card" style={{ border: '1px solid rgba(248,113,113,0.25)' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                Delete my account
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                This permanently deletes your account. Type <strong style={{ color: '#f87171' }}>DELETE</strong> to confirm.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  placeholder="Type DELETE to confirm"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  style={{ flex: '1 1 200px', fontSize: '16px', borderColor: deleteConfirm === 'DELETE' ? '#f87171' : undefined }}
                />
                <button
                  className="btn"
                  style={{ background: '#f87171', color: '#000', border: 'none', minHeight: 44 }}
                  onClick={deleteAccount}
                  disabled={deleteConfirm !== 'DELETE' || deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete Account'}
                </button>
              </div>
              {deleteError && (
                <div style={{ marginTop: '0.5rem', color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>
                  {deleteError}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
