import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';

const RegisterChoiceScreen = () => {
  const navigation = useNavigation();

  const handleRegisterSenior = () => {
    navigation.navigate('RegisterSenior' as never);
  };

  const handleRegisterCaregiver = () => {
    navigation.navigate('RegisterCaregiver' as never);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>회원가입 선택</Text>
      <TouchableOpacity style={styles.button} onPress={handleRegisterSenior}>
        <Text style={styles.buttonText}>노인 회원가입</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleRegisterCaregiver}>
        <Text style={styles.buttonText}>보호자 회원가입</Text>
      </TouchableOpacity>
    </View>
  );
};

export default RegisterChoiceScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F0',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#466FC1',
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
    width: '70%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
});
