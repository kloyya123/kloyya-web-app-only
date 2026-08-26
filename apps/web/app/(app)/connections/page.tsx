import { IntegrationCard } from '@/features/settings/components/integration-card';
import { Mail, MessageSquare, FileText } from 'lucide-react';

export default function ConnectionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-heading-l text-foreground font-semibold">Connexions</h1>
      <p className="text-body text-muted-foreground">Connectez vos outils pour alimenter l'intelligence de Kloyya.</p>
      
      <div className="space-y-4">
        <IntegrationCard 
          appName="gmail" 
          displayName="Gmail" 
          description="Analysez vos emails et alertes de sécurité pour des recommandations proactives."
          icon={<Mail className="size-6" />}
        />
        <IntegrationCard 
          appName="slack" 
          displayName="Slack" 
          description="Synchronisez vos canaux pour comprendre les dynamiques d'équipe et les décisions."
          icon={<MessageSquare className="size-6" />}
        />
        <IntegrationCard 
          appName="notion" 
          displayName="Notion" 
          description="Importez vos documents et bases de connaissances dans le graphe de Kloyya."
          icon={<FileText className="size-6" />}
        />
      </div>
    </div>
  );
}
