'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmailTemplate {
  id: string; name: string; subject: string;
  body: string; variables: string[]; created_at: string; user_id?: string;
}
interface Venue {
  id: string; name: string; email: string | null;
  city: string; state: string; address?: string;
  phone?: string; booking_contact?: string;
}
interface Campaign {
  id: string; name: string; cities: string[];
  date_range_start?: string; date_range_end?: string;
}
interface CampaignVenue {
  id: string; status: string;
  venue: Venue;
}
interface SendResult {
  venueId: string; venueName: string;
  success: boolean; error?: string;
}

// ─── Template definitions ─────────────────────────────────────────────────────
const TEMPLATE_TILES = [
  { id:'initial',      name:'Initial Venue Inquiry',    description:'First contact with a new venue',    accent:'#3a7fc1', glow:'rgba(58,127,193,0.15)',  border:'rgba(58,127,193,0.3)'  },
  { id:'followup',     name:'Follow-Up',                description:'Check in after no response',        accent:'#f59e0b', glow:'rgba(245,158,11,0.12)',  border:'rgba(245,158,11,0.28)' },
  { id:'confirmation', name:'Booking Confirmation',     description:'Confirm a booked date',             accent:'#22c55e', glow:'rgba(34,197,94,0.12)',   border:'rgba(34,197,94,0.28)'  },
  { id:'thankyou',     name:'Post-Show Thank You',      description:'Thank you after a performance',     accent:'#a78bfa', glow:'rgba(167,139,250,0.12)', border:'rgba(167,139,250,0.28)'},
];

const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  initial: {
    subject: "Live Music Booking Inquiry — {{band_name}}",
    body: `Hello {{booking_contact}},

I hope this message finds you well! My name is {{sender_name}} and I represent {{band_name}}, an Ozark Country band based in Northwest Arkansas.

We're currently booking shows for {{tour_dates}} and came across {{venue_name}} in {{city}}. We love what you're doing with live music and think our high-energy country sound would be a great fit for your venue.

{{band_name}} delivers authentic Ozark Country with a mix of classic covers and original songs. We typically play 3–4 hour sets and have experience playing venues ranging from intimate clubs to larger dance halls.

Would you be interested in discussing available dates? We're very flexible on scheduling.

Looking forward to hearing from you!

Best regards,
{{sender_name}}
{{band_name}}
{{sender_email}}
{{sender_phone}}`,
  },
  followup: {
    subject: "Following Up — {{band_name}} Booking Inquiry",
    body: `Hello {{booking_contact}},

I wanted to follow up on my previous message about booking {{band_name}} at {{venue_name}}.

We're still looking for venues for {{tour_dates}} and would love to bring our show to {{city}}. If now isn't the right time, I'd be happy to discuss future dates as well.

Please don't hesitate to reach out with any questions.

Best regards,
{{sender_name}}
{{band_name}}
{{sender_email}}
{{sender_phone}}`,
  },
  confirmation: {
    subject: "Booking Confirmed — {{band_name}} at {{venue_name}}",
    body: `Hello {{booking_contact}},

We're thrilled to confirm our booking at {{venue_name}}!

Here are the details:
- Venue: {{venue_name}}, {{city}}, {{state}}
- Date: {{show_date}}
- Set time: {{show_time}}
- Set length: {{set_length}}

Please let us know if anything needs adjusting. We'll be in touch closer to the date with our full set list and technical requirements.

Looking forward to playing for your crowd!

Best,
{{sender_name}}
{{band_name}}
{{sender_email}}
{{sender_phone}}`,
  },
  thankyou: {
    subject: "Thank You — {{band_name}}",
    body: `Hello {{booking_contact}},

We just wanted to say a huge thank you for having us at {{venue_name}} on {{show_date}}.

Your staff was incredibly welcoming and the crowd was fantastic. We hope the night was a great success for you as well.

We'd love to come back — please keep us in mind for future dates!

Warmly,
{{sender_name}}
{{band_name}}
{{sender_email}}
{{sender_phone}}`,
  },
};

