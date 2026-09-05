import { useSeoMeta } from '@unhead/react';
import { DMMessagingInterface } from '@/components/dm/DMMessagingInterface';
import { DMProvider } from '@/components/DMProvider';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** The Messages app, rendered inside an OS window — see docs/DESKTOP_OS.md. */
const Messages = () => {
  useSeoMeta({
    title: 'Messages',
    description: 'Private encrypted messaging on Nostr',
  });

  const { user } = useCurrentUser();

  return (
    <DMProvider config={{ enabled: !!user }}>
      <div className="h-full flex flex-col p-4">
        <DMMessagingInterface className="flex-1" />
      </div>
    </DMProvider>
  );
};

export default Messages;
export { Messages };
