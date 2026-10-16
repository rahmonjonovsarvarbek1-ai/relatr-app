import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  type NavigatorScreenParams,
  type Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';

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
import WorldSpecialDays from '../screens/WorldSpecialDays';
import SpecialDayDetail from '../screens/SpecialDayDetail';

/* -------------------------------------------------------------------------- */
/*  Navigatsiya tiplari                                                       */
/* -------------------------------------------------------------------------- */

export type MainTabParamList = {
  DatesTab: undefined;
  FriendsTab: undefined;
  StoryTab: undefined;
  ProfileTab: undefined;
};

export type SpecialDayDetailParams = {
  dayId: string;
  name: string;
  localName?: string | null;
  icon?: string | null;
  category?: string | null;
  month?: number | null;
  day?: number | null;
  isoDate: string | null;
  countryCode: string;
  countryLabel: string;
};

export type RootStackParamList = {
  // Auth oqimi
  Login: undefined;
  Onboarding: undefined;

  // Asosiy ilova
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  FriendProfile: { friendId?: string } | undefined;
  ContactProfile: { contactId?: string } | undefined;
  AddFriend: undefined;
  WorldSpecialDays: undefined;
  SpecialDayDetail: SpecialDayDetailParams;
};

// `useNavigation()` ni har joyda generic'siz tiplash uchun.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

/* -------------------------------------------------------------------------- */
/*  Navigatorlar va umumiy sozlamalar                                         */
/* -------------------------------------------------------------------------- */

const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
};

const cardOptions: NativeStackNavigationOptions = {
  presentation: 'card',
  animation: 'slide_from_right',
};

const modalOptions: NativeStackNavigationOptions = {
  presentation: 'modal',
};

const navTheme: Theme = {
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

/* -------------------------------------------------------------------------- */
/*  Pastki tablar                                                             */
/* -------------------------------------------------------------------------- */

const MainTabs: React.FC = () => (
  <Tab.Navigator
    tabBar={(props) => <LiquidGlassTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen name="DatesTab" component={DatesScreen} options={{ title: 'Dates' }} />
    <Tab.Screen name="FriendsTab" component={FriendsListScreen} options={{ title: 'Friends' }} />
    <Tab.Screen name="StoryTab" component={StoriesScreen} options={{ title: 'My Story' }} />
    <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
  </Tab.Navigator>
);

/* -------------------------------------------------------------------------- */
/*  Loader                                                                    */
/* -------------------------------------------------------------------------- */

const FullScreenLoader: React.FC = () => (
  <View style={styles.loader}>
    <ActivityIndicator color={colors.primary} size="large" />
  </View>
);

/* -------------------------------------------------------------------------- */
/*  Root navigator                                                            */
/* -------------------------------------------------------------------------- */

const RootNavigator: React.FC = () => {
  const { session, initializing } = useAuth();
  const { profile, loading: profileLoading } = useApp();

  // Auth yoki profil yuklanayotgan paytda loader ko'rsatamiz.
  // Container render qilinmaydi, shuning uchun noto'g'ri ekranga o'tish bo'lmaydi.
  if (initializing || (session && profileLoading)) {
    return <FullScreenLoader />;
  }

  const isSignedIn = !!session;
  const needsOnboarding = isSignedIn && !profile?.onboardingCompleted;

  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={stackScreenOptions}>
        {!isSignedIn ? (
          // 1) Sessiya yo'q -> Login / Sign up
          <RootStack.Screen name="Login" component={LoginScreen} />
        ) : needsOnboarding ? (
          // 2) Sessiya bor, lekin onboarding tugallanmagan
          <RootStack.Screen name="Onboarding" component={OnboardingFlow} />
        ) : (
          // 3) Hammasi tayyor -> asosiy ilova
          <>
            <RootStack.Screen name="MainTabs" component={MainTabs} />
            <RootStack.Screen
              name="FriendProfile"
              component={FriendProfileScreen}
              options={cardOptions}
            />
            <RootStack.Screen
              name="ContactProfile"
              component={ContactProfileScreen}
              options={cardOptions}
            />
            <RootStack.Screen
              name="WorldSpecialDays"
              component={WorldSpecialDays}
              options={cardOptions}
            />
            <RootStack.Screen
              name="SpecialDayDetail"
              component={SpecialDayDetail}
              options={cardOptions}
            />
            <RootStack.Screen
              name="AddFriend"
              component={AddFriendScreen}
              options={modalOptions}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RootNavigator;
