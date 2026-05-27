import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0E1628',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: '#F5EDD9', marginBottom: '1rem', fontFamily: 'sans-serif' }}>Something went wrong</h2>
          <p style={{ color: '#6B8FB5', marginBottom: '2rem', maxWidth: '400px', fontFamily: 'sans-serif' }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 2rem', background: '#E8602A',
              color: '#F5EDD9', border: 'none', borderRadius: '8px',
              fontWeight: 700, cursor: 'pointer', fontSize: '1rem',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
