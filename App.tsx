import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppProvider } from './src/context/AppContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import { configureNotificationHandler, requestNotificationPermissionsAsync } from './src/utils/notifications';

const Gate: React.FC = () => {
  const { session, initializing } = useAuth();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    if (session) {
      requestNotificationPermissionsAsync();
    }
  }, [!!session]);

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
