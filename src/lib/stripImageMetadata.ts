/** Re-encode pixels locally so embedded source metadata never reaches the server. */
export async function stripImageMetadata(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');

  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable.');
    context.drawImage(bitmap, 0, 0);

    // Canvas exports newly encoded pixels, rather than copying EXIF, XMP,
    // comments, thumbnails, or other metadata from the original container.
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('Could not remove image metadata.'));
      }, type, 0.95);
    });

    // Also avoid disclosing the original filename or last-modified timestamp.
    return new File([blob], blob.type === 'image/jpeg' ? 'image.jpg' : 'image.png', {
      type: blob.type,
      lastModified: 0,
    });
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
