// Página inicial pública (site): apresenta tudo o que o BibleAlpha oferece.
// No menu, "Compartilhar tela" abre o QR code para o telão da igreja (como o WhatsApp Web).

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text as RNText, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradientBg } from '@/components/gradient-bg';
import { QrCode } from '@/components/qr-code';
import { Logo, Seal } from '@/components/ui';
import { useI18n, type TranslationKey } from '@/i18n';
import type { Locale } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Icon = ComponentProps<typeof Ionicons>['name'];
type Section = 'download' | 'features' | 'ministry' | 'share' | 'support' | 'faq';

// Lojas: quando a Apple e o Google aprovarem, é só colocar o link (sem link aparece "Em breve")
const STORES: { key: 'windows' | 'ios' | 'android'; icon: Icon; name: string; url: string | null }[] = [
  { key: 'android', icon: 'logo-google-playstore', name: 'Google Play', url: null },
  { key: 'ios', icon: 'logo-apple', name: 'App Store', url: null },
  { key: 'windows', icon: 'logo-windows', name: 'Microsoft Store', url: 'https://apps.microsoft.com/detail/9N2MHL1R6ZQP' },
];

const FEATURES: { icon: Icon; title: TranslationKey; body: TranslationKey }[] = [
  { icon: 'book-outline', title: 'landing.f.bibleTitle', body: 'landing.f.bibleBody' },
  { icon: 'sparkles-outline', title: 'landing.f.aiTitle', body: 'landing.f.aiBody' },
  { icon: 'language-outline', title: 'landing.f.originalTitle', body: 'landing.f.originalBody' },
  { icon: 'git-compare-outline', title: 'landing.f.crossTitle', body: 'landing.f.crossBody' },
  { icon: 'map-outline', title: 'landing.f.visualTitle', body: 'landing.f.visualBody' },
  { icon: 'school-outline', title: 'landing.f.quizTitle', body: 'landing.f.quizBody' },
  { icon: 'volume-high-outline', title: 'landing.f.audioTitle', body: 'landing.f.audioBody' },
  { icon: 'sunny-outline', title: 'landing.f.devotionalTitle', body: 'landing.f.devotionalBody' },
  { icon: 'library-outline', title: 'landing.f.libraryTitle', body: 'landing.f.libraryBody' },
];

const MINISTRY: { icon: Icon; title: TranslationKey; body: TranslationKey }[] = [
  { icon: 'create-outline', title: 'landing.m.editorTitle', body: 'landing.m.editorBody' },
  { icon: 'mic-outline', title: 'landing.m.voiceTitle', body: 'landing.m.voiceBody' },
  { icon: 'chatbubble-ellipses-outline', title: 'landing.m.askTitle', body: 'landing.m.askBody' },
  { icon: 'easel-outline', title: 'landing.m.pulpitTitle', body: 'landing.m.pulpitBody' },
  { icon: 'timer-outline', title: 'landing.m.timerTitle', body: 'landing.m.timerBody' },
  { icon: 'tv-outline', title: 'landing.m.screenTitle', body: 'landing.m.screenBody' },
  { icon: 'document-attach-outline', title: 'landing.m.exportTitle', body: 'landing.m.exportBody' },
  { icon: 'calendar-outline', title: 'landing.m.agendaTitle', body: 'landing.m.agendaBody' },
];

const FAQ: { q: TranslationKey; a: TranslationKey }[] = [
  { q: 'landing.faq.freeQ', a: 'landing.faq.freeA' },
  { q: 'landing.faq.languagesQ', a: 'landing.faq.languagesA' },
  { q: 'landing.faq.aiQ', a: 'landing.faq.aiA' },
  { q: 'landing.faq.screenQ', a: 'landing.faq.screenA' },
  { q: 'landing.faq.offlineQ', a: 'landing.faq.offlineA' },
  { q: 'landing.faq.installQ', a: 'landing.faq.installA' },
  { q: 'landing.faq.privacyQ', a: 'landing.faq.privacyA' },
];

