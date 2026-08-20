import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/theme';
import LiquidGlassTabBar from '../components/LiquidGlassTabBar';

import DatesScreen from '../screens/DatesScreen';
import FriendsListScreen from '../screens/FriendsListScreen';
import FriendProfileScreen from '../screens/FriendProfileScreen';
import AddFriendScreen from '../screens/AddFriendScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const FriendsStack = createNativeStackNavigator();
const DatesStack = createNativeStackNavigator();

const FriendsStackNavigator = () => (
  <FriendsStack.Navigator screenOptions={{ headerShown: false }}>
    <FriendsStack.Screen name="FriendsList" component={FriendsListScreen} />
    <FriendsStack.Screen
      name="FriendProfile"
      component={FriendProfileScreen}
      options={{ presentation: 'card' }}
    />
    <FriendsStack.Screen
      name="AddFriend"
      component={AddFriendScreen}
      options={{ presentation: 'modal' }}
    />
  </FriendsStack.Navigator>
);

const DatesStackNavigator = () => (
  <DatesStack.Navigator screenOptions={{ headerShown: false }}>
    <DatesStack.Screen name="DatesHome" component={DatesScreen} />
  </DatesStack.Navigator>
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
      <Tab.Navigator
        tabBar={(props) => <LiquidGlassTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tab.Screen name="DatesTab" component={DatesStackNavigator} options={{ title: 'Dates' }} />
        <Tab.Screen name="FriendsTab" component={FriendsStackNavigator} options={{ title: 'Friends' }} />
        <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
