import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {RootStackParamList} from '../navigation/AppNavigator';
import {StackNavigationProp} from '@react-navigation/stack';
import database from '@react-native-firebase/database';

// ===== Navigation 타입 명시 =====
type LoginScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'Login'
>;

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 로그인 핸들러 (Firebase 직접 조회)
  const handleLogin = async () => {
    if (!name || !password) {
      Alert.alert('안내', '아이디(이름)와 비밀번호를 입력하세요.');
      return;
    }

    setLoading(true); // 로딩 시작

    try {
      // ===== Firebase DB에서 사용자 조회 =====
      const usersRef = database().ref('/users');
      const snapshot = await usersRef.once('value');
      const allGroups = snapshot.val();

      let foundUser: {
        groupId: string;
        userId: string;
        name: string;
        role: string;
      } | null = null;

      if (allGroups) {
        // 모든 그룹 순회
        for (const groupId in allGroups) {
          const groupData = allGroups[groupId];
          // 그룹 내 모든 사용자 순회
          for (const userId in groupData) {
            const user = groupData[userId];
            // 이름과 비밀번호 일치 확인 (클라이언트에서 비밀번호 비교는 보안상 취약!)
            if (user && user.name === name && user.password === password) {
              foundUser = {
                groupId,
                userId,
                name: user.name,
                role: user.role,
              };
              break; // 사용자 찾으면 내부 루프 종료
            }
          }
          if (foundUser) break; // 사용자 찾으면 외부 루프 종료
        }
      }

      // ===== 사용자 조회 결과 처리 =====
      if (foundUser) {
        // 사용자 찾음 -> AsyncStorage 저장 및 네비게이션
        await AsyncStorage.setItem('groupId', foundUser.groupId);
        await AsyncStorage.setItem('userId', foundUser.userId);
        await AsyncStorage.setItem('userName', foundUser.name);
        await AsyncStorage.setItem('role', foundUser.role);

        console.log(`Login successful! Role: ${foundUser.role}, Navigating...`);

        if (foundUser.role === 'senior') {
          navigation.reset({index: 0, routes: [{name: 'Map'}]});
        } else if (foundUser.role === 'caregiver') {
          navigation.reset({index: 0, routes: [{name: 'CaregiverMap'}]});
        } else {
          console.error('Unknown user role:', foundUser.role);
          Alert.alert('오류', '알 수 없는 사용자 역할입니다.');
        }
      } else {
        // 사용자 못 찾음
        Alert.alert('로그인 실패', '아이디 또는 비밀번호가 일치하지 않습니다.');
      }
    } catch (err: any) {
      console.error('Login error (Firebase):', err);
      Alert.alert(
        '오류',
        '로그인 중 오류가 발생했습니다. 네트워크 상태를 확인하거나 다시 시도해주세요.',
      );
    } finally {
      setLoading(false); // 로딩 종료
    }
  };

  // 회원가입 화면으로 이동
  const handleRegister = () => {
    navigation.navigate('RegisterChoice');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>로그인</Text>
      <TextInput
        style={[styles.input, {color: '#000'}]}
        placeholder="아이디(이름) 입력"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        editable={!loading} // 로딩 중 입력 방지
      />
      <TextInput
        style={[styles.input, {color: '#000'}]}
        placeholder="비밀번호 입력"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading} // 로딩 중 입력 방지
      />

      {/* 로딩 상태에 따라 버튼 비활성화 및 인디케이터 표시 */}
      <TouchableOpacity
        style={[styles.loginButton, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginButtonText}>로그인</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.registerButton, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}>
        <Text
          style={[
            styles.registerButtonText,
            loading && styles.buttonTextDisabled,
          ]}>
          회원가입
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default LoginScreen;

// 스타일
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F7EE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    marginBottom: 30,
    color: '#333',
    fontWeight: 'bold', // 제목 굵게
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 15, // 간격 조정
    borderWidth: 1,
    borderColor: '#ccc',
  },
  loginButton: {
    width: '100%',
    backgroundColor: '#466FC1',
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 15,
    alignItems: 'center',
    elevation: 2,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerButton: {
    width: '100%',
    borderColor: '#466FC1',
    borderWidth: 1,
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 10,
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#466FC1',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#a0b4d9', // 로그인 버튼 비활성화 색상
    borderColor: '#a0b4d9', // 등록 버튼 테두리 비활성화 색상
  },
  buttonTextDisabled: {
    color: '#c0c0c0', // 등록 버튼 텍스트 비활성화 색상
  },
});