const LANGS: { code: Locale; label: string }[] = [
  { code: 'pt-BR', label: 'PT' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
];

export default function Landing() {
  const { t, locale, setLocale } = useI18n();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const signedIn = useSession().status === 'signedIn';
  const scroll = useRef<ScrollViewInstance>(null);
  // Posição de cada seção (para o menu rolar até ela)
  const y = useRef<Partial<Record<Section, number>>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const wide = width >= 920;
  // Menu completo no topo só em telas largas; nas demais, botão de menu
  const fullMenu = width >= 1180;
  const cols = width >= 920 ? 3 : width >= 600 ? 2 : 1;

  // Rolar até a seção escolhida no menu (feito no efeito, fora da renderização)
  const [target, setTarget] = useState<{ section: Section; n: number } | null>(null);
  useEffect(() => {
    if (target) scroll.current?.scrollTo({ y: Math.max(0, (y.current[target.section] ?? 0) - 70), animated: true });
  }, [target]);
  function go(section: Section) {
    setMenuOpen(false);
    setTarget((prev) => ({ section, n: (prev?.n ?? 0) + 1 }));
  }
  const openApp = () => router.push(signedIn ? '/home' : '/sign-in');
  const start = () => router.push(signedIn ? '/home' : '/sign-up');
  const shareScreen = () => router.push('/screen');

  const MENU: { label: TranslationKey; section: Section }[] = [
    { label: 'landing.menu.download', section: 'download' },
    { label: 'landing.menu.features', section: 'features' },
    { label: 'landing.menu.ministry', section: 'ministry' },
    { label: 'landing.menu.support', section: 'support' },
    { label: 'landing.menu.faq', section: 'faq' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Menu do topo */}
      <View style={{ borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, zIndex: 10 }}>
        <Container style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 }}>
          <Pressable accessibilityRole="link" onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Seal size={34} />
            <RNText style={{ color: colors.text, fontFamily: fonts.display, fontSize: 24 }}>
              Bible<RNText style={{ color: colors.gold }}>Alpha</RNText>
            </RNText>
          </Pressable>
          <View style={{ flex: 1 }} />
          {fullMenu
            ? MENU.map((m) => (
                <Pressable key={m.section} accessibilityRole="link" onPress={() => go(m.section)} style={{ paddingHorizontal: 6, paddingVertical: 6 }}>
                  <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }}>{t(m.label)}</RNText>
                </Pressable>
              ))
            : null}
          {fullMenu ? (
            <>
              <LangSwitch locale={locale} onChange={setLocale} />
              <GoldButton label={t('landing.menu.shareScreen')} icon="qr-code-outline" onPress={shareScreen} outline />
              <GoldButton label={signedIn ? t('landing.openApp') : t('landing.signIn')} onPress={openApp} />
            </>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={t('landing.menu.open')} onPress={() => setMenuOpen((v) => !v)} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name={menuOpen ? 'close' : 'menu'} size={28} color={colors.gold} />
            </Pressable>
          )}
        </Container>
        {!fullMenu && menuOpen ? (
          <Container style={{ paddingBottom: 16, gap: 6 }}>
            {MENU.map((m) => (
              <Pressable key={m.section} accessibilityRole="link" onPress={() => go(m.section)} style={{ paddingVertical: 10 }}>
                <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 17 }}>{t(m.label)}</RNText>
              </Pressable>
            ))}
            <GoldButton label={t('landing.menu.shareScreen')} icon="qr-code-outline" onPress={shareScreen} outline />
            <GoldButton label={signedIn ? t('landing.openApp') : t('landing.signIn')} onPress={openApp} />
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <LangSwitch locale={locale} onChange={setLocale} />
            </View>
          </Container>
        ) : null}
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 0 }}>
        {/* Abertura */}
        <View style={{ overflow: 'hidden' }}>
          <LinearGradientBg colors={['#1E1609', colors.bg]} />
          <Container style={{ paddingVertical: wide ? 80 : 48, flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: 40 }}>
            <View style={{ flex: wide ? 1.2 : undefined, gap: 20, alignItems: wide ? 'flex-start' : 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Ionicons name="heart" size={14} color={colors.gold} />
                <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{t('landing.badge')}</RNText>
              </View>
              <RNText style={{ color: colors.text, fontFamily: fonts.displayBold, fontSize: wide ? 64 : 40, lineHeight: wide ? 70 : 46, textAlign: wide ? 'left' : 'center' }}>
                {t('landing.heroTitle')}
              </RNText>
              <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: wide ? 20 : 17, lineHeight: wide ? 31 : 27, textAlign: wide ? 'left' : 'center', maxWidth: 620 }}>
                {t('landing.heroBody')}
              </RNText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: wide ? 'flex-start' : 'center' }}>
                <GoldButton label={signedIn ? t('landing.openApp') : t('landing.start')} icon="arrow-forward" onPress={start} />
                <GoldButton label={t('landing.menu.shareScreen')} icon="qr-code-outline" onPress={shareScreen} outline />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 34 : 20, justifyContent: wide ? 'flex-start' : 'center', marginTop: 8 }}>
                {(['translations', 'languages', 'devotionals', 'free'] as const).map((k) => (
                  <View key={k} style={{ alignItems: wide ? 'flex-start' : 'center' }}>
                    <RNText style={{ color: colors.gold, fontFamily: fonts.displayBold, fontSize: 32 }}>{t(`landing.stats.${k}N` as TranslationKey)}</RNText>
                    <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>{t(`landing.stats.${k}` as TranslationKey)}</RNText>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ flex: wide ? 1 : undefined, alignItems: 'center' }}>
              <Logo size={wide ? 380 : 240} />
            </View>
          </Container>
        </View>

        {/* Baixar o app nas lojas */}
        <View onLayout={(e) => {
          y.current.download = e.nativeEvent.layout.y;
        }} style={{ paddingVertical: 56, backgroundColor: colors.surfaceAlt, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
          <Container>
            <SectionTitle wide={wide} kicker="landing.downloadKicker" title="landing.downloadTitle" subtitle="landing.downloadSubtitle" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
              {STORES.map((s) => (
                <StoreBadge key={s.key} icon={s.icon} name={s.name} url={s.url} />
              ))}
            </View>
          </Container>
        </View>

        {/* Recursos de estudo */}
        <View onLayout={(e) => {
          y.current.features = e.nativeEvent.layout.y;
        }} style={{ paddingVertical: 64 }}>
          <Container>
            <SectionTitle wide={wide} kicker="landing.featuresKicker" title="landing.featuresTitle" subtitle="landing.featuresSubtitle" />
            <Grid cols={cols} items={FEATURES} />
          </Container>
        </View>

        {/* Ministração */}
        <View onLayout={(e) => {
          y.current.ministry = e.nativeEvent.layout.y;
        }} style={{ paddingVertical: 64, backgroundColor: colors.surfaceAlt, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
          <Container>
            <SectionTitle wide={wide} kicker="landing.ministryKicker" title="landing.ministryTitle" subtitle="landing.ministrySubtitle" />
            <Grid cols={cols} items={MINISTRY} />
          </Container>
        </View>

        {/* Compartilhar tela em 3 passos */}
        <View onLayout={(e) => {
          y.current.share = e.nativeEvent.layout.y;
        }} style={{ paddingVertical: 64 }}>
          <Container style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: 40 }}>
            <View style={{ flex: wide ? 1 : undefined, gap: 18, width: '100%' }}>
              <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, letterSpacing: 2, fontSize: 13, textTransform: 'uppercase' }}>{t('landing.shareKicker')}</RNText>
              <RNText style={{ color: colors.text, fontFamily: fonts.display, fontSize: wide ? 42 : 30, lineHeight: wide ? 50 : 36 }}>{t('landing.shareTitle')}</RNText>
              {(['landing.share1', 'landing.share2', 'landing.share3', 'landing.share4'] as const).map((k, i) => (
                <View key={k} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
                    <RNText style={{ color: colors.onGold, fontFamily: fonts.bodyBold, fontSize: 16 }}>{i + 1}</RNText>
                  </View>
                  <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 17, lineHeight: 26 }}>{t(k)}</RNText>
                </View>
              ))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                <GoldButton label={t('landing.openScreen')} icon="qr-code-outline" onPress={shareScreen} />
              </View>
            </View>
            {/* Ilustração: telão com QR code e o versículo */}
            <View style={{ flex: wide ? 1 : undefined, width: '100%', alignItems: 'center', gap: 16 }}>
              <View style={{ width: '100%', maxWidth: 480, aspectRatio: 16 / 10, borderRadius: radius.lg, borderWidth: 6, borderColor: '#2a2418', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <LinearGradientBg colors={['#3a2a10', '#0b0906']} />
                <View style={{ padding: 8, backgroundColor: '#fff', borderRadius: 10 }}>
                  <QrCode value="https://biblealpha.com/screen" size={110} />
                </View>
                <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 22, letterSpacing: 6 }}>ABC123</RNText>
              </View>
              <Ionicons name="arrow-down" size={26} color={colors.gold} />
              <View style={{ width: '100%', maxWidth: 480, aspectRatio: 16 / 7, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <LinearGradientBg colors={['#45351a', '#120d06']} />
                <RNText style={{ color: '#fff', fontFamily: fonts.display, fontSize: 30, textAlign: 'center' }}>{t('landing.sampleVerse')}</RNText>
                <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 15, marginTop: 6 }}>{t('landing.sampleRef')}</RNText>
              </View>
            </View>
          </Container>
        </View>

        {/* Valores */}
        <View style={{ paddingVertical: 56, backgroundColor: colors.surfaceAlt, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
          <Container>
            <SectionTitle wide={wide} kicker="landing.valuesKicker" title="landing.valuesTitle" />
            <Grid
              cols={cols}
              items={[
                { icon: 'shield-checkmark-outline', title: 'landing.v.sourcesTitle', body: 'landing.v.sourcesBody' },
                { icon: 'lock-closed-outline', title: 'landing.v.privacyTitle', body: 'landing.v.privacyBody' },
                { icon: 'ban-outline', title: 'landing.v.adsTitle', body: 'landing.v.adsBody' },
              ]}
            />
          </Container>
        </View>

        {/* Ofertante */}
        <View onLayout={(e) => {
          y.current.support = e.nativeEvent.layout.y;
        }} style={{ paddingVertical: 64 }}>
          <Container>
            <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.goldMuted, padding: wide ? 48 : 26, alignItems: 'center', gap: 16 }}>
              <LinearGradientBg colors={['#2b2010', '#0b0906']} />
              <Ionicons name="heart" size={36} color={colors.gold} />
              <RNText style={{ color: colors.text, fontFamily: fonts.display, fontSize: wide ? 42 : 30, textAlign: 'center' }}>{t('landing.supportTitle')}</RNText>
              <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 17, lineHeight: 27, textAlign: 'center', maxWidth: 720 }}>{t('landing.supportBody')}</RNText>
              <GoldButton label={t('landing.supportCta')} icon="heart-outline" onPress={() => router.push(signedIn ? '/pro' : '/sign-up')} />
            </View>
          </Container>
        </View>

        {/* Perguntas frequentes */}
        <View onLayout={(e) => {
          y.current.faq = e.nativeEvent.layout.y;
        }} style={{ paddingVertical: 56 }}>
          <Container style={{ maxWidth: 820 }}>
            <SectionTitle wide={wide} kicker="landing.faqKicker" title="landing.faqTitle" />
            {FAQ.map((f, i) => (
              <Pressable
                key={f.q}
                accessibilityRole="button"
                accessibilityState={{ expanded: openFaq === i }}
                onPress={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 18, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.bodyBold, fontSize: 17 }}>{t(f.q)}</RNText>
                  <Ionicons name={openFaq === i ? 'remove' : 'add'} size={22} color={colors.gold} />
                </View>
                {openFaq === i ? <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 16, lineHeight: 25 }}>{t(f.a)}</RNText> : null}
              </Pressable>
            ))}
          </Container>
        </View>

        {/* Chamada final */}
        <View style={{ paddingVertical: 64, alignItems: 'center', gap: 18, backgroundColor: colors.surfaceAlt, borderTopWidth: 1, borderColor: colors.border }}>
          <Container style={{ alignItems: 'center', gap: 18 }}>
            <Seal size={64} />
            <RNText style={{ color: colors.text, fontFamily: fonts.display, fontSize: wide ? 40 : 28, textAlign: 'center' }}>{t('landing.finalTitle')}</RNText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <GoldButton label={signedIn ? t('landing.openApp') : t('landing.start')} icon="arrow-forward" onPress={start} />
              <GoldButton label={t('landing.menu.shareScreen')} icon="qr-code-outline" onPress={shareScreen} outline />
            </View>
          </Container>
        </View>

        {/* Rodapé */}
        <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingVertical: 28 }}>
          <Container style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: 14 }}>
            <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, flex: wide ? 1 : undefined, textAlign: wide ? 'left' : 'center' }}>
              © {new Date().getFullYear()} BibleAlpha · {t('landing.footer')}
            </RNText>
            <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
              <FooterLink label={t('auth.terms')} onPress={() => router.push('/legal/terms')} />
              <FooterLink label={t('auth.privacy')} onPress={() => router.push('/legal/privacy')} />
              <FooterLink label={t('landing.menu.shareScreen')} onPress={shareScreen} />
              <FooterLink label={signedIn ? t('landing.openApp') : t('landing.signIn')} onPress={openApp} />
            </View>
          </Container>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const MAX_W = 1120;

