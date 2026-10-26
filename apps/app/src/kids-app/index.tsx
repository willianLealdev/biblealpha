import { Redirect } from 'expo-router';

/** O app Kids abre direto no início do Kids. */
export default function KidsAppStart() {
  return <Redirect href="/kids" />;
}
