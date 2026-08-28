'use client';
import { useState } from 'react';
import { Button, toast } from '@/components/ui';
import { ExternalLink, Loader2 } from 'lucide-react';

export function IntegrationCard({ appName, displayName, description, icon }: any) {
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const res = await fetch(`/api/v1/integrations/${appName}/connect`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        // Affiche le détail précis renvoyé par le backend
        throw new Error(data.details || data.error || 'Échec de la connexion');
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error('Pas d\'URL de redirection');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erreur inattendue');
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="border p-4 rounded-lg flex items-center gap-4">
      <div className="p-2 bg-gray-100 rounded">{icon}</div>
      <div className="flex-1">
        <h3 className="font-bold">{displayName}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <Button onClick={handleConnect} isDisabled={isConnecting} isLoading={isConnecting}>
        {isConnecting ? <Loader2 className="animate-spin" /> : <ExternalLink />}
        <span className="ml-2">Connecter</span>
      </Button>
    </div>
  );
}
