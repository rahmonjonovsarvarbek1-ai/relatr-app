import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppProvider } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import AuthScreen from './src/screens/AuthScreen';
import { colors } from './src/theme/theme';
import { configureNotificationHandler, requestNotificationPermissionsAsync } from './src/utils/notifications';

const Gate: React.FC = () => {
  const { session, initializing } = useAuth();

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
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <AppProvider>
      <RootNavigator />
    </AppProvider>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
