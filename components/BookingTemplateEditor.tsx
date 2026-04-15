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

interface PreviewFields {
  booker_name: string;
  venue_name:  string;
  date1:       string;
  date2:       string;
  date3:       string;
}

interface SaveMsg { ok: boolean; text: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY_STATES    = ['AR', 'MO', 'OK', 'TX'];
const EXPANSION_STATES  = ['CO', 'NM', 'WY'];
const ALL_TARGET_STATES = [...PRIMARY_STATES, ...EXPANSION_STATES];

const EMPTY_PROFILE: AgentProfile = { agent_name: '', agency_name: '', contact_phone: '', contact_email: '' };
const EMPTY_PREVIEW: PreviewFields = { booker_name: '', venue_name: '', date1: '', date2: '', date3: '' };

// ─── Template assembly ────────────────────────────────────────────────────────

function fill(val: string, placeholder: string) { return val.trim() || placeholder; }

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00'); // avoid TZ shift
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function assembleEmail(
  profile:      AgentProfile,
  band:         Band | null,
  targetStates: string[],
  preview:      PreviewFields,
): { subject: string; body: string } {
  const agentName   = fill(profile.agent_name,   '[Agent Name]');
  const agencyName  = fill(profile.agency_name,  '[Agency Name]');
  const phone       = fill(profile.contact_phone,'[Phone]');
  const email       = fill(profile.contact_email,'[Email]');
  const bandName    = fill(band?.band_name  ?? '', '[Band Name]');
  const epkLink     = fill(band?.epk_link   ?? '', '[EPK Link]');
  const states      = targetStates.length ? targetStates.join(', ') : '[Target States]';
  const booker      = fill(preview.booker_name, '[Booker Name]');
  const venue       = fill(preview.venue_name,  '[Venue Name]');
  const d1          = preview.date1 ? formatDate(preview.date1) : '[Date 1]';
  const d2          = preview.date2 ? formatDate(preview.date2) : '[Date 2]';
  const d3          = preview.date3 ? formatDate(preview.date3) : '[Date 3]';

  const body =
`Hi ${booker},

I'm ${agentName} with ${agencyName} — I rep ${bandName}, a hard-driving Country/Honky Tonk band with a real following across ${states}. The band is willing to cover up to 3 hours with breaks and ${venue} feels like a natural fit.

They work door deals or ticket splits against a guarantee and prefer venues with in-house sound, but are willing to bring production when the deal makes sense. Open dates: ${d1}, ${d2}, ${d3}. Everything you need is at ${epkLink}. Worth a conversation?

${agentName} | ${agencyName}
${phone} | ${email}`;

  const subject = `Booking Inquiry – ${bandName} | ${venue} | ${d1}`;
  return { subject, body };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingTemplateEditor({ userId }: { userId: string }) {
  const [profile,       setProfile]       = useState<AgentProfile>(EMPTY_PROFILE);
  const [bands,         setBands]         = useState<Band[]>([]);
  const [selectedBandId, setSelectedBandId] = useState('');
  const [targetStates,  setTargetStates]  = useState<string[]>([...PRIMARY_STATES]);
  const [templateId,    setTemplateId]    = useState<string | null>(null);
  const [preview,       setPreview]       = useState<PreviewFields>(EMPTY_PREVIEW);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [saveMsg,       setSaveMsg]       = useState<SaveMsg | null>(null);
  const [showAddBand,   setShowAddBand]   = useState(false);
  const [newBandName,   setNewBandName]   = useState('');
  const [newBandGenre,  setNewBandGenre]  = useState('Country/Honky Tonk');
  const [newBandCity,   setNewBandCity]   = useState('');
  const [newBandState,  setNewBandState]  = useState('AR');
  const [addingBand,    setAddingBand]    = useState(false);

  const selectedBand = bands.find(b => b.id === selectedBandId) ?? null;

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('agent_name, agency_name, contact_phone, contact_email')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      setProfile({
        agent_name:    data.agent_name    ?? '',
        agency_name:   data.agency_name   ?? '',
        contact_phone: data.contact_phone ?? '',
        contact_email: data.contact_email ?? '',
      });
    }
  }, [userId]);

  const loadBands = useCallback(async () => {
    const { data } = await supabase
      .from('bands')
      .select('id, band_name, genre, epk_link, home_city, home_state')
      .eq('owner_user_id', userId)
      .order('band_name');
    const list: Band[] = (data ?? []).map(b => ({
      id:         b.id,
      band_name:  b.band_name  ?? '',
      genre:      b.genre      ?? '',
      epk_link:   b.epk_link   ?? '',
      home_city:  b.home_city  ?? '',
      home_state: b.home_state ?? '',
    }));
    setBands(list);
    if (list.length > 0 && !selectedBandId) setSelectedBandId(list[0].id);
  }, [userId, selectedBandId]);

  const loadTemplate = useCallback(async (bandId: string) => {
    if (!bandId) return;
    const { data } = await supabase
      .from('email_templates')
      .select('id, variables')
      .eq('user_id', userId)
      .eq('band_id', bandId)
      .eq('name', 'booking_inquiry')
      .maybeSingle();
    if (data) {
      setTemplateId(data.id);
      try {
        const vars = typeof data.variables === 'string'
          ? JSON.parse(data.variables)
          : (data.variables ?? {});
        if (Array.isArray(vars.target_states)) setTargetStates(vars.target_states);
      } catch { /* use defaults */ }
    } else {
      setTemplateId(null);
      setTargetStates([...PRIMARY_STATES]);
    }
  }, [userId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadProfile(), loadBands()]);
      setLoading(false);
    })();
  }, []);  // intentionally omit callbacks — runs once on mount

  useEffect(() => {
    if (selectedBandId) loadTemplate(selectedBandId);
  }, [selectedBandId]);

  // ── Band field helpers ────────────────────────────────────────────────────

  function setBandField(field: keyof Band, value: string) {
    setBands(prev => prev.map(b => b.id === selectedBandId ? { ...b, [field]: value } : b));
  }

  // ── Add band ──────────────────────────────────────────────────────────────

  const addBand = async () => {
    if (!newBandName.trim()) return;
    setAddingBand(true);
    try {
      const { data, error } = await supabase
        .from('bands')
        .insert([{
          owner_user_id: userId,
          band_name:     newBandName.trim(),
          genre:         newBandGenre,
          home_city:     newBandCity,
          home_state:    newBandState,
        }])
        .select('id, band_name, genre, epk_link, home_city, home_state')
        .single();
      if (error) throw error;
      const nb: Band = { id: data.id, band_name: data.band_name, genre: data.genre ?? '', epk_link: '', home_city: data.home_city ?? '', home_state: data.home_state ?? '' };
      setBands(prev => [...prev, nb]);
      setSelectedBandId(data.id);
      setShowAddBand(false);
      setNewBandName(''); setNewBandGenre('Country/Honky Tonk'); setNewBandCity(''); setNewBandState('AR');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add band');
    } finally { setAddingBand(false); }
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!selectedBandId) { setSaveMsg({ ok: false, text: 'Select or add a band first.' }); return; }
    setSaving(true); setSaveMsg(null);
    try {
      // 1. Upsert agent profile
      const { error: pe } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...profile }, { onConflict: 'id' });
      if (pe) throw pe;

      // 2. Update band (EPK link + other editable fields)
      const band = bands.find(b => b.id === selectedBandId);
      if (band) {
        const { error: be } = await supabase
          .from('bands')
          .update({ epk_link: band.epk_link, genre: band.genre, home_city: band.home_city, home_state: band.home_state })
          .eq('id', selectedBandId);
        if (be) throw be;
      }

      // 3. Upsert booking inquiry template
      const assembled = assembleEmail(profile, band ?? null, targetStates, EMPTY_PREVIEW);
      const templatePayload = {
        user_id:   userId,
        band_id:   selectedBandId,
        name:      'booking_inquiry',
        subject:   assembled.subject,
        body:      assembled.body,
        variables: JSON.stringify({ target_states: targetStates }),
      };

      if (templateId) {
        const { error: te } = await supabase.from('email_templates').update(templatePayload).eq('id', templateId);
        if (te) throw te;
      } else {
        const { data: td, error: te } = await supabase.from('email_templates').insert([templatePayload]).select('id').single();
        if (te) throw te;
        setTemplateId(td.id);
      }

      setSaveMsg({ ok: true, text: '✓ Profile and template saved.' });
    } catch (err: unknown) {
      const msg = (err && typeof err === 'object' && 'message' in err)
        ? String((err as { message: unknown }).message)
        : err instanceof Error ? err.message : 'Save failed';
      setSaveMsg({ ok: false, text: `✗ ${msg}` });
    } finally { setSaving(false); }
  };

  // ── Assembled preview ─────────────────────────────────────────────────────

  const assembled = assembleEmail(profile, selectedBand, targetStates, preview);

  // ─────────────────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────────────────

  const S = {
    label: { display: 'block', color: '#7aa5c4', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 6 },
    input: { width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 7, color: '#e8f1f8', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' },
    row: { marginBottom: 16 },
    sectionHead: { color: '#e8f1f8', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase' as const, borderBottom: '1px solid rgba(74,133,200,0.15)', paddingBottom: 8, marginBottom: 16, marginTop: 24 },
  };

  if (loading) return (
    <div style={{ padding: '2rem', color: '#7aa5c4', textAlign: 'center' }}>Loading template…</div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
      <style>{`
        @media (max-width: 860px) {
          .bte-grid { grid-template-columns: 1fr !important; }
        }
        .bte-input:focus { border-color: rgba(74,133,200,0.6) !important; box-shadow: 0 0 0 3px rgba(74,133,200,0.1); }
        .bte-pill { display:inline-flex; align-items:center; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:700; cursor:pointer; transition:all .15s; user-select:none; border:1px solid; }
        .bte-pill:hover { opacity:.85; }
        .bte-state-btn { transition:all .15s; }
        .bte-state-btn:hover { opacity:.8; }
      `}</style>

      {/* ── LEFT: Form ──────────────────────────────────────────────────── */}
      <div className="bte-grid" style={{ display: 'contents' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Agent Profile */}
        <div style={S.sectionHead}>Agent Profile</div>

        <div style={S.row}>
          <label style={S.label}>Agent Name</label>
          <input className="bte-input" style={S.input} value={profile.agent_name}
            onChange={e => setProfile(p => ({ ...p, agent_name: e.target.value }))}
            placeholder="Your name" />
        </div>
        <div style={S.row}>
          <label style={S.label}>Agency Name</label>
          <input className="bte-input" style={S.input} value={profile.agency_name}
            onChange={e => setProfile(p => ({ ...p, agency_name: e.target.value }))}
            placeholder="Camel Ranch Booking" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={S.label}>Contact Phone</label>
            <input className="bte-input" style={S.input} value={profile.contact_phone}
              onChange={e => setProfile(p => ({ ...p, contact_phone: e.target.value }))}
              placeholder="(555) 000-0000" />
          </div>
          <div>
            <label style={S.label}>Contact Email</label>
            <input className="bte-input" style={{ ...S.input }} value={profile.contact_email}
              onChange={e => setProfile(p => ({ ...p, contact_email: e.target.value }))}
              placeholder="you@agency.com" type="email" />
          </div>
        </div>

        {/* Band */}
        <div style={S.sectionHead}>Band</div>

        {bands.length > 0 && (
          <div style={S.row}>
            <label style={S.label}>Select Band</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="bte-input" style={{ ...S.input, flex: 1 }}
                value={selectedBandId}
                onChange={e => setSelectedBandId(e.target.value)}>
                {bands.map(b => <option key={b.id} value={b.id}>{b.band_name}</option>)}
              </select>
              <button
                onClick={() => setShowAddBand(v => !v)}
                style={{ padding: '10px 14px', background: 'rgba(74,133,200,0.1)', border: '1px solid rgba(74,133,200,0.3)', borderRadius: 7, color: '#6baed6', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                + Add
              </button>
            </div>
          </div>
        )}

        {(showAddBand || bands.length === 0) && (
          <div style={{ background: 'rgba(74,133,200,0.06)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
            <div style={{ ...S.sectionHead, marginTop: 0, borderColor: 'rgba(74,133,200,0.1)' }}>
              {bands.length === 0 ? 'Add Your First Band' : 'Add Band'}
            </div>
            <div style={S.row}>
              <label style={S.label}>Band Name</label>
              <input className="bte-input" style={S.input} value={newBandName}
                onChange={e => setNewBandName(e.target.value)} placeholder="Better Than Nothin'" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginBottom: 16 }}>
              <div>
                <label style={S.label}>Home City</label>
                <input className="bte-input" style={S.input} value={newBandCity}
                  onChange={e => setNewBandCity(e.target.value)} placeholder="Fayetteville" />
              </div>
              <div>
                <label style={S.label}>State</label>
                <select className="bte-input" style={S.input} value={newBandState}
                  onChange={e => setNewBandState(e.target.value)}>
                  {['AR','CO','MO','NM','OK','TX','WY'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addBand} disabled={addingBand || !newBandName.trim()}
                style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 7, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: addingBand || !newBandName.trim() ? 0.5 : 1 }}>
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
            <div style={S.row}>
              <label style={S.label}>EPK Link</label>
              <input className="bte-input" style={S.input} value={selectedBand.epk_link}
                onChange={e => setBandField('epk_link', e.target.value)}
                placeholder="https://yourband.com/epk" type="url" />
              <div style={{ color: '#4a85c8', fontSize: 11, marginTop: 4 }}>
                Linked in every booking inquiry for this band
              </div>
            </div>
            <div style={S.row}>
              <label style={S.label}>Genre</label>
              <input className="bte-input" style={S.input} value={selectedBand.genre}
                onChange={e => setBandField('genre', e.target.value)}
                placeholder="Country/Honky Tonk" />
            </div>
          </>
        )}

        {/* Target Markets */}
        <div style={S.sectionHead}>Target Markets</div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ color: '#4a85c8', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>Primary</span>
            {PRIMARY_STATES.map(s => {
              const on = targetStates.includes(s);
              return (
                <button key={s} className="bte-state-btn"
                  onClick={() => setTargetStates(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                  style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? 'rgba(74,133,200,0.6)' : 'rgba(74,133,200,0.2)'}`, background: on ? 'rgba(74,133,200,0.2)' : 'transparent', color: on ? '#6baed6' : '#4a7a9b' }}>
                  {s}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: '#7aa5c4', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>Expansion</span>
            {EXPANSION_STATES.map(s => {
              const on = targetStates.includes(s);
              return (
                <button key={s} className="bte-state-btn"
                  onClick={() => setTargetStates(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                  style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? 'rgba(167,139,250,0.6)' : 'rgba(74,133,200,0.15)'}`, background: on ? 'rgba(167,139,250,0.15)' : 'transparent', color: on ? '#a78bfa' : '#4a7a9b' }}>
                  {s}
                </button>
              );
            })}
          </div>
          <div style={{ color: '#4a7a9b', fontSize: 11, marginTop: 8 }}>
            Selected states appear in the inquiry email. Toggle to include / exclude.
          </div>
        </div>

        {/* Deal parameters — display only */}
        <div style={S.sectionHead}>Booking Parameters</div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(74,133,200,0.12)', borderRadius: 8, padding: '12px 14px', marginBottom: 24 }}>
          {[
            ['Deal',       'Door deals or ticket splits against a guarantee'],
            ['Sound',      'Prefers in-house sound — willing to bring production when the deal makes sense'],
            ['Set Length', 'Up to 3 hours with breaks'],
            ['Minimum',    'Full band: $1,000 guarantee or door deal'],
            ['Weekends',   'No "light week" weekends · Wed & Sun fair game on open weekends'],
            ['Trio',       'Pedal steel/dobro + upright bass — targets listening rooms & breweries in expansion markets'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: '#4a85c8', fontWeight: 700, minWidth: 78 }}>{k}</span>
              <span style={{ color: '#7aa5c4' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Save */}
        {saveMsg && (
          <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600, background: saveMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)', border: `1px solid ${saveMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`, color: saveMsg.ok ? '#22c55e' : '#f87171' }}>
            {saveMsg.text}
          </div>
        )}
        <button onClick={save} disabled={saving || !selectedBandId}
          style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 8, color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: saving || !selectedBandId ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Profile & Template'}
        </button>
      </div>

      {/* ── RIGHT: Preview ──────────────────────────────────────────────── */}
      <div>
        {/* Per-send fields */}
        <div style={{ background: 'rgba(74,133,200,0.06)', border: '1px solid rgba(74,133,200,0.15)', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
          <div style={{ ...S.sectionHead, marginTop: 0 }}>Preview — Per-Send Fields</div>
          <p style={{ color: '#4a7a9b', fontSize: 12, marginBottom: 14, marginTop: -8 }}>
            These fill in the preview only and are never saved.
          </p>
          <div style={S.row}>
            <label style={S.label}>Booker First Name</label>
            <input className="bte-input" style={S.input} value={preview.booker_name}
              onChange={e => setPreview(p => ({ ...p, booker_name: e.target.value }))}
              placeholder="Jake" />
          </div>
          <div style={S.row}>
            <label style={S.label}>Venue Name</label>
            <input className="bte-input" style={S.input} value={preview.venue_name}
              onChange={e => setPreview(p => ({ ...p, venue_name: e.target.value }))}
              placeholder="The Rusty Spur" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {(['date1','date2','date3'] as const).map((f, i) => (
              <div key={f}>
                <label style={S.label}>Date {i + 1}</label>
                <input className="bte-input" style={S.input} type="date" value={preview[f]}
                  onChange={e => setPreview(p => ({ ...p, [f]: e.target.value }))} />
              </div>
            ))}
          </div>
        </div>

        {/* Rendered email preview */}
        <div style={{ background: 'rgba(9,24,40,0.9)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: 'rgba(74,133,200,0.08)', padding: '10px 16px', borderBottom: '1px solid rgba(74,133,200,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#4a85c8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preview</span>
          </div>

          {/* Subject */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(74,133,200,0.1)' }}>
            <div style={{ color: '#4a7a9b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Subject</div>
            <div style={{ color: '#e8f1f8', fontSize: 13, fontWeight: 600, fontStyle: assembled.subject.includes('[') ? 'italic' : 'normal' }}>
              {assembled.subject}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '16px' }}>
            <pre style={{ color: '#c8dff0', fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
              {assembled.body}
            </pre>
          </div>
        </div>

        {/* Booking flags */}
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 7, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#fbbf24', fontSize: 12 }}>⚑</span>
            <span style={{ color: '#7aa5c4', fontSize: 12 }}>Full-band shows: flag any deal below $1,000 guarantee</span>
          </div>
          <div style={{ background: 'rgba(74,133,200,0.06)', border: '1px solid rgba(74,133,200,0.12)', borderRadius: 7, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#4a85c8', fontSize: 12 }}>ℹ</span>
            <span style={{ color: '#7aa5c4', fontSize: 12 }}>Solo/duo shows do not require venue sound system</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
