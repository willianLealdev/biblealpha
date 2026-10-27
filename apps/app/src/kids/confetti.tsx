// Chuva de confete na tela inteira quando a criança vence (toda tela de vitória usa o Celebrate,
// que dispara isto). Fica por cima de tudo e não atrapalha os toques.

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { kidsColors } from './theme';

const COLORS = [kidsColors.orange, kidsColors.blue, kidsColors.green, kidsColors.pink, kidsColors.yellow, kidsColors.purple, '#FF4D4D', '#FFD700'];
const PIECES = 110;

type Piece = { x: number; drift: number; size: number; color: string; delay: number; time: number; spin: number; round: boolean };
type Burst = { id: number; pieces: Piece[] };

const ConfettiContext = createContext<() => void>(() => {});

/** Dispara a chuva de confete. */
export const useConfetti = () => useContext(ConfettiContext);

export function ConfettiProvider({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const fire = useCallback(() => {
    const pieces = Array.from({ length: PIECES }, () => ({
      x: Math.random(),
      drift: (Math.random() - 0.5) * 160,
      size: 8 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 700,
      time: 2200 + Math.random() * 1600,
      spin: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4),
      round: Math.random() < 0.3,
    }));
    const id = Date.now() + Math.random();
    setBursts((list) => [...list.slice(-1), { id, pieces }]);
    setTimeout(() => setBursts((list) => list.filter((b) => b.id !== id)), 4800);
  }, []);

  return (
    <ConfettiContext.Provider value={fire}>
      <View style={{ flex: 1 }}>
        {children}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {bursts.map((b) => (
            <Rain key={b.id} pieces={b.pieces} />
          ))}
        </View>
      </View>
    </ConfettiContext.Provider>
  );
}

function Rain({ pieces }: { pieces: Piece[] }) {
  const { width, height } = useWindowDimensions();
  const values = useMemo(() => pieces.map(() => new Animated.Value(0)), [pieces]);
  useEffect(() => {
    Animated.parallel(
      values.map((v, i) =>
        Animated.timing(v, { toValue: 1, duration: pieces[i].time, delay: pieces[i].delay, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ),
    ).start();
  }, [values, pieces]);

  return (
    <>
      {pieces.map((p, i) => {
        const v = values[i];
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x * width,
              top: -30,
              width: p.size,
              height: p.round ? p.size : p.size * 0.45,
              borderRadius: p.round ? p.size / 2 : 2,
              backgroundColor: p.color,
              transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, height + 60] }) },
                { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.drift, p.drift * 0.4] }) },
                { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] }) },
              ],
            }}
          />
        );
      })}
    </>
  );
}
