import { useMutation } from "@tanstack/react-query";
import { BlossomUploader } from '@nostrify/nostrify/uploaders';

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { getEffectiveBlossomServers } from "@/lib/appBlossom";

export function useUploadFile() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) {
        throw new Error('Must be logged in to upload files');
      }

      const servers = getEffectiveBlossomServers(
        config.blossomServerMetadata,
        config.useAppBlossomServers,
      );

      if (servers.length === 0) {
        throw new Error('No Blossom servers configured');
      }

      const uploader = new BlossomUploader({
        servers,
        signer: user.signer,
      });

      // BUD-05 lets the server optimize images and strip metadata according to
      // its policy. Do not fall back to uploading the original if processing fails.
      const tags = file.type.startsWith('image/')
        ? await uploader.media(file)
        : await uploader.upload(file);
      return tags;
    },
  });
}
