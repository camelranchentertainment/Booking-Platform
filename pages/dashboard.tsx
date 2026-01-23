export default function DashboardPage() {
  return (
    <div style={{ padding: '2rem', background: '#F5F5F0', minHeight: '100vh' }}>
      <div style={{ background: '#5D4E37', color: 'white', padding: '2rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Test Dashboard</h1>
      </div>
      <p>If you see ONE header above, the problem is fixed.</p>
      <p>If you see MULTIPLE cascading headers, the problem is NOT in ProtectedRoute.</p>
    </div>
  );
}
