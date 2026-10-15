import { documentHref } from '../wiki/links';

export async function copyDocumentLink(id: string) {
  if (!navigator.clipboard?.writeText)
    throw new Error('Clipboard access is unavailable in this browser.');
  await navigator.clipboard.writeText(new URL(documentHref(id), window.location.href).href);
}
