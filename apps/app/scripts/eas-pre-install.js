// Roda nos servidores do Expo antes de montar um app (gancho "eas-build-pre-install").
// App Kids: deixa fora do aplicativo os módulos de câmera, microfone e fotos, que o Kids
// não usa (as lojas pedem que app infantil não tenha esses acessos). O app oficial não muda.

const fs = require('fs');
const path = require('path');

if (process.env.APP_VARIANT === 'kids') {
  const file = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.expo = { ...pkg.expo, autolinking: { exclude: ['expo-camera', 'expo-speech-recognition', 'expo-image-picker'] } };
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  console.log('App Kids: câmera, microfone e fotos fora do aplicativo.');
}
