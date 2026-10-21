// Apps: quando uma atualização automática termina de baixar, o app recarrega sozinho para usá-la
// (sem isso ela só entraria na abertura seguinte).

import * as Updates from 'expo-updates';
import { useEffect } from 'react';

export function UpdateReload() {
  const { isUpdatePending } = Updates.useUpdates();
  useEffect(() => {
    if (isUpdatePending) Updates.reloadAsync().catch(() => {});
  }, [isUpdatePending]);
  return null;
}
