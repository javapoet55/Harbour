import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { calendarCandidates, calendarMomentInput, deviceCalendars, type CalendarCandidate, type CalendarChoice } from '../../../../src/features/moments/device';
import { FormButton, FormLink, FormRow, FormScroll, FormSection, FormText } from '../../../../src/features/moments/form';

/**
 * `MomentCalendarImportView` (ios/App/MomentEditor.swift:288-310). Reads the DEVICE calendar the
 * person picks — one calendar, recurring "birthday" / "anniversary" events in the next year, at most
 * 100 — and opens each candidate in the editor for review. Nothing is read until "Allow calendar
 * access" is tapped, and nothing leaves the phone that the person does not save.
 */
export default function CalendarImportScreen() {
  const [calendars, setCalendars] = useState<CalendarChoice[]>([]);
  const [candidates, setCandidates] = useState<CalendarCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const allow = async () => {
    setLoading(true);
    try {
      setCalendars(await deviceCalendars());
    } catch {
      setError('Calendar access is unavailable. Enable Calendar access for Nexdo in iOS Settings.');
    } finally {
      setLoading(false);
    }
  };

  const open = async (candidate: CalendarCandidate) => {
    const input = await calendarMomentInput(candidate);
    router.push({ pathname: '/moments/editor', params: { imported: JSON.stringify(input), done: 'back' } });
  };

  return (
    <View style={styles.fill}>
      <FormScroll testID="calendar-import">
        <FormSection>
          <FormRow>
            <FormText>Nexdo reads only the calendar you choose to suggest recurring birthday or anniversary candidates. You review each candidate before saving. Calendar access stays on this device.</FormText>
          </FormRow>
          <FormRow last={calendars.length === 0 && !loading && !error}>
            <FormButton title="Allow calendar access" onPress={() => void allow()} testID="calendar-allow" />
          </FormRow>
          {calendars.map((calendar, index) => (
            <FormRow key={calendar.id} last={index === calendars.length - 1 && !loading && !error}>
              <FormButton title={calendar.title} onPress={() => void calendarCandidates(calendar.id).then(setCandidates)} testID={`calendar-${calendar.id}`} />
            </FormRow>
          ))}
          {loading ? (
            <FormRow last={!error}>
              <ActivityIndicator />
            </FormRow>
          ) : null}
          {error ? (
            <FormRow last>
              <FormText tone="danger" testID="calendar-error">
                {error}
              </FormText>
            </FormRow>
          ) : null}
        </FormSection>
        <FormSection header="Review candidates">
          {candidates.map((candidate, index) => (
            <FormRow key={candidate.id} last={index === candidates.length - 1}>
              <FormLink title={candidate.title} onPress={() => void open(candidate)} testID={`candidate-${candidate.id}`} />
            </FormRow>
          ))}
          {candidates.length === 0 ? (
            <FormRow last>
              <FormText tone="secondary" testID="calendar-empty">
                No candidates loaded. Select a calendar, or add a moment manually.
              </FormText>
            </FormRow>
          ) : null}
        </FormSection>
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
