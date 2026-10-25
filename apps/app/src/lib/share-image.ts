// Imagem de versículo para o feed ou o story: o servidor monta a imagem; aqui só pedimos, mostramos e
// abrimos o menu de compartilhar do aparelho (Instagram, WhatsApp, Facebook…).

import { requireOptionalNativeModule } from 'expo';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { api, apiRaw } from './api';

export type ShareFormat = 'feed' | 'story';
export type ShareBackground = { preset: string } | { libraryId: string } | { photo: string };
export type Preset = { id: string; colors: [string, string] };

/** Imagem pronta: `uri` para mostrar; `blob` só no site. */
export type VerseImage = { uri: string; blob?: Blob };

export const shareImageApi = {
  presets: () => api<{ presets: Preset[] }>('/share/presets', { auth: false }),
};

export async function makeVerseImage(text: string, reference: string, format: ShareFormat, bg: ShareBackground): Promise<VerseImage> {
  const body = {
    text,
    reference,
    format,
    preset: 'preset' in bg ? bg.preset : null,
    library_id: 'libraryId' in bg ? bg.libraryId : null,
    photo: 'photo' in bg ? bg.photo : null,
  };
  const response = await apiRaw('/share/verse-image', { method: 'POST', body, timeoutMs: 30_000 });
  if (Platform.OS === 'web') {
    const blob = await response.blob();
    return { uri: URL.createObjectURL(blob), blob };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Nome novo a cada vez: a prévia não fica presa numa imagem antiga do cache
  const file = new File(Paths.cache, `versiculo-${Date.now()}.jpg`);
  file.create();
  file.write(bytes);
  return { uri: file.uri };
}

/** Abre o menu de compartilhar do aparelho (lista de apps). No navegador que não tem esse menu (a maioria
 * dos computadores), devolve 'unsupported' e a tela mostra as opções dela. */
export async function shareVerseImage(image: VerseImage, filename: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (!image.blob) return 'unsupported';
    const file = new globalThis.File([image.blob], filename, { type: 'image/jpeg' });
    if (!nav?.canShare?.({ files: [file] })) return 'unsupported';
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
    }
  }
  await Sharing.shareAsync(image.uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: filename });
  return 'shared';
}

/** Copia a imagem para colar em outro app (WhatsApp Web, Instagram, Facebook…). Só no site. */
export async function copyVerseImage(image: VerseImage): Promise<boolean> {
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!image.blob || !Item || !navigator.clipboard?.write) return false;
  // A área de transferência só aceita PNG: converte o JPEG
  const bitmap = await createImageBitmap(image.blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) return false;
  try {
    await navigator.clipboard.write([new Item({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}

/** Links para compartilhar o texto do versículo nas redes (sem a imagem: o navegador não deixa mandar). */
export function shareLinks(text: string, reference: string) {
  const message = `“${text}” — ${reference}\n\nbiblealpha.com`;
  const m = encodeURIComponent(message);
  const site = encodeURIComponent('https://biblealpha.com');
  return {
    whatsapp: `https://wa.me/?text=${m}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${site}&quote=${m}`,
    x: `https://twitter.com/intent/tweet?text=${m}`,
    telegram: `https://t.me/share/url?url=${site}&text=${m}`,
  };
}

export function downloadVerseImage(image: VerseImage, filename: string) {
  const a = document.createElement('a');
  a.href = image.uri;
  a.download = filename;
  a.click();
}

/** O seletor de fotos só existe nos apps a partir da versão que o inclui; antes disso devolve 'update'. */
export async function pickPhoto(): Promise<string | null | 'update'> {
  if (Platform.OS === 'web') return pickPhotoWeb();
  if (!requireOptionalNativeModule('ExponentImagePicker')) return 'update';
  const ImagePicker = await import('expo-image-picker');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
  if (result.canceled || !result.assets[0]?.base64) return null;
  return result.assets[0].base64;
}

function pickPhotoWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      // Reduz fotos grandes (máx. 2000 px) antes de enviar
      const img = new globalThis.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',', 2)[1] ?? null);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    };
    input.click();
  });
}
