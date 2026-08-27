'use client';

import { useState } from 'react';
import { Button, toast } from '@/components/ui';
import { ExternalLink, Loader2 } from 'lucide-react';

interface IntegrationCardProps {
  appName: string; // ex: 'gmail', 'slack', 'notion'
  displayName: string; // ex: 'Gmail', 'Slack', 'Notion'
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
        // ✅ SÉCURITÉ : Parsing JSON sécurisé au cas où le serveur renvoie du HTML (ex: erreur 500 brute)
        let errorData: Record<string, unknown> = {};
        try {
          errorData = await response.json();
        } catch (e) {
          // Ignorer si la réponse n'est pas du JSON valide
        }
        
        // ✅ SÉCURITÉ : On privilégie le champ 'details' (notre nouveau message précis), puis 'error', puis un fallback
        const errorMsg = 
          (typeof errorData.details === 'string' ? errorData.details : null) || 
          (typeof errorData.error === 'string' ? errorData.error : null) || 
          `Erreur serveur (${response.status})`;
          
        throw new Error(errorMsg);
      }

      const data = await response.json();

      // Redirection vers la page d'autorisation Composio
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error('Aucune URL de redirection fournie par le serveur.');
      }
    } catch (error: unknown) {
      // ✅ SÉCURITÉ : Extraction du message sans jamais planter, même si l'objet error est bizarre
      const errorMessage = error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
      
      console.error(`[Integration Connect Error - ${appName}]:`, error);
      
      // On affiche le vrai message d'erreur dans le toast pour le débogage
      toast.error(errorMessage);
    } finally {
      setIsConnecting(false);
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
        isDisabled={isConnecting}
        isLoading={isConnecting}
        loadingLabel="Connexion..."
        variant="outline"
      >
        {isConnecting ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
        <span className="ml-2">Connecter</span>
      </Button>
    </div>
  );
}
