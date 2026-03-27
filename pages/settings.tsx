import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

interface Profile {
  display_name: string;
}

interface BandMember {
  id: string;
  user_id: string;
  role: string;
  invited_at: string;
  accepted_at: string | null;
  profiles: Profile[];
}

interface Band {
  id: string;
  band_name: string;
  owner_user_id: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  bio: string;
}

interface AuthUser {
  id: string;
  email: string;
}

export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [band, setBand] = useState<Band | null>(null);
  const [members, setMembers] = useState<BandMember[]>([]);
  
  // Band info form
  const [bandName, setBandName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [bio, setBio] = useState('');
  
  // Profile form
  const [displayName, setDisplayName] = useState('');
  
  // Invite member
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  
  // Calendar integration
  const [calendarType, setCalendarType] = useState('');
  const [calendarApiKey, setCalendarApiKey] = useState('');
  const [calendarRefreshToken, setCalendarRefreshToken] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [googleConnected, setGoogleConnected] = useState(false);
  const [calendarSaveMsg, setCalendarSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // SMTP Email Configuration
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const loggedInUser = localStorage.getItem('loggedInUser');
      if (!loggedInUser) {
        router.push('/');
        return;
      }

      const userData = JSON.parse(loggedInUser);
      setUser(userData);

      await loadBandData(userData.id);
      await loadProfile(userData.id);
      await loadCalendarSettings(userData.id);
      await loadSmtpSettings(userData.id);

      // Handle OAuth redirect result
      const params = new URLSearchParams(window.location.search);
      const calResult = params.get('calendar');
      if (calResult === 'connected') {
        setGoogleConnected(true);
        setCalendarSaveMsg({ ok: true, text: '✓ Google Calendar connected successfully!' });
        router.replace('/settings', undefined, { shallow: true });
      } else if (calResult === 'error') {
        const msg = params.get('message') || 'Connection failed';
        setCalendarSaveMsg({ ok: false, text: `✗ ${msg}` });
        router.replace('/settings', undefined, { shallow: true });
      }
    } catch (error) {
      console.error('Auth error:', error);
      router.push('/');
    }
  };

  const loadBandData = async (userId: string) => {
    try {
      // First, get user's band_id from band_members (get first band if multiple)
      const { data: memberData, error: memberError } = await supabase
        .from('band_members')
        .select('band_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (memberError) throw memberError;
      
      if (!memberData) {
        console.log('User is not a member of any band');
        return;
      }

      // Then get the band details
      const { data: bandData, error: bandError } = await supabase
        .from('bands')
        .select('*')
        .eq('id', memberData.band_id)
        .single();

      if (bandError) throw bandError;
      
      setBand(bandData);
      setBandName(bandData.band_name || '');
      setContactEmail(bandData.contact_email || '');
      setContactPhone(bandData.contact_phone || '');
      setWebsite(bandData.website || '');
      setBio(bandData.bio || '');

      // Get band members - simpler query without joins
      const { data: membersData, error: membersError } = await supabase
        .from('band_members')
        .select('id, user_id, role, invited_at, accepted_at')
        .eq('band_id', bandData.id);

      if (membersError) throw membersError;

      // Get profiles separately for each member
      const membersWithProfiles = await Promise.all(
        (membersData || []).map(async (member) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', member.user_id)
            .maybeSingle();

          return {
            ...member,
            profiles: profile ? [profile] : []
          };
        })
      );

      setMembers(membersWithProfiles);
    } catch (error) {
      console.error('Error loading band:', error);
    }
  };

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setDisplayName(data.display_name || '');
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const loadCalendarSettings = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_calendar_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        if (data.calendar_type === 'google_oauth' && data.is_active !== false) {
          setGoogleConnected(true);
        }
        setCalendarType(data.calendar_type || '');
        setCalendarApiKey(data.calendar_api_key || '');
        setCalendarRefreshToken(data.google_refresh_token || '');
        setIcalUrl(data.ical_url || '');
      }
    } catch (error) {
      console.error('Error loading calendar settings:', error);
    }
  };

  const loadSmtpSettings = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_email_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSmtpHost(data.smtp_host || 'smtp.gmail.com');
        setSmtpPort(data.smtp_port?.toString() || '587');
        setSmtpEmail(data.email_address || '');
        setSmtpPassword(''); // never pre-fill encrypted password
        setSmtpFromName(data.display_name || '');
      }
    } catch (error) {
      console.error('Error loading email settings:', error);
    }
  };

  const updateBandInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('bands')
        .update({
          band_name: bandName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          website: website,
          bio: bio,
          updated_at: new Date().toISOString()
        })
        .eq('id', band!.id);

      if (error) throw error;
      alert('Band info updated successfully!');
    } catch (error) {
      console.error('Error updating band:', error);
      alert('Failed to update band info');
    }
  };

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id);

      if (error) throw error;
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    }
  };

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !band) return;
    
    try {
      alert(`To add a team member:
1. Have them create an account at your site
2. They need to share their User ID with you
3. You can find your User ID in the browser console: localStorage.getItem('loggedInUser')

For now, please provide their User ID instead of email.`);
      
      const userId = prompt('Enter their User ID (UUID):');
      if (!userId) {
        setShowInviteForm(false);
        return;
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('band_members')
        .select('id')
        .eq('band_id', band.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingMember) {
        alert('This user is already a member of your band.');
        return;
      }

      // Add member
      const { error } = await supabase
        .from('band_members')
        .insert({
          band_id: band.id,
          user_id: userId,
          role: 'member',
          invited_by: user.id,
          accepted_at: new Date().toISOString()
        });

      if (error) throw error;

      alert('Team member added successfully!');
      setInviteEmail('');
      setShowInviteForm(false);
      await loadBandData(user.id);
    } catch (error) {
      console.error('Error inviting member:', error);
      alert('Failed to add team member. Please check the User ID and try again.');
    }
  };

  const removeMember = async (memberId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to remove this team member?')) return;

    try {
      const { error } = await supabase
        .from('band_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      alert('Team member removed successfully!');
      await loadBandData(user.id);
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove team member');
    }
  };

  if (!user || !band) {
    return <div style={{ padding: '2rem', color: '#7aa5c4', background: '#030d18', minHeight: '100vh' }}>Loading...</div>;
  }

  const isOwner = band.owner_user_id === user.id;

  return (
    <div style={{
      background: '#030d18',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(3,13,24,0.97)',
        padding: '1rem 2rem',
        borderBottom: '1px solid rgba(74,133,200,0.12)',
        backdropFilter: 'blur(16px)',
        marginBottom: '2rem'
      }}>
        <div style={{
          maxWidth: '1000px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <a
            href="/dashboard"
            style={{
              color: '#e8f1f8',
              textDecoration: 'none',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ← Back to Dashboard
          </a>
          <div style={{
            fontSize: '1.2rem',
            fontWeight: '600',
            color: 'white'
          }}>
            Camel Ranch Booking
          </div>
        </div>
      </div>
      
      <div style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '2rem'
      }}>
        <h1 style={{
          color: '#e8f1f8',
          fontSize: '2.5rem',
          marginBottom: '2rem'
        }}>
          Settings
        </h1>

        {/* Personal Profile Section */}
        <div style={{
          background: 'rgba(9,24,40,0.8)',
          border: '1px solid rgba(74,133,200,0.2)',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h2 style={{ color: '#e8f1f8', fontSize: '1.8rem', marginBottom: '1.5rem' }}>
            Your Profile
          </h2>
          <form onSubmit={updateProfile}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                color: '#e8f1f8',
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid rgba(74,133,200,0.2)',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e8f1f8',
                  fontSize: '1rem'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                color: '#7aa5c4',
                marginBottom: '0.5rem'
              }}>
                Email: {user.email}
              </label>
            </div>
            <button
              type="submit"
              style={{
                padding: '0.75rem 2rem',
                background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Update Profile
            </button>
          </form>
        </div>

        {/* Band Information Section - Only owner can edit */}
        {isOwner && (
          <div style={{
            background: 'rgba(9,24,40,0.8)',
            border: '1px solid rgba(74,133,200,0.2)',
            borderRadius: '12px',
            padding: '2rem',
            marginBottom: '2rem'
          }}>
            <h2 style={{ color: '#e8f1f8', fontSize: '1.8rem', marginBottom: '1.5rem' }}>
              Band Information
            </h2>
            <form onSubmit={updateBandInfo}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#e8f1f8',
                  marginBottom: '0.5rem',
                  fontWeight: '600'
                }}>
                  Band Name
                </label>
                <input
                  type="text"
                  value={bandName}
                  onChange={(e) => setBandName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid rgba(74,133,200,0.2)',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#e8f1f8',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#e8f1f8',
                  marginBottom: '0.5rem',
                  fontWeight: '600'
                }}>
                  Contact Email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid rgba(74,133,200,0.2)',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#e8f1f8',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#e8f1f8',
                  marginBottom: '0.5rem',
                  fontWeight: '600'
                }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid rgba(74,133,200,0.2)',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#e8f1f8',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#e8f1f8',
                  marginBottom: '0.5rem',
                  fontWeight: '600'
                }}>
                  Website
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid rgba(74,133,200,0.2)',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#e8f1f8',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#e8f1f8',
                  marginBottom: '0.5rem',
                  fontWeight: '600'
                }}>
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid rgba(74,133,200,0.2)',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#e8f1f8',
                    fontSize: '1rem',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  padding: '0.75rem 2rem',
                  background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Update Band Info
              </button>
            </form>
          </div>
        )}

        {/* Team Members Section */}
        <div style={{
          background: 'rgba(9,24,40,0.8)',
          border: '1px solid rgba(74,133,200,0.2)',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <h2 style={{ color: '#e8f1f8', fontSize: '1.8rem', margin: 0 }}>
              Team Members
            </h2>
            {isOwner && (
              <button
                onClick={() => setShowInviteForm(!showInviteForm)}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                + Add Member
              </button>
            )}
          </div>

          {showInviteForm && (
            <form onSubmit={inviteMember} style={{
              background: 'rgba(0,0,0,0.2)',
              padding: '1.5rem',
              borderRadius: '8px',
              marginBottom: '1.5rem'
            }}>
              <label style={{
                display: 'block',
                color: '#e8f1f8',
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}>
                Email Address
              </label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@email.com"
                  required
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: '1px solid rgba(74,133,200,0.2)',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#e8f1f8',
                    fontSize: '1rem'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Invite
                </button>
                <button
                  type="button"
                  onClick={() => setShowInviteForm(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'transparent',
                    border: '1px solid rgba(74,133,200,0.3)',
                    borderRadius: '6px',
                    color: '#7aa5c4',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
              <p style={{ color: '#7aa5c4', fontSize: '0.85rem', marginTop: '0.5rem', margin: '0.5rem 0 0 0' }}>
                Note: Team member invitation system coming soon
              </p>
            </form>
          )}

          <div>
            {members.map((member) => (
              <div
                key={member.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  borderBottom: '1px solid rgba(74,133,200,0.12)',
                  color: '#e8f1f8'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {member.profiles?.[0]?.display_name || 'Band Member'}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#7aa5c4' }}>
                    {member.user_id === user.id ? user.email : 'Team Member'}
                  </div>
                  <div style={{
                    display: 'inline-block',
                    marginTop: '0.25rem',
                    padding: '0.25rem 0.75rem',
                    background: member.role === 'owner' ? '#3a7fc1' : 'rgba(74,133,200,0.15)',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    textTransform: 'uppercase'
                  }}>
                    {member.role}
                  </div>
                </div>
                {isOwner && member.role !== 'owner' && (
                  <button
                    onClick={() => removeMember(member.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.4)',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Email SMTP Configuration Section */}
        <div style={{
          background: 'rgba(9,24,40,0.8)',
          border: '1px solid rgba(74,133,200,0.2)',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h2 style={{ color: '#e8f1f8', fontSize: '1.8rem', marginBottom: '1.5rem' }}>
            📧 Email Configuration
          </h2>
          <div style={{
            background: 'rgba(58,127,193,0.1)',
            border: '1px solid rgba(74,133,200,0.4)',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{ color: '#6baed6', margin: 0, marginBottom: '0.5rem' }}>
              Configure your email to send booking inquiries from YOUR email address
            </p>
            <p style={{ color: '#7aa5c4', margin: 0, fontSize: '0.9rem' }}>
              For Gmail: Use your email and an <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer" style={{color: '#6baed6'}}>App Password</a> (not your regular password)
            </p>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!user) return;
            try {
              const stored = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
              const token = stored.token;
              const res = await fetch('/api/email/settings', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                  userId:       user.id,
                  provider:     'smtp',
                  displayName:  smtpFromName || band?.band_name || '',
                  emailAddress: smtpEmail,
                  smtpHost,
                  smtpPort,
                  password:     smtpPassword,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Failed to save');
              alert('✓ Email settings saved successfully!');
            } catch (error) {
              console.error('Error saving email settings:', error);
              alert('Failed to save email settings');
            }
          }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                color: '#e8f1f8',
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}>
                Your Email Address
              </label>
              <input
                type="email"
                value={smtpEmail}
                onChange={(e) => {
                  setSmtpEmail(e.target.value);
                  // Auto-detect SMTP host/port from email domain
                  const domain = e.target.value.split('@')[1]?.toLowerCase() ?? '';
                  if (domain === 'gmail.com' || domain === 'googlemail.com') { setSmtpHost('smtp.gmail.com'); setSmtpPort('587'); }
                  else if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') { setSmtpHost('smtp-mail.outlook.com'); setSmtpPort('587'); }
                  else if (domain === 'yahoo.com' || domain === 'yahoo.co.uk') { setSmtpHost('smtp.mail.yahoo.com'); setSmtpPort('465'); }
                  else if (domain === 'icloud.com' || domain === 'me.com') { setSmtpHost('smtp.mail.me.com'); setSmtpPort('587'); }
                  else if (domain === 'protonmail.com' || domain === 'proton.me') { setSmtpHost('smtp.protonmail.com'); setSmtpPort('587'); }
                  else if (domain) { setSmtpHost(`smtp.${domain}`); setSmtpPort('587'); }
                }}
                placeholder="yourband@gmail.com"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid rgba(74,133,200,0.2)',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e8f1f8',
                  fontSize: '1rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                color: '#e8f1f8',
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}>
                Email App Password
              </label>
              <input
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder="••••••••••••••••"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid rgba(74,133,200,0.2)',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e8f1f8',
                  fontSize: '1rem'
                }}
              />
              <p style={{ color: '#7aa5c4', fontSize: '0.85rem', marginTop: '0.5rem', margin: '0.5rem 0 0 0' }}>
                For Gmail: Create an <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer" style={{color: '#6baed6'}}>App Password</a> in your Google Account settings
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                color: '#e8f1f8',
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}>
                Display Name (appears in "From" field)
              </label>
              <input
                type="text"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
                placeholder={band?.band_name || "Your Band Name"}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid rgba(74,133,200,0.2)',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e8f1f8',
                  fontSize: '1rem'
                }}
              />
            </div>

            <details style={{ marginBottom: '1.5rem' }}>
              <summary style={{ 
                color: '#e8f1f8', 
                cursor: 'pointer',
                fontWeight: '600',
                marginBottom: '1rem'
              }}>
                ⚙️ Advanced Settings
              </summary>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div>
                  <label style={{
                    display: 'block',
                    color: '#e8f1f8',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    fontSize: '0.9rem'
                  }}>
                    SMTP Host
                  </label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid rgba(74,133,200,0.2)',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#e8f1f8',
                      fontSize: '0.95rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    color: '#e8f1f8',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    fontSize: '0.9rem'
                  }}>
                    Port
                  </label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid rgba(74,133,200,0.2)',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#e8f1f8',
                      fontSize: '0.95rem'
                    }}
                  />
                </div>
              </div>
            </details>

            <button
              type="submit"
              style={{
                padding: '0.75rem 2rem',
                background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Save Email Settings
            </button>
          </form>
        </div>

        {/* Calendar Integration Section */}
        <div style={{
          background: 'rgba(9,24,40,0.8)',
          border: '1px solid rgba(74,133,200,0.2)',
          borderRadius: '12px',
          padding: '2rem'
        }}>
          <h2 style={{ color: '#e8f1f8', fontSize: '1.8rem', marginBottom: '1.5rem' }}>
            📅 Calendar Integration
          </h2>

          {/* Status message */}
          {calendarSaveMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              borderRadius: '8px',
              background: calendarSaveMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${calendarSaveMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`,
              color: calendarSaveMsg.ok ? '#22c55e' : '#f87171',
              fontWeight: 600, fontSize: 14,
            }}>
              {calendarSaveMsg.text}
            </div>
          )}

          {/* Google Calendar OAuth */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(74,133,200,0.15)',
            borderRadius: '10px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="rgba(74,133,200,0.2)" stroke="rgba(74,133,200,0.5)" strokeWidth="1.5"/>
                    <path d="M8 2v4M16 2v4M3 10h18" stroke="rgba(74,133,200,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 15 }}>Google Calendar</span>
                  {googleConnected && (
                    <span style={{
                      background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                      border: '1px solid rgba(34,197,94,0.3)',
                      borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                    }}>Connected</span>
                  )}
                </div>
                <p style={{ color: '#7aa5c4', margin: 0, fontSize: 13 }}>
                  {googleConnected
                    ? 'Your Google Calendar is connected. Bookings will be added automatically when you mark a venue as Booked.'
                    : 'Connect your Google Calendar to read events and automatically add show bookings.'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {googleConnected ? (
                  <button
                    onClick={async () => {
                      if (!user || !confirm('Disconnect Google Calendar?')) return;
                      await supabase
                        .from('user_calendar_settings')
                        .update({ is_active: false })
                        .eq('user_id', user.id)
                        .eq('calendar_type', 'google_oauth');
                      setGoogleConnected(false);
                      setCalendarSaveMsg({ ok: true, text: 'Google Calendar disconnected.' });
                    }}
                    style={{
                      padding: '8px 16px',
                      background: 'rgba(248,113,113,0.1)',
                      border: '1px solid rgba(248,113,113,0.3)',
                      borderRadius: 6, color: '#f87171',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (!user) return;
                      window.location.href = `/api/auth/google?userId=${user.id}`;
                    }}
                    style={{
                      padding: '10px 20px',
                      background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                      border: 'none', borderRadius: 6,
                      color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    Connect Google Calendar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* iCal URL fallback */}
          <details style={{ marginTop: '0.5rem' }}>
            <summary style={{
              color: '#4a85c8', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              userSelect: 'none', marginBottom: 12,
            }}>
              Other options (iCal URL)
            </summary>
            <form
              style={{ marginTop: 12 }}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!user || !icalUrl) return;
                try {
                  const { data: existing } = await supabase
                    .from('user_calendar_settings')
                    .select('id')
                    .eq('user_id', user.id)
                    .maybeSingle();

                  const payload = {
                    user_id:       user.id,
                    calendar_type: 'ical',
                    ical_url:      icalUrl,
                    is_active:     true,
                    updated_at:    new Date().toISOString(),
                  };

                  if (existing) {
                    await supabase.from('user_calendar_settings').update(payload).eq('user_id', user.id);
                  } else {
                    await supabase.from('user_calendar_settings').insert([payload]);
                  }
                  setCalendarSaveMsg({ ok: true, text: '✓ iCal URL saved.' });
                } catch (err) {
                  console.error(err);
                  setCalendarSaveMsg({ ok: false, text: '✗ Failed to save iCal URL.' });
                }
              }}
            >
              <label style={{ display: 'block', color: '#e8f1f8', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
                iCal URL
              </label>
              <input
                type="url"
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/..."
                style={{
                  width: '100%', padding: '0.75rem',
                  border: '1px solid rgba(74,133,200,0.2)',
                  borderRadius: 6, background: 'rgba(255,255,255,0.05)',
                  color: '#e8f1f8', fontSize: '1rem', marginBottom: 8,
                }}
              />
              <p style={{ color: '#7aa5c4', fontSize: 12, margin: '0 0 12px' }}>
                Read-only. Copy the iCal/webcal URL from your calendar app settings.
              </p>
              <button type="submit" style={{
                padding: '8px 20px',
                background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                border: 'none', borderRadius: 6,
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                Save iCal URL
              </button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
