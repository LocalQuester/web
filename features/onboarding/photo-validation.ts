export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export type PhotoError = 'format' | 'size' | 'failed';

export async function validatePhotoFile(file: File): Promise<PhotoError | null> {
  if (file.size > PROFILE_PHOTO_MAX_BYTES) return 'size';
  if (!file.size) return 'format';
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (!jpeg && !png) return 'format';
  const mime = jpeg ? 'image/jpeg' : 'image/png';
  if (file.type && file.type !== mime) return 'format';
  return null;
}
