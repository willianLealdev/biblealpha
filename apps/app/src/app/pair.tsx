// Link do QR code lido pela câmera do celular (fora do app): segue para "Compartilhar tela".

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function PairRedirect() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <Redirect href={{ pathname: '/share-screen', params: code ? { code } : {} }} />;
}
