import {useState, useEffect} from 'react';
import {
  orientation,
  SensorTypes,
  setUpdateIntervalForType,
} from 'react-native-sensors';
import {Subscription} from 'rxjs';

/**
 * 디바이스의 절대 방위각(heading/yaw) 값을 실시간으로 제공하는 커스텀 훅.
 * orientation 센서 데이터를 사용하여 방위각을 계산합니다. (0-360도)
 * @param updateInterval 센서 업데이트 간격 (ms), 기본값 100ms (10Hz)
 * @returns 현재 디바이스의 방위각 (0-360도)
 */
const useGyroscope = (updateInterval = 100): number => {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    let subscription: Subscription | null = null;
    // console.log('[useGyroscope] Setting up effect...');

    try {
      setUpdateIntervalForType(SensorTypes.orientation, updateInterval);

      subscription = orientation.subscribe(
        (data: any) => {
          // console.log('[useGyroscope] Received raw sensor data:', JSON.stringify(data));
          const yaw = data?.yaw;

          if (typeof yaw === 'number' && !isNaN(yaw)) {
            const yawDegrees = yaw * (180 / Math.PI);
            const normalizedHeading = ((yawDegrees % 360) + 360) % 360;

            // 성능을 위해 상태가 실제로 변경될 때만 업데이트 (선택적)
            // (정밀도가 중요하지 않다면 Math.round 등으로 비교해도 됨)
            if (Math.abs(heading - normalizedHeading) > 0.1) {
              // console.log(`[useGyroscope] Updating heading from yaw: ${yaw.toFixed(2)} rad -> ${normalizedHeading.toFixed(1)} deg`);
              setHeading(normalizedHeading);
            }
          } else {
            // console.log('[useGyroscope] Invalid or missing yaw value:', yaw);
          }
        },
        error => {
          // 구독 오류는 유지
          console.warn('[useGyroscope] Subscription error:', error);
        },
      );
      // console.log('[useGyroscope] Subscribed to orientation sensor.');
    } catch (error) {
      // 설정/구독 오류는 유지
      console.error('[useGyroscope] Failed to set/subscribe:', error);
    }

    // 언마운트 시 구독 해제
    return () => {
      // console.log('[useGyroscope] Cleaning up effect...');
      if (subscription) {
        subscription.unsubscribe();
        // console.log('[useGyroscope] Unsubscribed.');
      }
    };
  }, [updateInterval]);

  return heading;
};

export default useGyroscope;
