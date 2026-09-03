import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/theme';
import LiquidGlassTabBar from '../components/LiquidGlassTabBar';

import DatesScreen from '../screens/DatesScreen';
import FriendsListScreen from '../screens/FriendsListScreen';
import FriendProfileScreen from '../screens/FriendProfileScreen';
import ContactProfileScreen from '../screens/ContactProfileScreen'; // <-- 1. Import qilindi
import AddFriendScreen from '../screens/AddFriendScreen';
import ProfileScreen from '../screens/ProfileScreen';
import StoriesScreen from '../screens/StoriesScreen';

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

const RootNavigator: React.FC = () => {
  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {/* Pastki tab menyu */}
        <RootStack.Screen name="MainTabs" component={MainTabs} />

        {/* Ekranlar */}
        <RootStack.Screen
          name="FriendProfile"
          component={FriendProfileScreen}
          options={{ presentation: 'card' }}
        />
        <RootStack.Screen
          name="ContactProfile"
          component={ContactProfileScreen}
          options={{ presentation: 'card' }} // <-- 2. RootStack ga qo'shildi!
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
