import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

export interface DateFieldsProps {
  value?: string;
  yearKnown?: boolean;
  onChange?: (iso: string, known: boolean) => void;
  onDateChange?: (iso: string, known: boolean) => void;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Used as a placeholder year when the person doesn't know/want to share the
// year — keeps the ISO date valid while `yearKnown` stays false so the rest
// of the app knows not to display an age.
const UNKNOWN_YEAR = 1900;

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1920 + 1 }, (_, i) => CURRENT_YEAR - i);

function daysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

const DateFields: React.FC<DateFieldsProps> = ({
  value,
  yearKnown = false,
  onChange,
  onDateChange,
}) => {
  const emit = onChange ?? onDateChange ?? (() => {});

  const parsed = useMemo(() => {
    const d = value ? new Date(value) : new Date();
    if (isNaN(d.getTime())) return new Date();
    return d;
  }, [value]);

  const day = parsed.getDate();
  const month = parsed.getMonth();
  const year = parsed.getFullYear();

  const commit = (nextDay: number, nextMonth: number, nextYear: number, nextKnown: boolean) => {
    const maxDay = daysInMonth(nextMonth, nextYear);
    const safeDay = Math.min(nextDay, maxDay);
    const iso = new Date(nextYear, nextMonth, safeDay, 12, 0, 0).toISOString();
    emit(iso, nextKnown);
  };

  const setDay = (d: number) => commit(d, month, yearKnown ? year : UNKNOWN_YEAR, yearKnown);
  const setMonth = (m: number) => commit(day, m, yearKnown ? year : UNKNOWN_YEAR, yearKnown);
  const setYear = (y: number) => commit(day, month, y, true);

  const toggleYearKnown = () => {
    const nextKnown = !yearKnown;
    commit(day, month, nextKnown ? (year === UNKNOWN_YEAR ? CURRENT_YEAR : year) : UNKNOWN_YEAR, nextKnown);
  };

  const dayOptions = Array.from({ length: daysInMonth(month, yearKnown ? year : UNKNOWN_YEAR) }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Month */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Month</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pickerScroll}
            contentContainerStyle={styles.pickerContent}
          >
            {MONTHS.map((m, i) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMonth(i)}
                style={[styles.pill, month === i && styles.pillActive]}
              >
                <Text style={[styles.pillText, month === i && styles.pillTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <View style={styles.row}>
        {/* Day */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Day</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pickerScroll}
            contentContainerStyle={styles.pickerContent}
          >
            {dayOptions.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDay(d)}
                style={[styles.pillSmall, day === d && styles.pillActive]}
              >
                <Text style={[styles.pillText, day === d && styles.pillTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Year known toggle */}
      <TouchableOpacity
        style={styles.yearToggle}
        onPress={toggleYearKnown}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[styles.checkbox, yearKnown && styles.checkboxActive]}>
          {yearKnown && <View style={styles.checkboxDot} />}
        </View>
        <Text style={styles.yearToggleText}>I know the year</Text>
      </TouchableOpacity>

      {yearKnown && (
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Year</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pickerScroll}
              contentContainerStyle={styles.pickerContent}
            >
              {YEARS.map((y) => (
                <TouchableOpacity
                  key={y}
                  onPress={() => setYear(y)}
                  style={[styles.pillSmall, year === y && styles.pillActive]}
                >
                  <Text style={[styles.pillText, year === y && styles.pillTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: spacing.xs },
  row: { marginBottom: spacing.sm },
  field: {},
  fieldLabel: {
    ...typography.caption,
    color: colors.textFaint,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  pickerScroll: { flexGrow: 0 },
  pickerContent: { paddingRight: spacing.md },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  pillSmall: {
    minWidth: 40,
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, color: colors.textDim, fontWeight: '600' },
  pillTextActive: { color: colors.bg },
  yearToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkboxDot: { width: 8, height: 8, borderRadius: 2, backgroundColor: colors.bg },
  yearToggleText: { ...typography.caption, color: colors.text, marginLeft: spacing.sm },
});

export default DateFields;