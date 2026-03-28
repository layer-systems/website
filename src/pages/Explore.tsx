import { useState } from 'react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useExploreEvents } from '@/hooks/useExploreEvents';
import { useAuthor } from '@/hooks/useAuthor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteContent } from '@/components/NoteContent';
import { genUserName } from '@/lib/genUserName';
import { Layout } from '@/components/Layout';

function TextNoteCard({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;

  const displayName = metadata?.display_name || metadata?.name || genUserName(event.pubkey);
  const username = metadata?.name || genUserName(event.pubkey);
  const profileImage = metadata?.picture;

  const timestamp = new Date(event.created_at * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 border border-border">
            <AvatarImage src={profileImage} alt={displayName} />
            <AvatarFallback className="text-xs">{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{displayName}</span>
              {metadata?.nip05 && (
                <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">NIP-05</Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">@{username}</p>
          </div>
          <time className="shrink-0 text-xs text-muted-foreground">{timestamp}</time>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="whitespace-pre-wrap break-words">
          <NoteContent event={event} className="text-sm leading-relaxed" />
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileCard({ event }: { event: NostrEvent }) {
  let metadata: NostrMetadata | undefined;

  try {
    metadata = JSON.parse(event.content) as NostrMetadata;
  } catch {
    return null;
  }

  const displayName = metadata?.display_name || metadata?.name || genUserName(event.pubkey);
  const username = metadata?.name || genUserName(event.pubkey);
  const about = metadata?.about;
  const profileImage = metadata?.picture;
  const banner = metadata?.banner;
  const nip05 = metadata?.nip05;
  const website = metadata?.website;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      {banner ? (
        <div className="h-24 bg-muted">
          <img src={banner} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="h-16 bg-gradient-to-br from-primary/10 to-primary/5" />
      )}
      <CardHeader className="-mt-10 pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-16 w-16 border-[3px] border-card shadow-sm">
            <AvatarImage src={profileImage} alt={displayName} />
            <AvatarFallback className="text-lg">{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 pt-6">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-serif font-bold">{displayName}</h3>
              {nip05 && (
                <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">NIP-05</Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">@{username}</p>
          </div>
        </div>
      </CardHeader>
      {(about || website) && (
        <CardContent className="space-y-2 pt-0">
          {about && (
            <p className="line-clamp-3 text-sm text-muted-foreground">{about}</p>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-primary hover:underline"
            >
              {website.replace(/^https?:\/\//, '')}
            </a>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function Explore() {
  const [activeTab, setActiveTab] = useState('notes');
  const { data, isLoading, isError } = useExploreEvents();

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold sm:text-4xl">Explore</h1>
          <p className="mt-1 text-muted-foreground">
            The latest notes and profiles from the network.
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="notes">
              Notes ({data?.textNotes?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="profiles">
              Profiles ({data?.profiles?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Notes Tab */}
          <TabsContent value="notes" className="space-y-4">
            {isLoading && <LoadingSkeleton />}

            {isError && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    Unable to load notes. Check your relay connections.
                  </p>
                </CardContent>
              </Card>
            )}

            {!isLoading && !isError && data?.textNotes.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    No notes found. Try refreshing or check your relay connections.
                  </p>
                </CardContent>
              </Card>
            )}

            {!isLoading && !isError && data?.textNotes.map((event) => (
              <TextNoteCard key={event.id} event={event} />
            ))}
          </TabsContent>

          {/* Profiles Tab */}
          <TabsContent value="profiles">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {isLoading && (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-16 w-16 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </>
              )}

              {isError && (
                <div className="col-span-full">
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground">
                        Unable to load profiles. Check your relay connections.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {!isLoading && !isError && data?.profiles.length === 0 && (
                <div className="col-span-full">
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground">
                        No profiles found.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {!isLoading && !isError && data?.profiles.map((event) => (
                <ProfileCard key={event.id} event={event} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