function Container({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[{ width: '100%', maxWidth: MAX_W, alignSelf: 'center', paddingHorizontal: 20 }, style]}>{children}</View>;
}

function SectionTitle({ kicker, title, subtitle, wide }: { kicker: TranslationKey; title: TranslationKey; subtitle?: TranslationKey; wide: boolean }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, marginBottom: 28 }}>
      <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, letterSpacing: 2, fontSize: 13, textTransform: 'uppercase' }}>{t(kicker)}</RNText>
      <RNText style={{ color: colors.text, fontFamily: fonts.display, fontSize: wide ? 44 : 32, textAlign: 'center', lineHeight: wide ? 52 : 38 }}>{t(title)}</RNText>
      {subtitle ? (
        <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 17, textAlign: 'center', maxWidth: 720, lineHeight: 26 }}>{t(subtitle)}</RNText>
      ) : null}
    </View>
  );
}

function Grid({ items, cols }: { items: { icon: Icon; title: TranslationKey; body: TranslationKey }[]; cols: number }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      {items.map((f) => (
        <View
          key={f.title}
          style={{
            flexBasis: cols === 1 ? '100%' : cols === 2 ? '47%' : '31%',
            flexGrow: 1,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: 22,
            gap: 10,
          }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={f.icon} size={22} color={colors.gold} />
          </View>
          <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 18 }}>{t(f.title)}</RNText>
          <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 }}>{t(f.body)}</RNText>
        </View>
      ))}
    </View>
  );
}

