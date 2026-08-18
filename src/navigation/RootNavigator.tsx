import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/theme';

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
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bgElevated,
            borderTopColor: colors.border,
            height: 88,
            paddingTop: 8,
            paddingBottom: 28,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarIcon: ({ color, size, focused }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';
            if (route.name === 'DatesTab') iconName = focused ? 'calendar' : 'calendar-outline';
            if (route.name === 'FriendsTab') iconName = focused ? 'people' : 'people-outline';
            if (route.name === 'ProfileTab') iconName = focused ? 'person-circle' : 'person-circle-outline';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="DatesTab" component={DatesStackNavigator} options={{ title: 'Dates' }} />
        <Tab.Screen name="FriendsTab" component={FriendsStackNavigator} options={{ title: 'Friends' }} />
        <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
