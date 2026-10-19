import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { ApiError } from '@/lib/api';
import { downloadFile } from '@/lib/sermons';

/**
 * PDF da ministração: arquivo gerado no servidor (no navegador, baixa direto; no celular, abre o
 * compartilhar). Sem internet, gera no aparelho a partir do HTML.
 */
export async function exportPdf(id: string, title: string, html: () => string) {
  const safe = title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'ministracao';
  try {
    await downloadFile(`/sermons/${id}/export.pdf`, `${safe}.pdf`, 'application/pdf');
  } catch (e) {
    // Erro do servidor: mostra a mensagem; sem conexão (fetch falhou): gera no aparelho
    if (e instanceof ApiError && e.status !== 0) throw e;
    await printPdf(html(), `${safe}.pdf`);
  }
}

async function printPdf(html: string, filename: string) {
  if (Platform.OS === 'web') {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const w = frame.contentWindow!;
    w.document.open();
    w.document.write(html);
    w.document.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 60_000);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
}

export function exportDocx(id: string, title: string) {
  const safe = title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'ministracao';
  return downloadFile(
    `/sermons/${id}/export.docx`,
    `${safe}.docx`,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
}

export function exportPptx(id: string, title: string) {
  const safe = title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'ministracao';
  return downloadFile(
    `/sermons/${id}/export.pptx`,
    `${safe}.pptx`,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
}
