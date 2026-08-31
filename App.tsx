import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppProvider } from './src/context/AppContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import AuthScreen from './src/screens/AuthScreen';
import { configureNotificationHandler, requestNotificationPermissionsAsync } from './src/utils/notifications';

const Gate: React.FC = () => {
  const { session, initializing } = useAuth();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    if (session) {
      // Ask for permission once the user is signed in. If they say no,
      // the pushEnabled toggle in Profile settings will simply have no
      // effect until they grant it from the OS settings.
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

  if (!session) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AuthScreen />
      </>
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
      <SafeAreaProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
