import React, {useState} from 'react';
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
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import database from '@react-native-firebase/database';

// Navigation 타입 명시
type RegisterSeniorScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'RegisterSenior'
>;

const RegisterSeniorScreen = () => {
  const navigation = useNavigation<RegisterSeniorScreenNavigationProp>();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // ===== Group ID 생성 및 중복 확인 함수 =====
  const generateUniqueGroupId = async (): Promise<string> => {
    let attempts = 0;
    const MAX_ATTEMPTS = 10; // 충돌 시 재시도 최대 횟수

    while (attempts < MAX_ATTEMPTS) {
      const newGroupId = Math.floor(100000 + Math.random() * 900000).toString();
      const groupRef = database().ref(`/users/${newGroupId}`);
      const snapshot = await groupRef.once('value');

      if (!snapshot.exists()) {
        // 존재하지 않으면 유니크 ID 찾음
        return newGroupId;
      }
      attempts++;
    }
    // 최대 시도 횟수 초과
    throw new Error(
      'Failed to generate a unique group ID after multiple attempts.',
    );
  };
  // 노인 회원가입 핸들러 (Firebase 직접 쓰기)
  const handleSeniorSignup = async () => {
    if (!name || !phone || !password) {
      Alert.alert('입력 오류', '이름, 전화번호, 비밀번호를 모두 입력해주세요.');
      return;
    }

    setLoading(true); // 로딩 시작

    try {
      // 1. 유니크한 Group ID 생성
      const groupId = await generateUniqueGroupId();

      // 2. 사용자 ID 생성 (고유성 보장)
      const userId = `senior_${Date.now()}`; // Timestamp 기반
      const createdAt = Date.now();

      // 3. 저장할 데이터 객체 생성
      const seniorData = {
        name,
        phone,
        password,
        role: 'senior',
        createdAt,
      };

      // 4. Firebase DB에 저장
      const userRef = database().ref(`/users/${groupId}/${userId}`);
      await userRef.set(seniorData);

      // 5. 성공 처리: AsyncStorage 저장 및 네비게이션
      Alert.alert(
        '가입 완료',
        `노인 회원가입 성공!\n이름: ${name}\n등록번호(그룹ID): ${groupId}\n\n자동으로 로그인됩니다.`,
      );

      await AsyncStorage.setItem('groupId', groupId);
      await AsyncStorage.setItem('userId', userId);
      await AsyncStorage.setItem('userName', name);
      await AsyncStorage.setItem('role', 'senior');

      console.log(
        `Senior signup successful! Role: senior, Navigating to Map...`,
      );

      navigation.reset({index: 0, routes: [{name: 'Map'}]});
    } catch (err: any) {
      console.error('Senior signup error (Firebase):', err);
      Alert.alert(
        '회원가입 실패',
        err.message || '회원가입 중 오류가 발생했습니다.',
      );
    } finally {
      setLoading(false); // 로딩 종료
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>노인 회원가입</Text>
      <TextInput
        style={[styles.input, {color: '#000'}]}
        placeholder="이름"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
        editable={!loading}
      />
      <TextInput
        style={[styles.input, {color: '#000'}]}
        placeholder="전화번호 (예: 01012345678)"
        placeholderTextColor="#999"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        editable={!loading}
      />
      <TextInput
        style={[styles.input, {color: '#000'}]}
        placeholder="비밀번호"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading}
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSeniorSignup}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>회원가입 완료</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default RegisterSeniorScreen;

// 스타일
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EAD7', // 배경색 유지
    padding: 20,
    justifyContent: 'center', // 중앙 정렬
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30, // 간격 조정
    textAlign: 'center', // 제목 중앙 정렬
    color: '#444', // 글자색
  },
  input: {
    backgroundColor: '#fff',
    marginBottom: 15, // 간격 조정
    paddingHorizontal: 15, // 좌우 패딩
    paddingVertical: 12, // 상하 패딩
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#466FC1',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
    elevation: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#a0b4d9',
  },
});
