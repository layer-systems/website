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

function TextNoteCard({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;

  const displayName = metadata?.display_name || metadata?.name || genUserName(event.pubkey);
  const username = metadata?.name || genUserName(event.pubkey);
  const profileImage = metadata?.picture;

  const timestamp = new Date(event.created_at * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10 border-2 border-background">
            <AvatarImage src={profileImage} alt={displayName} />
            <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-sm truncate">{displayName}</h3>
              {metadata?.nip05 && (
                <Badge variant="secondary" className="text-xs">
                  ✓
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">@{username}</p>
          </div>
          <time className="text-xs text-muted-foreground shrink-0">{timestamp}</time>
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
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      {banner && (
        <div className="h-24 sm:h-32 bg-gradient-to-br from-primary/20 to-primary/5 relative">
          <img
            src={banner}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <CardHeader className={banner ? '-mt-12 pb-3' : 'pb-3'}>
        <div className="flex items-start space-x-4">
          <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
            <AvatarImage src={profileImage} alt={displayName} />
            <AvatarFallback className="text-2xl">{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 pt-8">
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-lg truncate">{displayName}</h3>
              {nip05 && (
                <Badge variant="secondary" className="text-xs">
                  ✓
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">@{username}</p>
            {nip05 && (
              <p className="text-xs text-muted-foreground/70 truncate mt-1">{nip05}</p>
            )}
          </div>
        </div>
      </CardHeader>
      {(about || website) && (
        <CardContent className="pt-0 space-y-2">
          {about && (
            <p className="text-sm text-muted-foreground line-clamp-3">{about}</p>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center"
            >
              🔗 {website.replace(/^https?:\/\//, '')}
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
            <div className="flex items-center space-x-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Explore
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Discover the latest text notes and profiles from the Nostr
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
            <TabsTrigger value="notes">
              Notes ({data?.textNotes?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="profiles">
              Profiles ({data?.profiles?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Text Notes Tab */}
          <TabsContent value="notes" className="mt-6 space-y-4">
            {isLoading && <LoadingSkeleton />}
            
            {isError && (
              <Card className="border-dashed">
                <CardContent className="py-12 px-8 text-center">
                  <p className="text-muted-foreground">
                    Unable to load notes. Please check your relay connections.
                  </p>
                </CardContent>
              </Card>
            )}

            {!isLoading && !isError && data?.textNotes.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-12 px-8 text-center">
                  <p className="text-muted-foreground">
                    No text notes found. Try refreshing or check your relay connections.
                  </p>
                </CardContent>
              </Card>
            )}

            {!isLoading && !isError && data?.textNotes.map((event) => (
              <TextNoteCard key={event.id} event={event} />
            ))}
          </TabsContent>

          {/* Profiles Tab */}
          <TabsContent value="profiles" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isLoading && (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                      <CardHeader>
                        <div className="flex items-center space-x-3">
                          <Skeleton className="h-20 w-20 rounded-full" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
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
                    <CardContent className="py-12 px-8 text-center">
                      <p className="text-muted-foreground">
                        Unable to load profiles. Please check your relay connections.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {!isLoading && !isError && data?.profiles.length === 0 && (
                <div className="col-span-full">
                  <Card className="border-dashed">
                    <CardContent className="py-12 px-8 text-center">
                      <p className="text-muted-foreground">
                        No profiles found. Try refreshing or check your relay connections.
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
    </div>
  );
}
