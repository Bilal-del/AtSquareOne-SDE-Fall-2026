import { useEffect, useState } from 'react';
import apiClient from '../api/client';

interface HealthStatus {
  status: string;
  message: string;
}

function HealthCheck() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await apiClient.get('/health/');
        setHealth(response.data);
      } catch (err) {
        setError('Failed to connect to backend');
        console.error(err);
      }
    };

    checkHealth();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Backend Health Check</h2>
      {health && (
        <div style={{ color: 'green' }}>
          <p>Status: {health.status}</p>
          <p>Message: {health.message}</p>
        </div>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}

export default HealthCheck;