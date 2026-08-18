import React from 'react';
import { View, StyleSheet } from 'react-native';

export interface DateFieldsProps {
  value?: string;
  yearKnown?: boolean;
  onChange?: (iso: string, known: boolean) => void;
  onDateChange?: (iso: string, known: boolean) => void;
}

export const DateFields: React.FC<DateFieldsProps> = ({
  value,
  yearKnown,
  onChange,
  onDateChange,
}) => {
  return (
    <View style={styles.container}>
      {/* DateFields UI komponenti */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
});

export default DateFields;