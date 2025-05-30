import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SettingScreen = () => {
  const [groupId, setGroupId] = useState('');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');

  const handleFetchUserInfo = async () => {
    try {
      const storedGroupId = await AsyncStorage.getItem('groupId');
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedUserName = await AsyncStorage.getItem('userName');

      if (!storedGroupId || !storedUserId || !storedUserName) {
        Alert.alert(
          '안내',
          '로그인이 필요합니다. (groupId, userId, userName 없음)',
        );
        return;
      }

      // 값이 있으면 state에 저장 or 바로 Alert
      setGroupId(storedGroupId);
      setUserId(storedUserId);
      setUserName(storedUserName);

      Alert.alert(
        '내 정보',
        `아이디(name): ${storedUserName}\n등록번호(groupId): ${storedGroupId}`,
      );
    } catch (err) {
      console.error(err);
      Alert.alert('오류', '정보를 불러올 수 없습니다.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>설정 화면</Text>
      <TouchableOpacity style={styles.button} onPress={handleFetchUserInfo}>
        <Text style={styles.buttonText}>내 정보 불러오기</Text>
      </TouchableOpacity>
    </View>
  );
};

export default SettingScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2E7D5',
    padding: 20,
    justifyContent: 'center',
  },
  title: {fontSize: 24, fontWeight: 'bold', marginBottom: 20},
  button: {
    backgroundColor: '#666',
    padding: 14,
    marginBottom: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {color: '#fff', fontSize: 16},
});
