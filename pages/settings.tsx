import { useState, useEffect } from 'react';
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

export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
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
    } catch (error) {
      console.error('Auth error:', error);
      router.push('/');
    }
  };

  const loadBandData = async (userId: string) => {
    try {
      // First, get user's band_id from band_members
      const { data: memberData, error: memberError } = await supabase
        .from('band_members')
        .select('band_id')
        .eq('user_id', userId)
        .single();

      if (memberError) throw memberError;

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

      // Get band members with their profile info
      const { data: membersData, error: membersError } = await supabase
        .from('band_members')
        .select(`
          id,
          user_id,
          role,
          invited_at,
          accepted_at,
          profiles!inner(display_name)
        `)
        .eq('band_id', bandData.id);

      if (membersError) throw membersError;

      setMembers(membersData || []);
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
    try {
      // Simple approach: User must already exist and we'll search profiles
      // In production, you'd want a proper invitation system
      alert('Team member invitation feature coming soon! For now, have the user create an account first, then contact support to be added to your band.');
      setInviteEmail('');
      setShowInviteForm(false);
    } catch (error) {
      console.error('Error inviting member:', error);
      alert('Failed to add team member');
    }
  };

  const removeMember = async (memberId: string) => {
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
    return <div style={{ padding: '2rem', color: '#E8DCC4' }}>Loading...</div>;
  }

  const isOwner = band.owner_user_id === user.id;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #2C1810 0%, #3D2817 50%, #2C1810 100%)',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{
        background: '#5D4E37',
        padding: '1rem 2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
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
              color: '#C8A882',
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
          color: '#C8A882',
          fontSize: '2.5rem',
          marginBottom: '2rem'
        }}>
          Settings
        </h1>

        {/* Personal Profile Section */}
        <div style={{
          background: 'rgba(61, 40, 23, 0.6)',
          border: '2px solid #5C4A3A',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h2 style={{ color: '#C8A882', fontSize: '1.8rem', marginBottom: '1.5rem' }}>
            Your Profile
          </h2>
          <form onSubmit={updateProfile}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                color: '#C8A882',
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
                  border: '2px solid #5C4A3A',
                  borderRadius: '6px',
                  background: 'rgba(245, 245, 240, 0.1)',
                  color: '#E8DCC4',
                  fontSize: '1rem'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                color: '#9B8A7A',
                marginBottom: '0.5rem'
              }}>
                Email: {user.email}
              </label>
            </div>
            <button
              type="submit"
              style={{
                padding: '0.75rem 2rem',
                background: '#87AE73',
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
            background: 'rgba(61, 40, 23, 0.6)',
            border: '2px solid #5C4A3A',
            borderRadius: '12px',
            padding: '2rem',
            marginBottom: '2rem'
          }}>
            <h2 style={{ color: '#C8A882', fontSize: '1.8rem', marginBottom: '1.5rem' }}>
              Band Information
            </h2>
            <form onSubmit={updateBandInfo}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#C8A882',
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
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#C8A882',
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
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#C8A882',
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
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#C8A882',
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
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#C8A882',
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
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
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
                  background: '#87AE73',
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
          background: 'rgba(61, 40, 23, 0.6)',
          border: '2px solid #5C4A3A',
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
            <h2 style={{ color: '#C8A882', fontSize: '1.8rem', margin: 0 }}>
              Team Members
            </h2>
            {isOwner && (
              <button
                onClick={() => setShowInviteForm(!showInviteForm)}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: '#87AE73',
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
                color: '#C8A882',
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
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#87AE73',
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
                    border: '2px solid #708090',
                    borderRadius: '6px',
                    color: '#708090',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
              <p style={{ color: '#9B8A7A', fontSize: '0.85rem', marginTop: '0.5rem', margin: '0.5rem 0 0 0' }}>
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
                  borderBottom: '1px solid #5C4A3A',
                  color: '#E8DCC4'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {member.profiles?.[0]?.display_name || 'Band Member'}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#9B8A7A' }}>
                    {member.user_id === user.id ? user.email : 'Team Member'}
                  </div>
                  <div style={{
                    display: 'inline-block',
                    marginTop: '0.25rem',
                    padding: '0.25rem 0.75rem',
                    background: member.role === 'owner' ? '#87AE73' : '#5C4A3A',
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
                      background: '#C85050',
                      border: 'none',
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

        {/* Calendar Integration Section */}
        <div style={{
          background: 'rgba(61, 40, 23, 0.6)',
          border: '2px solid #5C4A3A',
          borderRadius: '12px',
          padding: '2rem'
        }}>
          <h2 style={{ color: '#C8A882', fontSize: '1.8rem', marginBottom: '1.5rem' }}>
            Calendar Integration
          </h2>
          <div style={{
            background: 'rgba(135, 174, 115, 0.2)',
            border: '1px solid #87AE73',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{ color: '#87AE73', margin: 0 }}>
              🚧 Coming Soon: Connect your Google Calendar, Outlook, or iCal to sync bookings automatically!
            </p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); alert('Calendar integration coming soon!'); }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                color: '#C8A882',
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}>
                Calendar Type
              </label>
              <select
                value={calendarType}
                onChange={(e) => setCalendarType(e.target.value)}
                disabled
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #5C4A3A',
                  borderRadius: '6px',
                  background: 'rgba(245, 245, 240, 0.1)',
                  color: '#9B8A7A',
                  fontSize: '1rem',
                  cursor: 'not-allowed'
                }}
              >
                <option value="">Select calendar service...</option>
                <option value="google">Google Calendar</option>
                <option value="outlook">Outlook/Microsoft 365</option>
                <option value="ical">iCal URL</option>
              </select>
            </div>
            <button
              type="submit"
              disabled
              style={{
                padding: '0.75rem 2rem',
                background: '#708090',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'not-allowed',
                opacity: 0.6
              }}
            >
              Connect Calendar (Coming Soon)
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