function GoldButton({ label, icon, onPress, outline }: { label: string; icon?: Icon; onPress: () => void; outline?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 22,
        paddingVertical: 14,
        borderRadius: radius.pill,
        backgroundColor: outline ? 'transparent' : colors.gold,
        borderWidth: 1.5,
        borderColor: colors.gold,
        opacity: pressed ? 0.8 : 1,
      })}>
      {icon ? <Ionicons name={icon} size={19} color={outline ? colors.gold : colors.onGold} /> : null}
      <RNText style={{ color: outline ? colors.gold : colors.onGold, fontFamily: fonts.bodyBold, fontSize: 16 }}>{label}</RNText>
    </Pressable>
  );
}

function StoreBadge({ icon, name, url }: { icon: Icon; name: string; url: string | null }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const ready = !!url;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ disabled: !ready }}
      accessibilityLabel={`${t(ready ? 'landing.downloadOn' : 'landing.downloadSoon')} ${name}`}
      disabled={!ready}
      onPress={() => url && Linking.openURL(url)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minWidth: 230,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: ready ? colors.gold : colors.border,
        backgroundColor: ready ? colors.surface : 'transparent',
        opacity: pressed ? 0.8 : ready ? 1 : 0.6,
      })}>
      <Ionicons name={icon} size={30} color={ready ? colors.gold : colors.textMuted} />
      <View>
        <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>{t(ready ? 'landing.downloadOn' : 'landing.downloadSoon')}</RNText>
        <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 18 }}>{name}</RNText>
      </View>
    </Pressable>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress}>
      <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium, fontSize: 14 }}>{label}</RNText>
    </Pressable>
  );
}

function LangSwitch({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, overflow: 'hidden' }}>
      {LANGS.map((l) => {
        const on = locale === l.code;
        return (
          <Pressable key={l.code} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(l.code)} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: on ? colors.gold : 'transparent' }}>
            <RNText style={{ color: on ? colors.onGold : colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 12 }}>{l.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
