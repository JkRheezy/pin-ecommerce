export default function Home() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>PIN Store</h1>
      <p>AI-powered PIN badge store</p>
      
      <div style={{ marginTop: '2rem' }}>
        <h2>API Endpoints</h2>
        <ul>
          <li><code>GET /api/products</code> - List products</li>
          <li><code>POST /api/products</code> - Create product</li>
          <li><code>GET /api/orders</code> - List orders</li>
          <li><code>POST /api/orders</code> - Create order</li>
          <li><code>GET /api/ai-jobs</code> - List AI jobs</li>
          <li><code>POST /api/ai-jobs</code> - Trigger AI task</li>
        </ul>
      </div>
    </main>
  )
}
