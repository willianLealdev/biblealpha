// Compromisso da agenda: data, horário, igreja, endereço (conforme o país), mensagem anexada e observações.
// Um dia antes chega um lembrete no e-mail.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { DatePicker, isoDate, TimePicker } from '@/components/date-time-picker';
import { Button, Card, Notice, Screen, Text, TextField } from '@/components/ui';
import { CountryField, PickerModal } from '@/components/world-picker';
import { useI18n, type TranslationKey } from '@/i18n';
import { addressLayout, agendaApi, type AgendaInput } from '@/lib/agenda';
import { useSession } from '@/lib/session';
import { sermonApi, type SermonSummary } from '@/lib/sermons';
import { loadWorld, type World } from '@/lib/world';
import { useTheme } from '@/theme';
import { radius } from '@/theme/tokens';

function blank(country: string | null): AgendaInput {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return {
    local_date: isoDate(d),
    local_time: '19:00',
    church_name: '',
    country,
    postal_code: null,
    street: null,
    number: null,
    complement: null,
    district: null,
    city: null,
    region: null,
    sermon_id: null,
    notes: '',
  };
}

export default function AgendaEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const user = useSession().user;
  const [form, setForm] = useState<AgendaInput | null>(isNew ? blank(user?.country ?? null) : null);
  const [sermonTitle, setSermonTitle] = useState<string | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [sermons, setSermons] = useState<SermonSummary[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickKey, setPickKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadWorld().then(setWorld).catch(() => {});
    if (!isNew)
      agendaApi
        .get(id)
        .then((e) => {
          setForm({
            local_date: e.local_date,
            local_time: e.local_time,
            church_name: e.church_name,
            country: e.country,
            postal_code: e.postal_code,
            street: e.street,
            number: e.number,
            complement: e.complement,
            district: e.district,
            city: e.city,
            region: e.region,
            sermon_id: e.sermon_id,
            notes: e.notes,
          });
          setSermonTitle(e.sermon_title);
        })
        .catch((e) => setError(errorMessage(e)));
  }, [id, isNew, errorMessage]);

  if (!form) {
    return (
      <Screen center>
        {error ? <Notice kind="error">{error}</Notice> : <ActivityIndicator color={colors.gold} />}
      </Screen>
    );
  }

  const set = <K extends keyof AgendaInput>(k: K, v: AgendaInput[K]) => {
    setSaved(false);
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };

  async function openPicker() {
    setPickKey((n) => n + 1);
    setPicking(true);
    if (!sermons) sermonApi.list().then((r) => setSermons(r.sermons)).catch(() => setSermons([]));
  }

  async function pickSermon(key: string) {
    setPicking(false);
    if (key === '__none') {
      set('sermon_id', null);
      setSermonTitle(null);
    } else if (key === '__new') {
      // Mensagem nova em branco, já anexada a este compromisso
      try {
        const title = form!.church_name.trim() ? `${t('agenda.messageFor')} ${form!.church_name.trim()}` : undefined;
        const s = await sermonApi.create({ kind: 'thematic', use_template: true, ...(title ? { title } : {}) });
        set('sermon_id', s.id);
        setSermonTitle(s.title);
      } catch (e) {
        setError(errorMessage(e));
      }
    } else {
      set('sermon_id', key);
      setSermonTitle(sermons?.find((s) => s.id === key)?.title ?? null);
    }
  }

  async function save() {
    if (!form!.church_name.trim()) {
      setError(t('agenda.churchRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(form!).map(([k, v]) => [k, typeof v === 'string' && k !== 'notes' ? v.trim() || null : v])) as AgendaInput;
      clean.church_name = form!.church_name.trim();
      if (isNew) {
        const e = await agendaApi.create(clean);
        router.replace({ pathname: '/agenda/[id]', params: { id: e.id } });
      } else {
        await agendaApi.update(id, clean);
      }
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    await agendaApi.remove(id).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/agenda');
  }

  const when = new Date(`${form.local_date}T${form.local_time}:00`);

  return (
    <Screen>
      <Text variant="title">{isNew ? t('agenda.new') : form.church_name || t('agenda.event')}</Text>
      <Text variant="muted">{when.toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' })}</Text>
      {error ? <Notice kind="error">{error}</Notice> : null}

      <Text variant="label">{t('agenda.date')}</Text>
      <DatePicker value={form.local_date} onChange={(v) => set('local_date', v)} />
      <Text variant="label">{t('agenda.time')}</Text>
      <TimePicker value={form.local_time} onChange={(v) => set('local_time', v)} />

      <TextField label={t('agenda.church')} value={form.church_name} onChangeText={(v) => set('church_name', v)} maxLength={160} />
      {world ? <CountryField world={world} value={form.country} onChange={(c) => set('country', c)} /> : null}
      {addressLayout(form.country).map(({ field, label }) => (
        <TextField
          key={field}
          label={t(`agenda.field_${label}` as TranslationKey)}
          value={form[field] ?? ''}
          onChangeText={(v) => set(field, v)}
          maxLength={field === 'street' ? 200 : field === 'number' || field === 'postal_code' ? 20 : 120}
          keyboardType={field === 'postal_code' && form.country === 'BR' ? 'number-pad' : 'default'}
        />
      ))}

      <Text variant="label">{t('agenda.message')}</Text>
      <Card>
        <Pressable accessibilityRole="button" onPress={openPicker} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name={form.sermon_id ? 'document-text' : 'attach-outline'} size={22} color={colors.gold} />
          <Text variant="body" style={{ flex: 1 }}>
            {sermonTitle ?? t('agenda.attachMessage')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        {form.sermon_id ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" icon="open-outline" title={t('agenda.openMessage')} onPress={() => router.push({ pathname: '/sermon/[id]', params: { id: form.sermon_id! } })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" icon="easel-outline" title={t('sermons.pulpit.open')} onPress={() => router.push({ pathname: '/sermon/[id]/pulpit', params: { id: form.sermon_id! } })} />
            </View>
          </View>
        ) : null}
      </Card>

      <TextField label={t('agenda.notes')} value={form.notes} onChangeText={(v) => set('notes', v)} multiline maxLength={5000} style={{ minHeight: 100, textAlignVertical: 'top' }} />
      <Text variant="small">{t('agenda.reminderInfo')}</Text>

      {saved ? <Notice kind="success">{t('agenda.saved')}</Notice> : null}
      <Button icon="checkmark" title={t('agenda.save')} onPress={save} loading={saving} />
      {!isNew ? (
        <View style={{ borderRadius: radius.md }}>
          <Button kind="ghost" icon="trash-outline" title={confirmDelete ? t('agenda.confirmDelete') : t('agenda.delete')} onPress={remove} />
        </View>
      ) : null}

      <PickerModal
        key={pickKey}
        visible={picking}
        title={t('agenda.attachMessage')}
        items={[
          { key: '__new', title: t('agenda.newMessage'), left: '＋' },
          ...(form.sermon_id ? [{ key: '__none', title: t('agenda.noMessage'), left: '✕' }] : []),
          ...(sermons ?? []).map((s) => ({ key: s.id, title: s.title, subtitle: s.main_reference ?? undefined, left: '📄' })),
        ]}
        onPick={pickSermon}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}
