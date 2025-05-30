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

// ===== Navigation 타입 명시 =====
type RegisterCaregiverScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'RegisterCaregiver'
>;

const RegisterCaregiverScreen = () => {
  const navigation = useNavigation<RegisterCaregiverScreenNavigationProp>();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [groupId, setGroupId] = useState('');
  const [loading, setLoading] = useState(false);

  // 보호자 회원가입 핸들러 (Firebase 직접 쓰기)
  const handleCaregiverSignup = async () => {
    if (!name || !phone || !password || !groupId) {
      Alert.alert('입력 오류', '모든 필드를 입력해주세요.');
      return;
    }
    if (!/^\d{6}$/.test(groupId)) {
      Alert.alert('입력 오류', '노인 등록번호는 6자리 숫자여야 합니다.');
      return;
    }

    setLoading(true); // 로딩 시작

    try {
      // 1. Group ID 존재 여부 확인
      const groupRef = database().ref(`/users/${groupId}`);
      const groupSnapshot = await groupRef.once('value');

      if (!groupSnapshot.exists()) {
        // 그룹 ID가 존재하지 않으면 에러 처리
        Alert.alert(
          '회원가입 실패',
          '입력하신 노인 등록번호가 존재하지 않습니다.',
        );
        setLoading(false);
        return;
      }

      // 그룹 ID가 존재하면 진행
      // 2. 사용자 ID 생성
      const userId = `caregiver_${Date.now()}`;
      const createdAt = Date.now();

      // 3. 저장할 데이터 객체 생성
      const caregiverData = {
        name,
        phone,
        password, // 클라이언트 저장 주의!
        role: 'caregiver',
        createdAt,
      };

      // 4. Firebase DB에 저장
      const userRef = database().ref(`/users/${groupId}/${userId}`);
      await userRef.set(caregiverData);

      // (선택적) 노인 데이터에 linkedCaregiverId 업데이트 (원래 서버 로직)
      // 이 로직은 클라이언트에서 수행하기 조금 복잡할 수 있음 (해당 그룹의 senior ID를 찾아야 함)
      // 필요하다면 추가 구현하거나, 이 연결 정보가 필수적이지 않다면 생략 가능
      try {
        const groupData = groupSnapshot.val();
        let seniorUserId = null;
        for (const uId in groupData) {
          if (uId.startsWith('senior_')) {
            seniorUserId = uId;
            break;
          }
        }
        if (seniorUserId) {
          await database()
            .ref(`/users/${groupId}/${seniorUserId}`)
            .update({linkedCaregiverId: userId});
        }
      } catch (linkError) {
        console.error('Error linking caregiver to senior:', linkError);
        // 링크 에러는 치명적이지 않으므로 일단 계속 진행
      }

      // 5. 성공 처리: AsyncStorage 저장 및 네비게이션
      Alert.alert(
        '가입 완료',
        `보호자 회원가입 성공!\n이름: ${name}\n연결된 노인 등록번호: ${groupId}\n\n자동으로 로그인됩니다.`,
      );

      await AsyncStorage.setItem('groupId', groupId);
      await AsyncStorage.setItem('userId', userId);
      await AsyncStorage.setItem('userName', name);
      await AsyncStorage.setItem('role', 'caregiver');

      console.log(
        `Caregiver signup successful! Role: caregiver, Navigating to CaregiverMap...`,
      );

      navigation.reset({index: 0, routes: [{name: 'CaregiverMap'}]});
    } catch (err: any) {
      console.error('Caregiver signup error (Firebase):', err);
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
      <Text style={styles.title}>보호자 회원가입</Text>
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
      <TextInput
        style={[styles.input, {color: '#000'}]}
        placeholder="연결할 노인 등록번호 (6자리 숫자)"
        placeholderTextColor="#999"
        value={groupId}
        onChangeText={setGroupId}
        keyboardType="number-pad"
        maxLength={6}
        editable={!loading}
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleCaregiverSignup}
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

export default RegisterCaregiverScreen;

// 스타일
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4EBF2', // 배경색 유지
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#444',
  },
  input: {
    backgroundColor: '#fff',
    marginBottom: 15,
    paddingHorizontal: 15,
    paddingVertical: 12,
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
