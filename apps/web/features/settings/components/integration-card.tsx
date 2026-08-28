'use client';

import { useState } from 'react';
import { Button, toast } from '@/components/ui';
import { ExternalLink, Loader2 } from 'lucide-react';

interface IntegrationCardProps {
  appName: string;
  displayName: string;
  description: string;
  icon: React.ReactNode;
}

export function IntegrationCard({ appName, displayName, description, icon }: IntegrationCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const response = await fetch(`/api/v1/integrations/${appName}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || `Erreur serveur (${response.status})`);
      }

      const data = await response.json();

      if (data.redirectUrl) {
        // ✅ CORRECTION CRUCIALE : 
        // On force une redirection pleine page. 
        // NE PAS utiliser de modal, de dialog ou d'iframe pour cette URL.
        window.location.href = data.redirectUrl;
      } else {
        throw new Error("Aucune URL de redirection fournie par le serveur.");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
      console.error('[Integration Connect Error]:', error);
      toast.error(errorMessage);
      setIsConnecting(false); // On ne réinitialise que si ça échoue, sinon la page change
    }
  }

  return (
    <div className="border-border bg-surface rounded-lg border p-4 flex items-start gap-4">
      <div className="bg-muted rounded-md p-2 text-foreground">
        {icon}
      </div>
      <div className="flex-1 space-y-1">
        <h3 className="text-body text-foreground font-semibold">{displayName}</h3>
        <p className="text-small text-muted-foreground">{description}</p>
      </div>
      <Button 
        onClick={handleConnect} 
        disabled={isConnecting} // Utilise 'disabled' au lieu de 'isDisabled' selon ta lib de UI
        variant="outline"
      >
        {isConnecting ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
        <span className="ml-2">Connecter</span>
      </Button>
    </div>
  );
}