const STATUS_CFG: Record<string,{label:string;color:string}> = {
  'contact?':  { label:'To Contact',  color:'#6baed6' },
  'pending':   { label:'Pending',     color:'#f59e0b' },
  'responded': { label:'Responded',   color:'#a78bfa' },
  'booked':    { label:'Booked',      color:'#22c55e' },
  'declined':  { label:'Declined',    color:'#f87171' },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function EmailTemplateManager() {
  const [templates, setTemplates]           = useState<Record<string,EmailTemplate>>({});
  const [campaigns, setCampaigns]           = useState<Campaign[]>([]);
  const [loading, setLoading]               = useState(true);

  const [activeTemplate, setActiveTemplate] = useState<string|null>(null);
  const [view, setView]                     = useState<'edit'|'send'>('edit');

  // Edit
  const [editSubject, setEditSubject]       = useState('');
  const [editBody, setEditBody]             = useState('');
  const [saving, setSaving]                 = useState(false);
  const [saveMsg, setSaveMsg]               = useState('');

  // Send — Run-based flow
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign|null>(null);
  const [runVenues, setRunVenues]           = useState<CampaignVenue[]>([]);
  const [loadingVenues, setLoadingVenues]   = useState(false);
  const [checkedIds, setCheckedIds]         = useState<Set<string>>(new Set());
  const [previewVenue, setPreviewVenue]     = useState<CampaignVenue|null>(null);
  const [sendResults, setSendResults]       = useState<SendResult[]>([]);
  const [bulkSending, setBulkSending]       = useState(false);
  const [sendProgress, setSendProgress]     = useState(0);

  useEffect(() => { loadData(); }, []);

  // ── Load templates + campaigns ───────────────────────────────────────────
  const loadData = async () => {
    try {
      setLoading(true);
      const local  = localStorage.getItem('loggedInUser');
      const userId = local ? JSON.parse(local).id : null;

      if (userId) {
        const { data } = await supabase.from('email_templates').select('*').eq('user_id', userId);
        const map: Record<string,EmailTemplate> = {};
        (data||[]).forEach((t:EmailTemplate) => {
          const key = TEMPLATE_TILES.find(ti =>
            t.name.toLowerCase().includes(ti.id) ||
            ti.name.toLowerCase().includes(t.name.toLowerCase().split(' ')[0])
          )?.id || t.id;
          map[key] = t;
        });
        setTemplates(map);
      }

      const { data: camps } = await supabase
        .from('campaigns').select('id,name,cities,date_range_start,date_range_end')
        .eq('status','active').order('created_at',{ascending:false});
      setCampaigns(camps||[]);
    } catch(err){ console.error(err); }
    finally { setLoading(false); }
  };

  // ── Load venues for selected run ─────────────────────────────────────────
  const loadRunVenues = async (campaign: Campaign) => {
    setLoadingVenues(true);
    setRunVenues([]);
    setCheckedIds(new Set());
    setPreviewVenue(null);
    setSendResults([]);
    try {
      const { data } = await supabase
        .from('campaign_venues')
        .select(`id, status, venue:venues(id,name,email,city,state,address,phone,booking_contact)`)
        .eq('campaign_id', campaign.id)
        .order('status');
      setRunVenues((data as unknown as CampaignVenue[])||[]);
    } catch(err){ console.error(err); }
    finally { setLoadingVenues(false); }
  };

  const selectCampaign = (c: Campaign) => {
    setSelectedCampaign(c);
    loadRunVenues(c);
  };

  // ── Template open / save ─────────────────────────────────────────────────
  const openTemplate = (id: string) => {
    const saved = templates[id];
    const defs  = DEFAULT_TEMPLATES[id];
    setEditSubject(saved?.subject || defs?.subject || '');
    setEditBody(saved?.body || defs?.body || '');
    setActiveTemplate(id);
    setView('edit');
    setSaveMsg('');
    setSendResults([]);
    setSelectedCampaign(null);
    setRunVenues([]);
    setCheckedIds(new Set());
  };

  const saveTemplate = async () => {
    if (!activeTemplate) return;
    const local  = localStorage.getItem('loggedInUser');
    const userId = local ? JSON.parse(local).id : null;
    if (!userId) return;
    setSaving(true); setSaveMsg('');
    try {
      const tile     = TEMPLATE_TILES.find(t => t.id === activeTemplate)!;
      const existing = templates[activeTemplate];
      if (existing?.id) {
        await supabase.from('email_templates').update({ subject:editSubject, body:editBody }).eq('id',existing.id);
      } else {
        await supabase.from('email_templates').insert({
          name:tile.name, subject:editSubject, body:editBody,
          variables:extractVariables(editBody+' '+editSubject), user_id:userId,
        });
      }
      setSaveMsg('Saved');
      await loadData();
      setTimeout(()=>setSaveMsg(''),2500);
    } catch(err){ setSaveMsg('Save failed'); }
    finally { setSaving(false); }
  };

  // ── Variable fill ────────────────────────────────────────────────────────
  const fillVars = (text: string, venue?: Venue|null, campaign?: Campaign|null): string => {
    const local = localStorage.getItem('loggedInUser');
    const u     = local ? JSON.parse(local) : {};
    const tourDates = campaign
      ? [campaign.date_range_start, campaign.date_range_end]
          .filter(Boolean).map(d => fmtDate(d!)).join(' – ')
      : '{{tour_dates}}';
    return text
      .replace(/{{venue_name}}/g,      venue?.name             || '{{venue_name}}')
      .replace(/{{city}}/g,            venue?.city             || '{{city}}')
      .replace(/{{state}}/g,           venue?.state            || '{{state}}')
      .replace(/{{booking_contact}}/g, venue?.booking_contact  || 'there')
      .replace(/{{band_name}}/g,       u.bandName              || "Better Than Nothin'")
      .replace(/{{sender_name}}/g,     u.bandName              || 'Scott')
      .replace(/{{sender_email}}/g,    u.email                 || '')
      .replace(/{{sender_phone}}/g,    '')
      .replace(/{{tour_dates}}/g,      tourDates)
      .replace(/{{tour_name}}/g,       campaign?.name          || '')
      .replace(/{{show_date}}/g,       '{{show_date}}')
      .replace(/{{show_time}}/g,       '{{show_time}}')
      .replace(/{{set_length}}/g,      '3–4 hours');
  };

  const extractVariables = (text: string) => {
    const m = text.match(/{{(\w+)}}/g)||[];
    return [...new Set(m.map(x=>x.replace(/[{}]/g,'')))];
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

  // ── Checkbox helpers ─────────────────────────────────────────────────────
  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const checkAll = () => {
    const withEmail = runVenues.filter(cv => cv.venue.email);
    setCheckedIds(new Set(withEmail.map(cv => cv.id)));
  };
  const checkNone = () => setCheckedIds(new Set());

  // ── Bulk send ────────────────────────────────────────────────────────────
  const sendBulk = async () => {
    const toSend = runVenues.filter(cv => checkedIds.has(cv.id) && cv.venue.email);
    if (toSend.length === 0) return;
    if (!confirm(`Send emails to ${toSend.length} venue${toSend.length!==1?'s':''}?`)) return;

    setBulkSending(true);
    setSendResults([]);
    setSendProgress(0);

    const results: SendResult[] = [];
    for (let i = 0; i < toSend.length; i++) {
      const cv = toSend[i];
      const subject = fillVars(editSubject, cv.venue, selectedCampaign);
      const body    = fillVars(editBody,    cv.venue, selectedCampaign);
      try {
        const res = await fetch('/api/email/send', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ to:cv.venue.email, subject, body, venueId:cv.venue.id }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Send failed');
        results.push({ venueId:cv.venue.id, venueName:cv.venue.name, success:true });
        // Update venue status to 'pending' after sending
        await supabase.from('campaign_venues').update({ status:'pending' }).eq('id',cv.id);
      } catch(err:any) {
        results.push({ venueId:cv.venue.id, venueName:cv.venue.name, success:false, error:err.message });
      }
      setSendProgress(i+1);
      setSendResults([...results]);
      // Small delay to avoid rate limits
      if (i < toSend.length-1) await new Promise(r=>setTimeout(r,400));
    }
    setBulkSending(false);
    // Refresh run venues to show updated statuses
    if (selectedCampaign) loadRunVenues(selectedCampaign);
  };

  const tile = TEMPLATE_TILES.find(t=>t.id===activeTemplate);
  const checkedWithEmail = runVenues.filter(cv=>checkedIds.has(cv.id) && cv.venue.email);
  const previewSubject   = previewVenue ? fillVars(editSubject, previewVenue.venue, selectedCampaign) : editSubject;
  const previewBody      = previewVenue ? fillVars(editBody,    previewVenue.venue, selectedCampaign) : editBody;

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
      minHeight:400,background:'#030d18',fontFamily:"'Nunito',sans-serif",
      color:'#3d6285',fontSize:15}}>Loading templates…</div>
  );

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;}
        .em-wrap{background:#030d18;min-height:100vh;padding:2rem;font-family:'Nunito',sans-serif;}
        .em-input{background:rgba(9,24,40,0.9);border:1px solid rgba(74,133,200,0.22);
          border-radius:9px;padding:10px 14px;color:#e8f1f8;
          font-family:'Nunito',sans-serif;font-size:14px;outline:none;
          transition:border-color .2s;width:100%;}
        .em-input::placeholder{color:#3d6285;}
        .em-input:focus{border-color:rgba(74,133,200,0.55);}
        .em-textarea{background:rgba(9,24,40,0.9);border:1px solid rgba(74,133,200,0.22);
          border-radius:9px;padding:14px;color:#e8f1f8;font-family:'Nunito',sans-serif;
          font-size:13px;line-height:1.75;outline:none;transition:border-color .2s;
          width:100%;resize:vertical;}
        .em-textarea:focus{border-color:rgba(74,133,200,0.55);}
        .em-select{background:rgba(9,24,40,0.9);border:1px solid rgba(74,133,200,0.22);
          border-radius:9px;padding:10px 14px;color:#e8f1f8;font-family:'Nunito',sans-serif;
          font-size:14px;outline:none;cursor:pointer;width:100%;}
        .em-btn-primary{background:linear-gradient(135deg,#3a7fc1,#2563a8);border:none;
          border-radius:9px;color:#e8f1f8;font-family:'Nunito',sans-serif;font-weight:800;
          font-size:14px;padding:10px 24px;cursor:pointer;
          box-shadow:0 4px 16px rgba(37,99,168,0.35);transition:transform .15s,box-shadow .15s;}
        .em-btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(37,99,168,0.5);}
        .em-btn-primary:disabled{opacity:.5;cursor:not-allowed;}
        .em-btn-ghost{background:transparent;border:1px solid rgba(74,133,200,0.28);border-radius:8px;
          color:#6baed6;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;
          padding:8px 18px;cursor:pointer;transition:background .15s;}
        .em-btn-ghost:hover{background:rgba(74,133,200,0.1);}
        .em-btn-success{background:linear-gradient(135deg,#16a34a,#15803d);border:none;
          border-radius:9px;color:#e8f1f8;font-family:'Nunito',sans-serif;font-weight:800;
          font-size:14px;padding:10px 28px;cursor:pointer;
          box-shadow:0 4px 16px rgba(22,163,74,0.35);transition:transform .15s,box-shadow .15s;}
        .em-btn-success:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(22,163,74,0.5);}
        .em-btn-success:disabled{opacity:.5;cursor:not-allowed;}
        .em-tile{background:rgba(9,24,40,0.8);border-radius:14px;padding:1.75rem 1.5rem;
          cursor:pointer;position:relative;overflow:hidden;
          transition:transform .18s,box-shadow .18s,border-color .18s;border:1px solid;}
        .em-tile:hover{transform:translateY(-4px);}
        .em-tile .glow-orb{position:absolute;top:-30px;right:-30px;width:120px;height:120px;
          border-radius:50%;filter:blur(30px);pointer-events:none;opacity:.6;}
        .venue-check-row{display:flex;align-items:center;gap:12px;padding:11px 14px;
          background:rgba(9,24,40,0.7);border:1px solid rgba(74,133,200,0.08);
          border-radius:10px;cursor:pointer;transition:background .15s,border-color .15s;}
        .venue-check-row:hover{background:rgba(9,24,40,1);border-color:rgba(74,133,200,0.25);}
        .venue-check-row.checked{border-color:rgba(74,133,200,0.4);background:rgba(58,127,193,0.07);}
        .venue-check-row.no-email{opacity:.45;cursor:not-allowed;}
        label.em-label{display:block;color:#7aa5c4;font-size:12px;font-weight:700;
          margin-bottom:6px;letter-spacing:0.04em;}
        .send-result-row{display:flex;align-items:center;gap:10px;padding:8px 12px;
          border-radius:8px;font-size:13px;font-weight:600;margin-bottom:6px;}
        /* Custom checkbox */
        .em-checkbox{width:18px;height:18px;border-radius:5px;border:2px solid rgba(74,133,200,0.4);
          background:rgba(9,24,40,0.9);appearance:none;cursor:pointer;
          flex-shrink:0;transition:all .15s;position:relative;}
        .em-checkbox:checked{background:#3a7fc1;border-color:#3a7fc1;}
        .em-checkbox:checked::after{content:'✓';position:absolute;top:50%;left:50%;
          transform:translate(-50%,-50%);color:#e8f1f8;font-size:11px;font-weight:800;}
        .em-checkbox:disabled{opacity:.35;cursor:not-allowed;}
      `}</style>

      <div className="em-wrap">
        <div style={{maxWidth:1200,margin:'0 auto'}}>

          {/* ── TILE GRID ─────────────────────────────────────────────────── */}
          {!activeTemplate && (
            <>
              <div style={{marginBottom:'1.75rem'}}>
                <h1 style={{fontFamily:"'Bebas Neue',cursive",fontWeight:400,
                  fontSize:'clamp(1.8rem,3vw,2.4rem)',letterSpacing:'0.06em',
                  color:'#ffffff',margin:0,lineHeight:1}}>Email Templates</h1>
                <p style={{color:'#3d6285',margin:'5px 0 0',fontSize:13,fontWeight:600}}>
                  Select a template to edit or send to venues on a Run
                </p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:18}}>
                {TEMPLATE_TILES.map(t => {
                  const isSaved = !!templates[t.id];
                  return (
                    <div key={t.id} className="em-tile" style={{borderColor:t.border}}
                      onClick={()=>openTemplate(t.id)}>
                      <div className="glow-orb" style={{background:t.glow}}/>
                      {isSaved && (
                        <div style={{position:'absolute',top:12,right:12,
                          background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.3)',
                          borderRadius:99,padding:'2px 10px',color:'#22c55e',fontSize:11,fontWeight:700}}>
                          Saved
                        </div>
                      )}
                      <div style={{width:40,height:4,borderRadius:99,background:t.accent,marginBottom:16}}/>
                      <div style={{color:'#ffffff',fontWeight:800,fontSize:15,marginBottom:6,lineHeight:1.3}}>
                        {t.name}
                      </div>
                      <div style={{color:'#3d6285',fontSize:13,marginBottom:18,fontWeight:600}}>
                        {t.description}
                      </div>
                      <span style={{background:t.glow,border:`1px solid ${t.border}`,
                        borderRadius:7,padding:'5px 14px',color:t.accent,fontSize:12,fontWeight:700}}>
                        Open Template
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── EDIT / SEND VIEW ──────────────────────────────────────────── */}
          {activeTemplate && tile && (
            <>
              {/* Header row */}
              <div style={{display:'flex',alignItems:'center',gap:14,
                flexWrap:'wrap',marginBottom:'1.5rem'}}>
                <button className="em-btn-ghost"
                  onClick={()=>{setActiveTemplate(null);setSelectedCampaign(null);}}>
                  ← Templates
                </button>
                <h1 style={{fontFamily:"'Bebas Neue',cursive",fontWeight:400,flex:1,
                  fontSize:'clamp(1.5rem,3vw,2rem)',letterSpacing:'0.06em',
                  color:'#ffffff',margin:0,lineHeight:1}}>
                  {tile.name}
                </h1>
                {/* Edit / Send toggle */}
                <div style={{display:'flex',background:'rgba(9,24,40,0.9)',
                  border:'1px solid rgba(74,133,200,0.2)',borderRadius:10,overflow:'hidden'}}>
                  {(['edit','send'] as const).map(v=>(
                    <button key={v} onClick={()=>setView(v)}
                      style={{padding:'8px 22px',border:'none',cursor:'pointer',
                        background:view===v?'rgba(58,127,193,0.25)':'transparent',
                        color:view===v?'#e8f1f8':'#3d6285',
                        fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,
                        textTransform:'capitalize',transition:'all .15s'}}>
                      {v==='edit'?'Edit Template':'Send to Venues'}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── EDIT TAB ────────────────────────────────────────────── */}
              {view==='edit' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 260px',gap:20}}>
                  {/* Editor */}
                  <div style={{background:'rgba(9,24,40,0.8)',border:'1px solid rgba(74,133,200,0.12)',
                    borderRadius:14,padding:'1.5rem'}}>
                    <div style={{marginBottom:14}}>
                      <label className="em-label">Subject Line</label>
                      <input className="em-input" value={editSubject}
                        onChange={e=>setEditSubject(e.target.value)} placeholder="Email subject…"/>
                    </div>
                    <div>
                      <label className="em-label">Message Body</label>
                      <textarea className="em-textarea" style={{minHeight:400}}
                        value={editBody} onChange={e=>setEditBody(e.target.value)}/>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:12,marginTop:14,flexWrap:'wrap'}}>
                      <button className="em-btn-primary" onClick={saveTemplate} disabled={saving}>
                        {saving?'Saving…':'Save Template'}
                      </button>
                      <button className="em-btn-success" onClick={()=>setView('send')}>
                        Send to Venues →
                      </button>
                      {saveMsg && (
                        <span style={{color:saveMsg==='Saved'?'#22c55e':'#f87171',fontSize:13,fontWeight:700}}>
                          {saveMsg==='Saved'?'✓ Saved':'✕ '+saveMsg}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Variable reference */}
                  <div style={{background:'rgba(9,24,40,0.6)',border:'1px solid rgba(74,133,200,0.1)',
                    borderRadius:14,padding:'1.25rem'}}>
                    <div style={{color:'#ffffff',fontWeight:800,fontSize:13,marginBottom:10}}>
                      Template Variables
                    </div>
                    <p style={{color:'#3d6285',fontSize:12,marginBottom:14,lineHeight:1.6}}>
                      These are filled in automatically per-venue when you send.
                    </p>
                    {[
                      ['{{venue_name}}',     'Venue name'],
                      ['{{city}}',           'City'],
                      ['{{state}}',          'State'],
                      ['{{booking_contact}}','Booking contact'],
                      ['{{tour_dates}}',     'Run date range'],
                      ['{{tour_name}}',      'Run name'],
                      ['{{band_name}}',      'Your band name'],
                      ['{{sender_name}}',    'Your name'],
                      ['{{sender_email}}',   'Your email'],
                      ['{{show_date}}',      'Show date'],
                      ['{{show_time}}',      'Show time'],
                    ].map(([v,label])=>(
                      <div key={v} style={{display:'flex',justifyContent:'space-between',
                        alignItems:'center',padding:'5px 0',
                        borderBottom:'1px solid rgba(74,133,200,0.07)'}}>
                        <code style={{color:tile.accent,fontSize:11,fontWeight:700}}>{v}</code>
                        <span style={{color:'#3d6285',fontSize:11}}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── SEND TAB ────────────────────────────────────────────── */}
              {view==='send' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>

                  {/* LEFT: Run picker + venue checklist */}
                  <div style={{display:'flex',flexDirection:'column',gap:16}}>

                    {/* Step 1: Pick a Run */}
                    <div style={{background:'rgba(9,24,40,0.8)',
                      border:'1px solid rgba(74,133,200,0.12)',borderRadius:14,padding:'1.25rem'}}>
                      <div style={{color:'#ffffff',fontWeight:800,fontSize:14,marginBottom:4}}>
                        Step 1 — Choose a Run
                      </div>
                      <p style={{color:'#3d6285',fontSize:12,margin:'0 0 12px',lineHeight:1.6}}>
                        Select the Run you're booking for. Only venues in that Run will appear below.
                      </p>
                      <select className="em-select"
                        value={selectedCampaign?.id||''}
                        onChange={e=>{
                          const c=campaigns.find(x=>x.id===e.target.value)||null;
                          if(c) selectCampaign(c); else { setSelectedCampaign(null); setRunVenues([]); }
                        }}>
                        <option value="">— Select a Run —</option>
                        {campaigns.map(c=>(
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {selectedCampaign && (
                        <div style={{marginTop:10,display:'flex',gap:8,flexWrap:'wrap'}}>
                          {selectedCampaign.cities?.map(city=>(
                            <span key={city} style={{background:'rgba(74,133,200,0.1)',
                              border:'1px solid rgba(74,133,200,0.2)',borderRadius:99,
                              padding:'2px 10px',color:'#6baed6',fontSize:11,fontWeight:700}}>
                              {city}
                            </span>
                          ))}
                          {selectedCampaign.date_range_start && (
                            <span style={{color:'#3d6285',fontSize:12,fontWeight:600,alignSelf:'center'}}>
                              {fmtDate(selectedCampaign.date_range_start)}
                              {selectedCampaign.date_range_end && ` → ${fmtDate(selectedCampaign.date_range_end)}`}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Step 2: Select venues */}
                    {selectedCampaign && (
                      <div style={{background:'rgba(9,24,40,0.8)',
                        border:'1px solid rgba(74,133,200,0.12)',borderRadius:14,padding:'1.25rem',flex:1}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                          <div>
                            <div style={{color:'#ffffff',fontWeight:800,fontSize:14}}>
                              Step 2 — Select Venues
                            </div>
                            <div style={{color:'#3d6285',fontSize:12,marginTop:2}}>
                              {runVenues.length} venues in this run ·{' '}
                              <span style={{color:checkedWithEmail.length>0?'#22c55e':'#3d6285'}}>
                                {checkedWithEmail.length} selected with email
                              </span>
                            </div>
                          </div>
                          <div style={{display:'flex',gap:8}}>
                            <button className="em-btn-ghost" style={{padding:'5px 12px',fontSize:12}}
                              onClick={checkAll}>All</button>
                            <button className="em-btn-ghost" style={{padding:'5px 12px',fontSize:12}}
                              onClick={checkNone}>None</button>
                          </div>
                        </div>

                        {loadingVenues ? (
                          <div style={{textAlign:'center',padding:'2rem',color:'#3d6285',fontSize:13}}>
                            Loading venues…
                          </div>
                        ) : runVenues.length===0 ? (
                          <div style={{textAlign:'center',padding:'2rem',
                            border:'1px dashed rgba(74,133,200,0.15)',borderRadius:10,
                            color:'#3d6285',fontSize:13}}>
                            No venues in this run yet. Add venues in Runs & Tours.
                          </div>
                        ) : (
                          <div style={{display:'flex',flexDirection:'column',gap:7,maxHeight:420,overflowY:'auto'}}>
                            {runVenues.map(cv=>{
                              const hasEmail = !!cv.venue.email;
                              const isChecked= checkedIds.has(cv.id);
                              const sc = STATUS_CFG[cv.status]||STATUS_CFG['contact?'];
                              return (
                                <div key={cv.id}
                                  className={`venue-check-row${isChecked?' checked':''}${!hasEmail?' no-email':''}`}
                                  onClick={()=>hasEmail&&toggleCheck(cv.id)}
                                  onMouseEnter={()=>hasEmail&&setPreviewVenue(cv)}
                                  onMouseLeave={()=>setPreviewVenue(null)}>
                                  <input type="checkbox" className="em-checkbox"
                                    checked={isChecked} disabled={!hasEmail}
                                    onChange={()=>hasEmail&&toggleCheck(cv.id)}
                                    onClick={e=>e.stopPropagation()}/>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{color:'#ffffff',fontWeight:800,fontSize:13,
                                      whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                                      {cv.venue.name}
                                    </div>
                                    <div style={{color:'#3d6285',fontSize:11,fontWeight:600}}>
                                      {cv.venue.city}, {cv.venue.state}
                                    </div>
                                  </div>
                                  {/* Email / no-email indicator */}
                                  <div style={{flexShrink:0,fontSize:11,fontWeight:700,
                                    color:hasEmail?'#22c55e':'#f87171'}}>
                                    {hasEmail?'✉':'No email'}
                                  </div>
                                  {/* Status badge */}
                                  <div style={{flexShrink:0,color:sc.color,
                                    fontSize:10,fontWeight:700,
                                    border:`1px solid ${sc.color}44`,
                                    borderRadius:99,padding:'2px 8px',
                                    background:`${sc.color}11`}}>
                                    {sc.label}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Send button */}
                        {checkedWithEmail.length>0 && !bulkSending && sendResults.length===0 && (
                          <button className="em-btn-success"
                            style={{width:'100%',marginTop:14,padding:13,fontSize:15}}
                            onClick={sendBulk}>
                            ✉ Send to {checkedWithEmail.length} Venue{checkedWithEmail.length!==1?'s':''}
                          </button>
                        )}

                        {/* Progress */}
                        {bulkSending && (
                          <div style={{marginTop:14}}>
                            <div style={{display:'flex',justifyContent:'space-between',
                              color:'#7aa5c4',fontSize:12,fontWeight:700,marginBottom:6}}>
                              <span>Sending…</span>
                              <span>{sendProgress} / {checkedWithEmail.length}</span>
                            </div>
                            <div style={{height:6,background:'rgba(255,255,255,0.06)',
                              borderRadius:99,overflow:'hidden'}}>
                              <div style={{height:'100%',borderRadius:99,
                                width:`${(sendProgress/checkedWithEmail.length)*100}%`,
                                background:'linear-gradient(90deg,#3a7fc1,#22c55e)',
                                transition:'width .3s'}}/>
                            </div>
                          </div>
                        )}

                        {/* Results */}
                        {sendResults.length>0 && !bulkSending && (
                          <div style={{marginTop:14}}>
                            <div style={{color:'#ffffff',fontWeight:800,fontSize:13,marginBottom:8}}>
                              Send Results
                            </div>
                            <div style={{maxHeight:200,overflowY:'auto'}}>
                              {sendResults.map(r=>(
                                <div key={r.venueId} className="send-result-row"
                                  style={{background:r.success?'rgba(34,197,94,0.07)':'rgba(248,113,113,0.07)',
                                    border:`1px solid ${r.success?'rgba(34,197,94,0.2)':'rgba(248,113,113,0.2)'}`}}>
                                  <span style={{color:r.success?'#22c55e':'#f87171',fontSize:16}}>
                                    {r.success?'✓':'✕'}
                                  </span>
                                  <span style={{color:'#e8f1f8',flex:1}}>{r.venueName}</span>
                                  {r.error && <span style={{color:'#f87171',fontSize:11}}>{r.error}</span>}
                                </div>
                              ))}
                            </div>
                            <button className="em-btn-ghost" style={{marginTop:10,width:'100%'}}
                              onClick={()=>{setSendResults([]);setCheckedIds(new Set());}}>
                              Done
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* RIGHT: Live preview */}
                  <div style={{background:'rgba(9,24,40,0.8)',
                    border:'1px solid rgba(74,133,200,0.12)',borderRadius:14,
                    padding:'1.25rem',display:'flex',flexDirection:'column',gap:12}}>
                    <div style={{color:'#ffffff',fontWeight:800,fontSize:14}}>
                      {previewVenue ? `Preview — ${previewVenue.venue.name}` : 'Email Preview'}
                    </div>
                    {!previewVenue && (
                      <p style={{color:'#3d6285',fontSize:12,margin:0,lineHeight:1.6}}>
                        Hover over a venue to see how the email will look for that venue,
                        with all variables filled in automatically.
                      </p>
                    )}
                    {/* Subject preview */}
                    <div style={{background:'rgba(74,133,200,0.05)',
                      border:'1px solid rgba(74,133,200,0.12)',
                      borderRadius:8,padding:'10px 14px'}}>
                      <div style={{color:'#3d6285',fontSize:11,fontWeight:700,
                        textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>
                        Subject
                      </div>
                      <div style={{color:'#e8f1f8',fontSize:13,fontWeight:600}}>
                        {previewSubject || <span style={{color:'#3d6285',fontStyle:'italic'}}>No subject yet</span>}
                      </div>
                    </div>
                    {/* Body preview */}
                    <div style={{background:'rgba(9,24,40,0.5)',
                      border:'1px solid rgba(74,133,200,0.08)',
                      borderRadius:8,padding:'14px',flex:1,overflowY:'auto',
                      maxHeight:460}}>
                      <pre style={{color:'#7aa5c4',fontSize:12,lineHeight:1.75,
                        whiteSpace:'pre-wrap',fontFamily:"'Nunito',sans-serif",margin:0}}>
                        {previewBody || <span style={{color:'#3d6285',fontStyle:'italic'}}>No body yet</span>}
                      </pre>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
}
