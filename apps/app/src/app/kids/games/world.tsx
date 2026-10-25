import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { gameName, GAMES } from '@/kids/journey';
import { type Place, placeFact, placeName, placeRef, PLACES } from '@/kids/places';
import { useSpeaker } from '@/kids/speak';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { BackButton, KidsScreen, PillButton } from '@/kids/ui';

/** Mundo bíblico: mapa ilustrativo com os lugares das histórias; cada lugar leva a um jogo. */
export default function World() {
  const { t, language } = useKidsText();
  const { speak } = useSpeaker(language);
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<Place | null>(null);
  const mapWidth = Math.min(width - 32, 760);
  const mapHeight = mapWidth * 0.75;
  const game = open ? GAMES.find((g) => g.id === open.game) : null;

  return (
    <KidsScreen>
      <BackButton to="/kids/games" />
      <Text style={styles.title} accessibilityRole="header">
        🗺️ {t('world_title')}
      </Text>
      <Text style={styles.desc}>{t('world_desc')}</Text>
      <View style={[styles.map, { width: mapWidth, height: mapHeight }]}>
        {/* Mar Mediterrâneo, Mar Vermelho e Mar da Galileia em traço simples (sem escala) */}
        <Svg width={mapWidth} height={mapHeight} viewBox="0 0 100 75" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
          <Path d="M0 8 Q20 4 34 14 Q42 22 44 34 Q40 44 30 48 Q16 50 0 46 Z" fill="#8FD0FF" />
          <Path d="M40 52 Q44 58 46 66 L49 75 L44 75 Q40 64 37 56 Z" fill="#8FD0FF" />
          <Path d="M52 21 Q55 20 56 23 Q55 26 52 25 Z" fill="#8FD0FF" />
          <Path d="M88 6 Q92 30 96 56" stroke="#8FD0FF" strokeWidth={1.4} fill="none" />
          <Path d="M76 8 Q80 30 90 56" stroke="#8FD0FF" strokeWidth={1.2} fill="none" />
        </Svg>
        {PLACES.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={t(placeName(p.id))}
            onPress={() => {
              setOpen(p);
              speak(`${t(placeName(p.id))}. ${t(placeFact(p.id))}`);
            }}
            style={[styles.pin, { left: `${p.x}%`, top: `${p.y}%` }, open?.id === p.id && styles.pinOn]}>
            <Text style={styles.pinEmoji}>{p.emoji}</Text>
          </Pressable>
        ))}
      </View>
      {/* Os nomes ficam aqui embaixo: no mapa eles se encostavam no celular */}
      <View style={styles.list}>
        {PLACES.map((p) => (
          <PillButton
            key={p.id}
            label={`${p.emoji} ${t(placeName(p.id))}`}
            active={open?.id === p.id}
            color={kidsColors.blue}
            onPress={() => {
              setOpen(p);
              speak(`${t(placeName(p.id))}. ${t(placeFact(p.id))}`);
            }}
            textSize={15}
          />
        ))}
      </View>
      <Text style={styles.note}>{t('world_note')}</Text>
      {open ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {open.emoji} {t(placeName(open.id))}
          </Text>
          <Text style={styles.cardText}>{t(placeFact(open.id))}</Text>
          <Text style={styles.cardRef}>📜 {t(placeRef(open.id))}</Text>
          {game ? (
            <PillButton label={`${game.emoji} ${t('world_play', { game: t(gameName(game.id)) })}`} color={kidsColors.orange} onPress={() => router.push(game.route)} />
          ) : null}
        </View>
      ) : null}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  desc: { fontFamily: kidsFonts.regular, fontSize: 17, color: kidsColors.text },
  map: { alignSelf: 'center', backgroundColor: '#F2DFB4', borderRadius: kidsRadius.lg, borderWidth: 4, borderColor: '#C9A46A', overflow: 'hidden' },
  pin: { position: 'absolute', width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: 20, backgroundColor: kidsColors.card, borderWidth: 2, borderColor: kidsColors.blue, alignItems: 'center', justifyContent: 'center' },
  pinOn: { transform: [{ scale: 1.3 }], borderColor: kidsColors.orange, borderWidth: 3 },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pinEmoji: { fontSize: 22 },
  note: { fontFamily: kidsFonts.regular, fontSize: 13, color: kidsColors.textMuted, textAlign: 'center' },
  card: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.blue, padding: 16, gap: 8 },
  cardTitle: { fontFamily: kidsFonts.bold, fontSize: 22, color: kidsColors.text },
  cardText: { fontFamily: kidsFonts.regular, fontSize: 19, lineHeight: 27, color: kidsColors.text },
  cardRef: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted },
});
