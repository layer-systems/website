import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { User, FileText, Radio, BookOpen } from 'lucide-react';
import NotFound from './NotFound';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const { type } = decoded;

  const renderContent = () => {
    switch (type) {
      case 'npub':
      case 'nprofile':
        return (
          <PlaceholderCard
            icon={<User className="h-6 w-6" />}
            title="Profile"
            description="This profile view is not yet implemented."
            identifier={identifier}
          />
        );

      case 'note':
        return (
          <PlaceholderCard
            icon={<FileText className="h-6 w-6" />}
            title="Note"
            description="This note view is not yet implemented."
            identifier={identifier}
          />
        );

      case 'nevent':
        return (
          <PlaceholderCard
            icon={<Radio className="h-6 w-6" />}
            title="Event"
            description="This event view is not yet implemented."
            identifier={identifier}
          />
        );

      case 'naddr':
        return (
          <PlaceholderCard
            icon={<BookOpen className="h-6 w-6" />}
            title="Addressable Event"
            description="This addressable event view is not yet implemented."
            identifier={identifier}
          />
        );

      default:
        return <NotFound />;
    }
  };

  return (
    <Layout>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        {renderContent()}
      </section>
    </Layout>
  );
}

function PlaceholderCard({
  icon,
  title,
  description,
  identifier,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  identifier: string;
}) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <h1 className="font-serif text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
        <div className="mt-6 rounded-lg bg-muted/50 px-4 py-3">
          <p className="text-xs text-muted-foreground break-all font-mono">{identifier}</p>
        </div>
      </CardContent>
    </Card>
  );
}
