'use client';

import { useState } from 'react';
import { Button, toast } from '@/components/ui';
import { ExternalLink, Loader2 } from 'lucide-react';

export function IntegrationCard({ appName, displayName, description, icon }: any) {
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const res = await fetch(`/api/v1/integrations/${appName}/connect`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      // On essaie de lire le JSON, mais si le serveur plante en HTML (erreur 500 brute), on ne plante pas
      let data: any = {};
      try {
        data = await res.json();
      } catch (e) {
        data = { error: `Le serveur a répondu avec le statut ${res.status} mais pas de JSON valide.` };
      }

      if (!res.ok) {
        throw new Error(data.details || data.error || `Erreur serveur (${res.status})`);
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error('Pas d\'URL de redirection fournie.');
      }

    } catch (err: unknown) {
      // ✅ SÉCURITÉ ABSOLUE : Extraction du message sans JAMAIS faire .message directement
      let errorMsg = 'Une erreur inconnue est survenue.';
      
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === 'string') {
        errorMsg = err;
      } else if (err && typeof err === 'object') {
        errorMsg = JSON.stringify(err);
      }

      // On affiche la vérité brute dans la console pour qu'on sache exactement ce qui se passe
      console.error('🚨 RAW ERROR OBJECT FROM CATCH:', err);
      
      toast.error(errorMsg);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="border p-4 rounded-lg flex items-center gap-4 bg-surface border-border">
      <div className="p-2 bg-muted rounded text-foreground">{icon}</div>
      <div className="flex-1">
        <h3 className="font-semibold text-foreground text-body">{displayName}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button onClick={handleConnect} isDisabled={isConnecting} isLoading={isConnecting} variant="outline">
        {isConnecting ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
        <span className="ml-2">Connecter</span>
      </Button>
    </div>
  );
}
