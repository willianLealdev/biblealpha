import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import Reader from '@/screens/reader';

// O app abre na tela Início; depois disso, "/" é o leitor da Bíblia
let opened = false;

export default function BibleTab() {
  const params = useLocalSearchParams<{ book?: string; t?: string }>();
  useEffect(() => {
    opened = true;
  }, []);
  if (!opened && !params.book && !params.t) return <Redirect href="/home" />;
  return <Reader />;
}
