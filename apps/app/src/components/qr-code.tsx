// QR code desenhado em SVG (sem imagem externa).

import QRCode from 'qrcode';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

export function QrCode({ value, size = 240, color = '#000000', background = '#FFFFFF' }: { value: string; size?: number; color?: string; background?: string }) {
  const { path, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.get(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
      }
    }
    return { path: d, count: n + 8 }; // margem de 4 módulos (zona de silêncio)
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} accessibilityLabel="QR code">
      <Rect x={0} y={0} width={count} height={count} fill={background} />
      <Path d={path} fill={color} />
    </Svg>
  );
}
