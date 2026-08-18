import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import { supabase } from './src/utils/supabase';

export default function App() {
  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase.from('profiles').select('*');
      console.log('Data:', data, 'Error:', error);
    }
    testConnection();
  }, []);

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}


