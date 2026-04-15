'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentProfile {
  agent_name:    string;
  agency_name:   string;
  contact_phone: string;
  contact_email: string;
}

interface Band {
  id:         string;
  band_name:  string;
  genre:      string;
  epk_link:   string;
  home_city:  string;
  home_state: string;
}

interface SaveMsg { ok: boolean; text: string; }

// ─── US states (for band home state selector only) ────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

// ─── Default template — loaded into DB on first save if no template exists ────
// Uses {{placeholder}} for saved profile/band data.
// Uses [Bracket Text] for per-send fields filled at send time (never saved here).

const DEFAULT_SUBJECT =
  `Booking Inquiry – {{band_name}} | [Venue Name] | [Date 1]`;

const DEFAULT_BODY =
`Hi [Booker Name / [Venue Name] Booking Team],

I'm {{agent_name}} with {{agency_name}} — I rep {{band_name}}, a hard-driving Country/Honky Tonk band. The band is willing to cover up to 3 hours with breaks and [Venue Name] feels like a natural fit.

They work door deals or ticket splits against a guarantee and prefer venues with in-house sound, but are willing to bring production when the deal makes sense. Open dates: [Date 1], [Date 2], [Date 3]. Everything you need is at {{epk_link}}. Worth a conversation?

{{agent_name}} | {{agency_name}}
{{contact_phone}} | {{contact_email}}`;

// ─── Substitute saved profile/band data into the template ─────────────────────
// Per-send placeholders ([Booker Name] etc.) are left as-is for the preview.

