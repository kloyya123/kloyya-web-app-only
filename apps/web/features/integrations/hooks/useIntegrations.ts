import { useState, useEffect } from 'react';

export function useIntegrations() {
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/v1/integrations');
        const data = await res.json();
        if (data.connectedApps) {
          setConnectedApps(data.connectedApps);
        }
      } catch (error) {
        console.error('Failed to fetch integration status', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStatus();
    
    // Optionnel : Re-vérifier si on revient sur la page après une redirection OAuth
    window.addEventListener('focus', fetchStatus);
    return () => window.removeEventListener('focus', fetchStatus);
  }, []);

  const isConnected = (appName: string) => {
    return connectedApps.includes(appName.toLowerCase());
  };

  return { connectedApps, isConnected, isLoading };
}
