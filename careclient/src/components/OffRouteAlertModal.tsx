import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Modal from 'react-native-modal';

type Props = {
  isVisible: boolean;
  onClose: () => void; // 화면 클릭(배경 클릭) 시 호출될 콜백
  message?: string;
};

const OffRouteAlertModal = ({
  isVisible,
  onClose,
  message = '경로를 이탈하였습니다.\n화면을 클릭하세요.', // 기본 메시지
}: Props) => {
  // 메시지를 \n 기준으로 분리
  const messageLines = message.split('\n');

  return (
    <Modal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      animationIn="fadeIn"
      animationOut="fadeOut"
      backdropTransitionOutTiming={0}
      style={styles.modal}>
      <TouchableOpacity
        style={styles.touchableContainer}
        onPress={onClose}
        activeOpacity={1}>
        <View style={styles.content}>
          <Text style={styles.title}>⚠️ 경로 이탈 알림 ⚠️</Text>
          {/* 분리된 메시지 라인을 각각 Text 컴포넌트로 렌더링 */}
          {messageLines.map((line, index) => (
            <Text key={index} style={styles.message}>
              {line}
            </Text>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modal: {
    margin: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  touchableContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: 'rgba(255, 0, 0, 0.85)',
    padding: 25,
    borderRadius: 10,
    alignItems: 'center',
    width: '85%',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 15,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    lineHeight: 22, // 줄 간격 조절이 필요하면 추가
    // 각 줄이 별도의 Text 컴포넌트이므로, 마지막 줄이 아니면 아래쪽 마진을 줄 수도 있습니다.
    // marginBottom: messageLines.length > 1 && index < messageLines.length - 1 ? 5 : 0, (필요하다면)
  },
});

export default OffRouteAlertModal;