function substitute(template: string, profile: AgentProfile, band: Band | null): string {
  return template
    .replace(/\{\{agent_name\}\}/g,    profile.agent_name    || '[Agent Name]')
    .replace(/\{\{agency_name\}\}/g,   profile.agency_name   || '[Agency Name]')
    .replace(/\{\{contact_phone\}\}/g, profile.contact_phone || '[Phone]')
    .replace(/\{\{contact_email\}\}/g, profile.contact_email || '[Email]')
    .replace(/\{\{band_name\}\}/g,     band?.band_name       || '[Band Name]')
    .replace(/\{\{epk_link\}\}/g,      band?.epk_link        || '[EPK Link]');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingTemplateEditor({ userId }: { userId: string }) {
  const [profile,        setProfile]        = useState<AgentProfile>({ agent_name: '', agency_name: '', contact_phone: '', contact_email: '' });
  const [bands,          setBands]          = useState<Band[]>([]);
  const [selectedBandId, setSelectedBandId] = useState('');
  const [templateId,     setTemplateId]     = useState<string | null>(null);
  const [subject,        setSubject]        = useState(DEFAULT_SUBJECT);
  const [body,           setBody]           = useState(DEFAULT_BODY);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [saveMsg,        setSaveMsg]        = useState<SaveMsg | null>(null);
  const [showAddBand,    setShowAddBand]    = useState(false);
  const [newBand,        setNewBand]        = useState({ name: '', city: '', state: 'AR' });
  const [addingBand,     setAddingBand]     = useState(false);

  const selectedBand = bands.find(b => b.id === selectedBandId) ?? null;
  const previewSubject = substitute(subject, profile, selectedBand);
  const previewBody    = substitute(body,    profile, selectedBand);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('agent_name,agency_name,contact_phone,contact_email')
      .eq('id', userId).maybeSingle();
    if (data) setProfile({
      agent_name:    data.agent_name    ?? '',
      agency_name:   data.agency_name   ?? '',
      contact_phone: data.contact_phone ?? '',
      contact_email: data.contact_email ?? '',
    });
  }, [userId]);

  const loadBands = useCallback(async () => {
    const { data } = await supabase
      .from('bands')
      .select('id,band_name,genre,epk_link,home_city,home_state')
      .eq('owner_user_id', userId).order('band_name');
    const list: Band[] = (data ?? []).map(b => ({
      id: b.id, band_name: b.band_name ?? '', genre: b.genre ?? '',
      epk_link: b.epk_link ?? '', home_city: b.home_city ?? '', home_state: b.home_state ?? '',
    }));
    setBands(list);
    if (list.length > 0 && !selectedBandId) setSelectedBandId(list[0].id);
  }, [userId, selectedBandId]);

  const loadTemplate = useCallback(async (bandId: string) => {
    const { data } = await supabase
      .from('email_templates')
      .select('id,subject,body')
      .eq('user_id', userId).eq('band_id', bandId).eq('name', 'booking_inquiry')
      .maybeSingle();
    if (data) {
      setTemplateId(data.id);
      setSubject(data.subject || DEFAULT_SUBJECT);
      setBody(data.body || DEFAULT_BODY);
    } else {
      setTemplateId(null);
      setSubject(DEFAULT_SUBJECT);
      setBody(DEFAULT_BODY);
    }
  }, [userId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadProfile(), loadBands()]);
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedBandId) loadTemplate(selectedBandId);
  }, [selectedBandId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Band field edit ───────────────────────────────────────────────────────

  const setBandField = (field: keyof Band, value: string) =>
    setBands(prev => prev.map(b => b.id === selectedBandId ? { ...b, [field]: value } : b));

  // ── Add band ──────────────────────────────────────────────────────────────

  const addBand = async () => {
    if (!newBand.name.trim()) return;
    setAddingBand(true);
    try {
      const { data, error } = await supabase
        .from('bands')
        .insert([{ owner_user_id: userId, band_name: newBand.name.trim(), home_city: newBand.city, home_state: newBand.state }])
        .select('id,band_name,genre,epk_link,home_city,home_state').single();
      if (error) throw error;
      const nb: Band = { id: data.id, band_name: data.band_name, genre: '', epk_link: '', home_city: data.home_city ?? '', home_state: data.home_state ?? '' };
      setBands(prev => [...prev, nb]);
      setSelectedBandId(data.id);
      setShowAddBand(false);
      setNewBand({ name: '', city: '', state: 'AR' });
    } catch (err: unknown) {
      const msg = (err && typeof err === 'object' && 'message' in err)
        ? String((err as { message: unknown }).message)
        : err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to add band: ${msg}`);
    } finally { setAddingBand(false); }
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!selectedBandId) { setSaveMsg({ ok: false, text: 'Select or add a band first.' }); return; }
    setSaving(true); setSaveMsg(null);
    try {
      // 1. Upsert agent profile
      const { error: pe } = await supabase
        .from('profiles').upsert({ id: userId, ...profile }, { onConflict: 'id' });
      if (pe) throw pe;

      // 2. Update band fields
      const band = bands.find(b => b.id === selectedBandId);
      if (band) {
        const { error: be } = await supabase.from('bands')
          .update({ epk_link: band.epk_link, genre: band.genre, home_city: band.home_city, home_state: band.home_state })
          .eq('id', selectedBandId);
        if (be) throw be;
      }

      // 3. Upsert booking inquiry template (stores the raw template with {{placeholders}})
      const payload = { user_id: userId, band_id: selectedBandId, name: 'booking_inquiry', subject, body };
      if (templateId) {
        const { error: te } = await supabase.from('email_templates').update(payload).eq('id', templateId);
        if (te) throw te;
      } else {
        const { data: td, error: te } = await supabase.from('email_templates').insert([payload]).select('id').single();
        if (te) throw te;
        setTemplateId(td.id);
      }

      setSaveMsg({ ok: true, text: '✓ Saved.' });
    } catch (err: unknown) {
      const msg = (err && typeof err === 'object' && 'message' in err)
        ? String((err as { message: unknown }).message)
        : err instanceof Error ? err.message : 'Save failed';
      setSaveMsg({ ok: false, text: `✗ ${msg}` });
    } finally { setSaving(false); }
  };

  // ─── Styles ───────────────────────────────────────────────────────────────

  const S = {
    label:   { display: 'block', color: '#7aa5c4', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 6 },
    input:   { width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 7, color: '#e8f1f8', fontSize: 14, boxSizing: 'border-box' as const },
    field:   { marginBottom: 16 },
    section: { color: '#e8f1f8', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' as const, borderBottom: '1px solid rgba(74,133,200,0.15)', paddingBottom: 8, marginBottom: 16, marginTop: 28 },
  };

  if (loading) return <div style={{ padding: '2rem', color: '#7aa5c4', textAlign: 'center' }}>Loading…</div>;

  return (
    <>
      <style>{`
        .bte-input:focus { border-color:rgba(74,133,200,0.5)!important; outline:none; box-shadow:0 0 0 3px rgba(74,133,200,0.08); }
        @media(max-width:860px){ .bte-grid{ grid-template-columns:1fr!important; } }
      `}</style>

      <div className="bte-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>

        {/* ── LEFT: saved fields ─────────────────────────────────────────── */}
        <div>

          {/* Agent profile */}
          <div style={{ ...S.section, marginTop: 0 }}>Agent Profile</div>
          <div style={S.field}>
            <label style={S.label}>Agent Name</label>
            <input className="bte-input" style={S.input} value={profile.agent_name} placeholder="Your name"
              onChange={e => setProfile(p => ({ ...p, agent_name: e.target.value }))} />
          </div>
          <div style={S.field}>
            <label style={S.label}>Agency Name</label>
            <input className="bte-input" style={S.input} value={profile.agency_name} placeholder="Camel Ranch Booking"
              onChange={e => setProfile(p => ({ ...p, agency_name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={S.label}>Phone</label>
              <input className="bte-input" style={S.input} value={profile.contact_phone} placeholder="(555) 000-0000"
                onChange={e => setProfile(p => ({ ...p, contact_phone: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Email</label>
              <input className="bte-input" style={S.input} type="email" value={profile.contact_email} placeholder="you@agency.com"
                onChange={e => setProfile(p => ({ ...p, contact_email: e.target.value }))} />
            </div>
          </div>

          {/* Band */}
          <div style={S.section}>Band</div>

          {bands.length > 0 && (
            <div style={S.field}>
              <label style={S.label}>Select Band</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="bte-input" style={{ ...S.input, flex: 1 }} value={selectedBandId}
                  onChange={e => setSelectedBandId(e.target.value)}>
                  {bands.map(b => <option key={b.id} value={b.id}>{b.band_name}</option>)}
                </select>
                <button onClick={() => setShowAddBand(v => !v)}
                  style={{ padding: '10px 14px', background: 'rgba(74,133,200,0.1)', border: '1px solid rgba(74,133,200,0.3)', borderRadius: 7, color: '#6baed6', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  + Add
                </button>
              </div>
            </div>
          )}

          {(showAddBand || bands.length === 0) && (
            <div style={{ background: 'rgba(74,133,200,0.05)', border: '1px solid rgba(74,133,200,0.15)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ ...S.section, marginTop: 0 }}>{bands.length === 0 ? 'Add Your First Band' : 'New Band'}</div>
              <div style={S.field}>
                <label style={S.label}>Band Name</label>
                <input className="bte-input" style={S.input} value={newBand.name} placeholder="Better Than Nothin'"
                  onChange={e => setNewBand(n => ({ ...n, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginBottom: 12 }}>
                <div>
                  <label style={S.label}>Home City</label>
                  <input className="bte-input" style={S.input} value={newBand.city} placeholder="Fayetteville"
                    onChange={e => setNewBand(n => ({ ...n, city: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>State</label>
                  <select className="bte-input" style={S.input} value={newBand.state}
                    onChange={e => setNewBand(n => ({ ...n, state: e.target.value }))}>
                    {US_STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addBand} disabled={addingBand || !newBand.name.trim()}
                  style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 7, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: !newBand.name.trim() ? 0.5 : 1 }}>
                  {addingBand ? 'Adding…' : 'Add Band'}
                </button>
                {bands.length > 0 && (
                  <button onClick={() => setShowAddBand(false)}
                    style={{ padding: '10px 14px', background: 'transparent', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 7, color: '#7aa5c4', fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {selectedBand && (
            <>
              <div style={S.field}>
                <label style={S.label}>EPK Link</label>
                <input className="bte-input" style={S.input} type="url" value={selectedBand.epk_link}
                  placeholder="https://yourband.com/epk"
                  onChange={e => setBandField('epk_link', e.target.value)} />
                <div style={{ color: '#4a7a9b', fontSize: 11, marginTop: 4 }}>Linked in every inquiry for this band</div>
              </div>
              <div style={S.field}>
                <label style={S.label}>Genre</label>
                <input className="bte-input" style={S.input} value={selectedBand.genre}
                  placeholder="Country/Honky Tonk"
                  onChange={e => setBandField('genre', e.target.value)} />
              </div>
            </>
          )}

          {/* Template */}
          <div style={S.section}>Email Template</div>
          <p style={{ color: '#4a7a9b', fontSize: 12, marginTop: -10, marginBottom: 14 }}>
            Use <code style={{ color: '#6baed6', background: 'rgba(74,133,200,0.1)', padding: '1px 5px', borderRadius: 4 }}>{'{{placeholder}}'}</code> for saved data — it substitutes automatically.
            Leave <code style={{ color: '#7aa5c4', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>[Bracket text]</code> for fields you fill at send time.
          </p>
          <div style={S.field}>
            <label style={S.label}>Subject Line</label>
            <input className="bte-input" style={S.input} value={subject}
              onChange={e => setSubject(e.target.value)} />
          </div>
          <div style={S.field}>
            <label style={S.label}>Body</label>
            <textarea className="bte-input" style={{ ...S.input, minHeight: 280, resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }}
              value={body} onChange={e => setBody(e.target.value)} />
          </div>

          {/* Save */}
          {saveMsg && (
            <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600,
              background: saveMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${saveMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`,
              color: saveMsg.ok ? '#22c55e' : '#f87171' }}>
              {saveMsg.text}
            </div>
          )}
          <button onClick={save} disabled={saving || !selectedBandId}
            style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 8, color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: saving || !selectedBandId ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* ── RIGHT: live preview ─────────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div style={{ ...S.section, marginTop: 0 }}>Preview</div>
          <p style={{ color: '#4a7a9b', fontSize: 12, marginTop: -10, marginBottom: 16 }}>
            Saved data fills in automatically. <span style={{ color: '#7aa5c4' }}>[Bracket fields]</span> are filled at send time.
          </p>

          <div style={{ background: 'rgba(9,24,40,0.9)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: 'rgba(74,133,200,0.07)', padding: '8px 14px', borderBottom: '1px solid rgba(74,133,200,0.12)' }}>
              <span style={{ color: '#4a7a9b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Subject</span>
            </div>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(74,133,200,0.1)' }}>
              <div style={{ color: '#e8f1f8', fontSize: 13, fontWeight: 600 }}>{previewSubject}</div>
            </div>
            <div style={{ padding: '16px 14px' }}>
              <pre style={{ color: '#c8dff0', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                {previewBody}
              </pre>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
