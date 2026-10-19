import { Redirect, useLocalSearchParams, usePathname } from 'expo-router';
import { useEffect } from 'react';

import Reader from '@/screens/reader';

// O app abre na tela Início; depois disso, "/" é o leitor da Bíblia
let opened = false;

export default function BibleTab() {
  const params = useLocalSearchParams<{ book?: string; t?: string }>();
  // As abas podem montar esta tela por trás (ex.: ao abrir a Biblioteca): só redireciona se o
  // endereço for mesmo o da Bíblia, senão a pessoa voltaria para o Início sem querer
  const here = usePathname() === '/';
  useEffect(() => {
    if (here) opened = true;
  }, [here]);
  if (here && !opened && !params.book && !params.t) return <Redirect href="/home" />;
  return <Reader />;
}
