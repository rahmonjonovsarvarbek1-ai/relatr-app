import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/theme';
import LiquidGlassTabBar from '../components/LiquidGlassTabBar';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

import DatesScreen from '../screens/DatesScreen';
import FriendsListScreen from '../screens/FriendsListScreen';
import FriendProfileScreen from '../screens/FriendProfileScreen';
import ContactProfileScreen from '../screens/ContactProfileScreen';
import AddFriendScreen from '../screens/AddFriendScreen';
import ProfileScreen from '../screens/ProfileScreen';
import StoriesScreen from '../screens/StoriesScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingFlow from '../screens/onboarding/OnboardingFlow';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const MainTabs = () => (
  <Tab.Navigator
    tabBar={(props) => <LiquidGlassTabBar {...props} />}
    screenOptions={{
      headerShown: false,
    }}
  >
    <Tab.Screen name="DatesTab" component={DatesScreen} options={{ title: 'Dates' }} />
    <Tab.Screen name="FriendsTab" component={FriendsListScreen} options={{ title: 'Friends' }} />
    <Tab.Screen name="StoryTab" component={StoriesScreen} options={{ title: 'My Story' }} />
    <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
  </Tab.Navigator>
);

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

const FullScreenLoader: React.FC = () => (
  <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
    <ActivityIndicator color={colors.primary} size="large" />
  </View>
);

const RootNavigator: React.FC = () => {
  const { session, initializing } = useAuth();
  const { profile, loading: profileLoading } = useApp();

  // 1) Auth holati aniqlanmaguncha kutamiz (splash o'rniga oddiy loader).
  if (initializing) {
    return <FullScreenLoader />;
  }

  // 2) Sessiya yo'q -> Login/Sign up ekrani.
  if (!session) {
    return (
      <NavigationContainer theme={navTheme}>
        <LoginScreen />
      </NavigationContainer>
    );
  }

  // 3) Sessiya bor, lekin profil ma'lumotlari hali yuklanmoqda.
  if (profileLoading) {
    return <FullScreenLoader />;
  }

  // 4) Yangi foydalanuvchi (onboarding tugallanmagan) -> onboarding oqimi.
  //    `onboardingCompleted` UserProfile tipiga va `profiles` jadvaliga
  //    qo'shilishi kerak (pastdagi SQL bo'limiga qarang).
  if (!profile.onboardingCompleted) {
    return (
      <NavigationContainer theme={navTheme}>
        <OnboardingFlow />
      </NavigationContainer>
    );
  }

  // 5) Hammasi tayyor -> asosiy ilova.
  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={MainTabs} />
        <RootStack.Screen
          name="FriendProfile"
          component={FriendProfileScreen}
          options={{ presentation: 'card' }}
        />
        <RootStack.Screen
          name="ContactProfile"
          component={ContactProfileScreen}
          options={{ presentation: 'card' }}
        />
        <RootStack.Screen
          name="AddFriend"
          component={AddFriendScreen}
          options={{ presentation: 'modal' }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
