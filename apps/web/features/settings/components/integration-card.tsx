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
      // Appel à notre API route qui parle à Composio
      const response = await fetch(`/api/v1/integrations/${appName}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to connect');
      }

      const data = await response.json();

      // Redirection vers la page d'autorisation Composio
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error('No redirect URL provided');
      }
    } catch (error) {
      console.error('[Integration Connect Error]:', error);
      toast.error(`Impossible de connecter ${displayName}. Veuillez réessayer.`);
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
