// careclient/src/hooks/useLocationHistory.ts

import {useState, useEffect, useRef} from 'react';
import database, {FirebaseDatabaseTypes} from '@react-native-firebase/database';
import {splitPolylineByTimeGap} from '../utils/polylineUtils';

type LatLng = {
  latitude: number;
  longitude: number;
};

type LocationRecord = {
  latitude: number;
  longitude: number;
  heading: number;
  timestamp: number;
};

type UseLocationHistoryReturn = {
  polylineSegments: LatLng[][]; // Polyline 세그먼트 배열
  isLoading: boolean;
  error: string | null;
};

const POLYLINE_SPLIT_GAP_MINUTES = 2;

const useLocationHistory = (
  seniorId: string | null,
  isOffRouteFromMapScreen?: boolean, // MapScreen의 isOffRoute 상태를 받음 (선택적 파라미터로 지정)
): UseLocationHistoryReturn => {
  const [rawRecords, setRawRecords] = useState<LocationRecord[]>([]);
  const [polylineSegments, setPolylineSegments] = useState<LatLng[][]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const listenerRef = useRef<any>(null);
  const onChildAddedCallback = useRef<any>(null);
  const lastRecordRef = useRef<LocationRecord | null>(null);
  const isMounted = useRef(true);

  const detachRealtimeListener = () => {
    if (listenerRef.current && onChildAddedCallback.current) {
      listenerRef.current.off('child_added', onChildAddedCallback.current);
    }
    listenerRef.current = null;
    onChildAddedCallback.current = null;
  };

  useEffect(() => {
    isMounted.current = true;

    if (!seniorId) {
      setIsLoading(false);
      setError('Senior ID가 제공되지 않았습니다.');
      setRawRecords([]);
      setPolylineSegments([]);
      return () => {
        isMounted.current = false;
      };
    }

    setIsLoading(true);
    setError(null);
    setRawRecords([]);
    setPolylineSegments([]);
    lastRecordRef.current = null;

    const historyPath = `/locations/${seniorId}/location_history`;

    const fetchAndListen = async () => {
      try {
        const twentyFourHoursAgoTimestamp = Date.now() - 24 * 60 * 60 * 1000;
        const historyQuery = database()
          .ref(historyPath)
          .orderByChild('timestamp')
          .startAt(twentyFourHoursAgoTimestamp);

        const snapshot = await historyQuery.once('value');

        if (!isMounted.current) return;

        let initialRecords: LocationRecord[] = [];
        if (snapshot.exists()) {
          initialRecords = Object.values(snapshot.val()) as LocationRecord[];
          initialRecords.sort((a, b) => a.timestamp - b.timestamp);
          if (initialRecords.length > 0) {
            lastRecordRef.current = initialRecords[initialRecords.length - 1];
          }
        }
        // 초기 데이터는 isOffRoute와 관계없이 항상 설정
        setRawRecords(initialRecords);

        const realtimeQuery = database()
          .ref(historyPath)
          .orderByChild('timestamp')
          .startAt(
            lastRecordRef.current
              ? lastRecordRef.current.timestamp + 1
              : twentyFourHoursAgoTimestamp,
          );

        listenerRef.current = realtimeQuery;

        onChildAddedCallback.current = (
          childSnapshot: FirebaseDatabaseTypes.DataSnapshot,
        ) => {
          if (!isMounted.current || !childSnapshot.exists()) return;
          const newRecord = childSnapshot.val() as LocationRecord;
          const lastKnownRecord = lastRecordRef.current;

          // isOffRouteFromMapScreen이 true가 아닐 때만 (즉, 경로 이탈 중이 아닐 때만) 실시간 기록 추가
          if (
            !isOffRouteFromMapScreen &&
            newRecord &&
            typeof newRecord.latitude === 'number' &&
            typeof newRecord.longitude === 'number' &&
            (!lastKnownRecord ||
              newRecord.timestamp > lastKnownRecord.timestamp)
          ) {
            setRawRecords(prevRecords => {
              // 중복 방지 (혹시 모를 경우)
              if (
                prevRecords.find(
                  r =>
                    r.timestamp === newRecord.timestamp &&
                    r.latitude === newRecord.latitude &&
                    r.longitude === newRecord.longitude,
                )
              ) {
                return prevRecords;
              }
              return [...prevRecords, newRecord];
            });
            lastRecordRef.current = newRecord;
          } else if (isOffRouteFromMapScreen) {
            // console.log('[useLocationHistory] Off-route: Skipping live polyline update.');
          }
        };

        realtimeQuery.on(
          'child_added',
          onChildAddedCallback.current,
          (err: any) => {
            if (!isMounted.current) return;
            console.error('Firebase child_added listener error:', err);
            setError('실시간 위치 업데이트 중 오류 발생');
          },
        );
      } catch (err: any) {
        if (!isMounted.current) return;
        console.error('Error fetching/listening location history:', err);
        setError('위치 기록 처리 중 오류 발생');
      }
    };

    fetchAndListen();

    return () => {
      isMounted.current = false;
      detachRealtimeListener();
    };
  }, [seniorId]);

  useEffect(() => {
    const segments = splitPolylineByTimeGap(
      rawRecords,
      POLYLINE_SPLIT_GAP_MINUTES,
    );
    setPolylineSegments(segments);
    setIsLoading(false);
    if (rawRecords.length > 0 && error) {
      // 데이터가 있는데 에러가 있다면 (예: 초기 로드 성공 후 리스너 에러)
      // setError(null); // 이 부분은 상황에 따라 결정 (리스너 에러를 계속 보여줄지 여부)
    } else if (rawRecords.length === 0 && !isLoading && !error) {
      // 데이터도 없고 로딩도 끝났고 에러도 없을 때 (초기에 데이터가 없는 경우)
    }
  }, [rawRecords, isLoading, error]); // isLoading, error 의존성 추가 검토

  return {polylineSegments, isLoading, error};
};

export default useLocationHistory;
