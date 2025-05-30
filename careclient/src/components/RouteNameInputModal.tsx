import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Modal from 'react-native-modal';

type Props = {
  isVisible: boolean;
  onClose: () => void; // "취소" 또는 배경/뒤로가기 시 호출될 콜백
  onSave: (name: string) => void; // "저장" 시 호출될 콜백
};

const RouteNameInputModal = ({isVisible, onClose, onSave}: Props) => {
  const [routeName, setRouteName] = useState('');

  const handleSave = () => {
    const nameToSave = routeName.trim() || '새 경로';
    onSave(nameToSave); // MapScreen의 handleSaveRouteName 호출
    setRouteName(''); // 입력 필드 초기화
    // onClose();
  };

  const handleClose = () => {
    setRouteName(''); // 입력 필드 초기화
    onClose(); // MapScreen의 handleCloseRouteNameModal 호출
  };

  return (
    <Modal
      isVisible={isVisible}
      onBackdropPress={handleClose}
      onBackButtonPress={handleClose}
      animationIn="fadeInUp"
      animationOut="fadeOutDown"
      backdropTransitionOutTiming={0}
      style={styles.modal}
      onModalShow={() => setRouteName('')}>
      <View style={styles.content}>
        <Text style={styles.title}>경로 이름 설정</Text>
        <Text style={styles.description}>
          등록한 경로의 이름을 입력해주세요. 나중에 알아보기 쉬운 이름이
          좋습니다.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="예: 공원 산책로, 병원 가는 길"
          placeholderTextColor="#999"
          value={routeName}
          onChangeText={setRouteName}
          autoFocus={true}
        />
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={handleClose} // 취소 시 handleClose 호출
          >
            <Text style={[styles.buttonText, styles.cancelButtonText]}>
              취소
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={handleSave} // 저장 시 handleSave 호출
          >
            <Text style={styles.buttonText}>저장</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modal: {
    justifyContent: 'center', // 중앙 정렬 (기본은 flex-end)
    margin: 0, // 기본 마진 제거
    alignItems: 'center',
  },
  content: {
    backgroundColor: 'white',
    padding: 22,
    borderRadius: 10,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    width: '85%', // 화면 너비의 85%
    alignItems: 'center', // 내부 요소 가운데 정렬
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    borderBottomWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginBottom: 25,
    fontSize: 16,
    color: '#000', // 입력 텍스트 색상
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around', // 버튼 간 간격 벌리기
    width: '100%',
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 25, // 버튼 너비 확보
    alignItems: 'center',
    minWidth: 100, // 최소 너비
  },
  cancelButton: {
    backgroundColor: '#f0f0f0', // 회색 계열
    borderWidth: 1,
    borderColor: '#ccc',
  },
  saveButton: {
    backgroundColor: '#466FC1', // 파란색 계열
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff', // 저장 버튼 흰색 텍스트
  },
  cancelButtonText: {
    // 취소 버튼 텍스트 색상
    color: '#333', // 검정 계열
  },
});

export default RouteNameInputModal;
