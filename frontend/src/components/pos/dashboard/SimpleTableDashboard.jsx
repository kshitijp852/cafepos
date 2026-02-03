import React, { useState, useEffect } from 'react';

export const SimpleTableDashboard = ({ cafeId }) => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTables();
  }, [cafeId]);

  const loadTables = async () => {
    try {
      console.log('Loading tables for cafe:', cafeId);
      const response = await fetch(`http://localhost:8001/api/tables?cafe_id=${cafeId}`);
      const data = await response.json();
      console.log('Tables loaded:', data);
      setTables(data);
    } catch (err) {
      console.error('Error loading tables:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading tables...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
        <p>Error: {error}</p>
        <button onClick={loadTables}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>Restaurant Tables</h2>
      <p>Cafe ID: {cafeId}</p>
      <p>Found {tables.length} tables</p>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', 
        gap: '15px',
        marginTop: '20px'
      }}>
        {tables.map(table => (
          <div 
            key={table.id}
            style={{
              border: '2px solid #ccc',
              borderRadius: '8px',
              padding: '15px',
              textAlign: 'center',
              backgroundColor: '#f9f9f9',
              cursor: 'pointer',
              minHeight: '100px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
            onClick={() => alert(`Clicked ${table.name}`)}
          >
            <h3 style={{ margin: '0 0 5px 0' }}>{table.name}</h3>
            <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
              {table.capacity} seats
            </p>
            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
              {table.status}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};