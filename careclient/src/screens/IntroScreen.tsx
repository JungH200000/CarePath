import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  ImageBackground,
  StyleSheet,
  Alert,
  BackHandler,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';

const BACKGROUND_IMAGE = require('../assets/images/intro.png');

const IntroScreen = () => {
  const navigation = useNavigation();

  // 위치 권한 2번 거부 시 앱 종료를 위해, 거부 횟수를 추적
  const [locationDenialCount, setLocationDenialCount] = useState(0);

  // 모든 권한 로직이 끝난 뒤(또는 알림 권한 거부 후) 2초 후 로그인으로 이동할지 여부
  const [goLogin, setGoLogin] = useState(false);

  /**
   * 앱이 실행되면 가장 먼저 위치 권한을 체크/요청
   */
  useEffect(() => {
    checkLocationPermission();
  }, []);

  /**
   * 위치 권한 체크/요청
   * - 2번 연속 거부 시, Alert 후 앱 종료
   * - 허용 시 -> 알림 권한 체크
   */
  const checkLocationPermission = async () => {
    const locationCheck = await check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
    if (locationCheck === RESULTS.GRANTED) {
      // 이미 위치 권한이 허용되어 있으면 바로 알림 권한 체크
      checkNotificationPermission();
    } else if (locationCheck === RESULTS.DENIED) {
      // 아직 권한 없으니 요청
      const locationRequest = await request(
        PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
      );
      if (locationRequest === RESULTS.GRANTED) {
        // 위치 권한 허용됨 -> 알림 권한 체크
        checkNotificationPermission();
      } else {
        // 위치 권한 계속 거부
        Alert.alert(
          '위치 권한 필요',
          '이 앱을 사용하기 위해 위치 권한이 필요합니다.',
          [
            {
              text: '확인',
              onPress: () => {
                // 확인 누른 후 다시 위치 권한을 요청 (무한 반복 가능성)
                checkLocationPermission();
              },
            },
          ],
        );
      }
    } else {
      // BLOCKED or 다른 상태(never ask again 등)
      // Alert 후 다시 시도
      Alert.alert(
        '위치 권한 필요',
        '이 앱을 사용하기 위해 위치 권한이 필요합니다. [앱 설정]에서 권한을 허용해 주세요.',
        [
          {
            text: '확인',
            onPress: () => {
              // 다시 체크 시도
              checkLocationPermission();
            },
          },
        ],
      );
    }
  };

  /**
   * 알림 권한 체크/요청
   * - 거부해도 2초 후 로그인 화면으로 넘어가지만,
   *   앱 재실행 시 다시 알림 권한을 요청하게 됨
   */
  const checkNotificationPermission = async () => {
    const notifyCheck = await check(PERMISSIONS.ANDROID.POST_NOTIFICATIONS);

    if (notifyCheck === RESULTS.GRANTED) {
      // 알림 권한 이미 허용
      setGoLogin(true);
    } else if (notifyCheck === RESULTS.DENIED) {
      // 요청
      const notifyRequest = await request(
        PERMISSIONS.ANDROID.POST_NOTIFICATIONS,
      );
      if (notifyRequest === RESULTS.GRANTED) {
        setGoLogin(true);
      } else {
        // 거부 -> 그래도 로그인으로 넘어가되, 앱 재실행 시 다시 물어봄
        setGoLogin(true);
      }
    } else {
      // BLOCKED or never ask again
      // 그래도 로그인으로 넘어가되, 앱 재실행 시 다시 물어봄
      setGoLogin(true);
    }
  };

  // goLogin이 true면 2초 뒤 Login 화면으로 이동
  useEffect(() => {
    if (goLogin) {
      const timer = setTimeout(() => {
        navigation.navigate('Login' as never);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [goLogin, navigation, locationDenialCount]);

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.background}>
        <View style={styles.overlay}>
          <Text style={styles.title}>안전한 길, 함께 걷겠습니다</Text>
        </View>
      </ImageBackground>
    </View>
  );
};

export default IntroScreen;

const styles = StyleSheet.create({
  container: {flex: 1},
  background: {flex: 1, justifyContent: 'center'},
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {color: '#fff', fontSize: 26, fontWeight: 'bold'},
});
