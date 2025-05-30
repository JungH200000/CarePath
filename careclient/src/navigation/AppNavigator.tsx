// React 및 React Navigation 관련 모듈 import
import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {NavigationContainer} from '@react-navigation/native';

// 네비게이션에 사용될 각 화면 컴포넌트 import
import IntroScreen from '../screens/IntroScreen';
import LoginScreen from '../screens/LoginScreen';
import MapScreen from '../screens/MapScreen'; // 사용자(노인)용 메인 지도 화면
import RegisterChoiceScreen from '../screens/RegisterChoiceScreen';
import RegisterSeniorScreen from '../screens/RegisterSeniorScreen';
import RegisterCaregiverScreen from '../screens/RegisterCaregiverScreen';
import SettingScreen from '../screens/SettingScreen';
import CaregiverMapScreen from '../screens/CaregiverMapScreen'; // 보호자용 메인 지도 화면

/**
 * @brief RootStackParamList 타입 정의
 * @description 앱 전체 네비게이션 스택에서 사용될 화면들의 이름과
 *              각 화면으로 이동 시 전달받을 수 있는 파라미터의 타입을 정의합니다.
 *              파라미터가 없는 화면은 'undefined'로 지정합니다.
 */
export type RootStackParamList = {
  Intro: undefined; // 앱 시작 시 보여지는 인트로 화면
  Login: undefined; // 로그인 화면
  RegisterChoice: undefined; // 회원가입 유형 선택 화면
  RegisterSenior: undefined; // 노인 사용자 회원가입 화면
  RegisterCaregiver: undefined; // 보호자 사용자 회원가입 화면
  Setting: undefined; // 설정 화면
  Map: undefined; // 노인 사용자용 메인 지도 화면
  CaregiverMap: undefined; // 보호자용 메인 지도 화면
};

// Stack Navigator 인스턴스 생성 (RootStackParamList 타입 적용)
const Stack = createStackNavigator<RootStackParamList>();

/**
 * @brief 앱의 메인 네비게이터 컴포넌트
 * @description NavigationContainer와 Stack.Navigator를 사용하여 앱의 전체 화면 흐름을 정의합니다.
 *              초기 화면은 IntroScreen으로 설정하고, 모든 화면의 기본 헤더는 숨김 처리합니다.
 */
const AppNavigator = () => {
  return (
    // 네비게이션 트리를 감싸는 최상위 컨테이너
    <NavigationContainer>
      {/* 스택 네비게이션 설정 */}
      <Stack.Navigator
        initialRouteName="Intro" // 앱 실행 시 가장 먼저 보여줄 화면
        screenOptions={{headerShown: false}} // 모든 화면의 헤더(상단 바) 숨김
      >
        {/* 각 화면을 스택에 등록 */}
        <Stack.Screen name="Intro" component={IntroScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="RegisterChoice" component={RegisterChoiceScreen} />
        <Stack.Screen name="RegisterSenior" component={RegisterSeniorScreen} />
        <Stack.Screen
          name="RegisterCaregiver"
          component={RegisterCaregiverScreen}
        />
        <Stack.Screen name="Setting" component={SettingScreen} />
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="CaregiverMap" component={CaregiverMapScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
