import {useState, useEffect, useRef} from 'react';
// ===== FirebaseDatabaseTypes import 추가 =====
import database, {FirebaseDatabaseTypes} from '@react-native-firebase/database';
import {Alert} from 'react-native';

// 반환할 위치 데이터 타입 정의
export type SeniorLocationData = {
  latitude: number;
  longitude: number;
  heading: number;
  timestamp: number;
};

// 훅의 반환 타입 정의
type UseSeniorLocationReturn = {
  seniorLocation: SeniorLocationData | null; // 노인의 최신 위치 정보
  isLoading: boolean; // 로딩 상태
  error: string | null; // 에러 메시지
  seniorUserId: string | null; // 찾은 노인 User ID
};

/**
 * 주어진 Group ID에 해당하는 노인의 최신 위치 정보를 실시간으로 가져오는 커스텀 훅.
 * @param groupId 보호자의 Group ID.
 * @returns {UseSeniorLocationReturn} 노인 위치 정보, 로딩 상태, 에러 상태, 노인 User ID.
 */
const useSeniorLocation = (groupId: string | null): UseSeniorLocationReturn => {
  const [seniorLocation, setSeniorLocation] =
    useState<SeniorLocationData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [seniorUserId, setSeniorUserId] = useState<string | null>(null);

  const listenerRef = useRef<any>(null);
  const onValueChange = useRef<any>(null);

  useEffect(() => {
    if (!groupId) {
      setIsLoading(false);
      setError('그룹 ID가 없습니다.');
      setSeniorUserId(null);
      setSeniorLocation(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSeniorUserId(null);
    setSeniorLocation(null);

    let isMounted = true;

    const findSeniorIdAndListen = async () => {
      try {
        const groupRef = database().ref(`/users/${groupId}`);
        const snapshot = await groupRef.once('value');

        if (!isMounted) return;

        if (!snapshot.exists()) {
          setError('해당 그룹 ID를 찾을 수 없습니다.');
          setIsLoading(false);
          return;
        }

        const groupData = snapshot.val();
        let foundSeniorId: string | null = null;
        for (const userId in groupData) {
          if (userId.startsWith('senior_')) {
            foundSeniorId = userId;
            break;
          }
        }

        if (foundSeniorId) {
          if (isMounted) setSeniorUserId(foundSeniorId); // 마운트 상태에서만 업데이트

          const locationPath = `/locations/${foundSeniorId}/location_history`;
          const locationRef = database()
            .ref(locationPath)
            .orderByKey()
            .limitToLast(1);

          listenerRef.current = locationRef;

          onValueChange.current = (
            locationSnapshot: FirebaseDatabaseTypes.DataSnapshot,
          ) => {
            if (!isMounted) return;

            if (locationSnapshot.exists()) {
              const locationData = locationSnapshot.val();
              const latestKey = Object.keys(locationData)[0];
              const latestLocation = locationData[latestKey];

              if (
                latestLocation &&
                typeof latestLocation.latitude === 'number' &&
                typeof latestLocation.longitude === 'number' &&
                typeof latestLocation.heading === 'number' &&
                typeof latestLocation.timestamp === 'number'
              ) {
                if (isMounted) {
                  // 마운트 상태에서만 상태 업데이트
                  setSeniorLocation(latestLocation as SeniorLocationData);
                  setError(null);
                }
              } else {
                console.warn(
                  'Received incomplete or invalid location data:',
                  latestLocation,
                );
                if (isMounted) {
                  setError('수신된 위치 데이터 형식이 올바르지 않습니다.');
                  setSeniorLocation(null);
                }
              }
            } else {
              if (isMounted) {
                setError('아직 기록된 위치 데이터가 없습니다.');
                setSeniorLocation(null);
              }
            }
            // 로딩 상태는 여기서 한 번만 false로 설정
            if (isMounted) setIsLoading(false);
          };

          // value 리스너 등록
          locationRef.on('value', onValueChange.current, (err: any) => {
            if (!isMounted) return;
            console.error('Firebase location listener error:', err);
            setError('위치 데이터 수신 중 오류가 발생했습니다.');
            setIsLoading(false);
            setSeniorLocation(null);
          });
        } else {
          if (isMounted) {
            setError('그룹 내에서 노인 사용자를 찾을 수 없습니다.');
            setIsLoading(false);
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Error finding senior ID or subscribing:', err);
        setError('사용자 정보 조회 또는 위치 구독 중 오류 발생');
        setIsLoading(false);
      }
      // findSeniorIdAndListen 함수가 비동기이므로, 여기서 로딩을 끄면 안됨.
      // 리스너 콜백에서 로딩을 꺼야 함.
    };

    findSeniorIdAndListen();

    return () => {
      isMounted = false;
      if (listenerRef.current && onValueChange.current) {
        listenerRef.current.off('value', onValueChange.current);
      }
      listenerRef.current = null;
      onValueChange.current = null;
    };
  }, [groupId]);

  return {seniorLocation, isLoading, error, seniorUserId};
};

export default useSeniorLocation;
