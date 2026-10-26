// Dois apps saem deste mesmo código:
// - BibleAlpha (padrão): usa o app.json como está.
// - BibleAlpha Kids (APP_VARIANT=kids): só as telas do Kids (pasta src/kids-app), outro nome,
//   outro ícone e outro identificador nas lojas, sem câmera, microfone nem fotos.

const KIDS_PROJECT_ID = '73f6af98-8e5d-45b8-b8cf-3858bb5b4efa';

// Módulos que o app Kids não usa: ficam fora do aplicativo (ver scripts/eas-pre-install.js)
const KIDS_PLUGINS_OFF = ['expo-camera', 'expo-speech-recognition', 'expo-image-picker'];

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'kids') return config;

  const plugins = config.plugins
    .filter((p) => !KIDS_PLUGINS_OFF.includes(Array.isArray(p) ? p[0] : p))
    .map((p) =>
      (Array.isArray(p) ? p[0] : p) === 'expo-splash-screen'
        ? ['expo-splash-screen', { backgroundColor: '#FFF7E8', image: './assets/kids/app-splash.png', imageWidth: 200 }]
        : p,
    );
  plugins.push(
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false }],
    ['expo-video', { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
  );

  return {
    ...config,
    name: 'BibleAlpha Kids',
    slug: 'biblealpha-kids',
    scheme: 'biblealphakids',
    version: '1.0.0',
    icon: './assets/kids/app-icon.png',
    userInterfaceStyle: 'light',
    backgroundColor: '#FFF7E8',
    description: 'Histórias da Bíblia, jogos, quiz e versículos para crianças. Sem anúncios, sem compras e sem login.',
    ios: {
      bundleIdentifier: 'com.biblealpha.kids',
      supportsTablet: true,
      config: { usesNonExemptEncryption: false },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        CFBundleAllowMixedLocalizations: true,
        UIBackgroundModes: [],
      },
    },
    android: {
      package: 'com.biblealpha.kids',
      adaptiveIcon: { backgroundColor: '#FFF7E8', foregroundImage: './assets/kids/app-adaptive.png' },
      predictiveBackGestureEnabled: false,
      permissions: [],
      blockedPermissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.READ_CONTACTS',
        'android.permission.READ_PHONE_STATE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      ],
    },
    plugins,
    updates: { ...config.updates, url: `https://u.expo.dev/${KIDS_PROJECT_ID}` },
    extra: {
      ...config.extra,
      variant: 'kids',
      router: { ...config.extra.router, root: 'src/kids-app' },
      eas: { projectId: KIDS_PROJECT_ID },
    },
  };
};
