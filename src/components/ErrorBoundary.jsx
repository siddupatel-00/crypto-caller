import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('ErrorBoundary:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-deep)', color: 'var(--text-primary)', padding: 24, textAlign: 'center' }}>
          <div className="glass-card" style={{ padding: 32, maxWidth: 480 }}>
            <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>{String(this.state.error?.message || 'Unknown error')}</p>
            <button onClick={() => { this.setState({ hasError: false }); window.location.href = '/'; }} style={{ padding: '12px 24px', borderRadius: 12, background: 'var(--primary)', color: '#fff', fontWeight: 600 }}>Reload App</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
