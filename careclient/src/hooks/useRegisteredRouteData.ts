import {useState, useEffect, useRef} from 'react';
import database, {FirebaseDatabaseTypes} from '@react-native-firebase/database';
import {RouteMetadata} from '../utils/firebaseUtils'; // RouteMetadata 타입 가져오기

type LatLng = {latitude: number; longitude: number};
export type RegisteredRouteData = {
  metadata: RouteMetadata | null;
  points: LatLng[];
  bufferPolygon: LatLng[] | null;
};
type UseRegisteredRouteDataReturn = {
  routeData: RegisteredRouteData | null;
  isLoading: boolean;
  error: string | null;
};

const useRegisteredRouteData = (
  routeId: string | null,
): UseRegisteredRouteDataReturn => {
  const [routeData, setRouteData] = useState<RegisteredRouteData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);
  // ===== 리스너 참조 및 콜백 Ref =====
  const listenerRef = useRef<any>(null);
  const onValueCallback = useRef<any>(null);

  useEffect(() => {
    isMounted.current = true;
    console.log(`[useRegisteredRouteData] useEffect for routeId: ${routeId}`);

    // ===== 이전 리스너 정리 =====
    // routeId가 변경되거나 컴포넌트 언마운트 시 이전 리스너 해제
    if (listenerRef.current && onValueCallback.current) {
      console.log(
        `[useRegisteredRouteData] Detaching previous listener for old/current routeId`,
      );
      listenerRef.current.off('value', onValueCallback.current);
    }
    listenerRef.current = null;
    onValueCallback.current = null;
    // ===========================

    if (!routeId) {
      setIsLoading(false);
      setError('Route ID가 제공되지 않았습니다.');
      setRouteData(null);
      return () => {
        isMounted.current = false;
      };
    }

    // ===== 상태 초기화 (데이터 로드 시작 전) =====
    setIsLoading(true);
    setError(null);
    setRouteData(null); // 이전 데이터 지우기

    const routeRef = database().ref(`/registered_routes/${routeId}`);
    listenerRef.current = routeRef; // 현재 참조 저장

    // ===== 단일 on('value') 리스너 콜백 정의 =====
    onValueCallback.current = (
      snapshot: FirebaseDatabaseTypes.DataSnapshot,
    ) => {
      console.log(
        `[useRegisteredRouteData] Listener triggered for ${routeId}. Exists: ${snapshot.exists()}`,
      );

      if (!isMounted.current) return;

      if (snapshot.exists()) {
        const rawData = snapshot.val();
        // console.log(`[useRegisteredRouteData] Raw data for ${routeId}:`, JSON.stringify(rawData).substring(0, 300) + "...");

        const metadata = (rawData.metadata as RouteMetadata) || null;
        let points: LatLng[] = [];
        let bufferPolygon: LatLng[] | null = null;

        // 포인트 처리
        if (rawData.points) {
          try {
            const pointsArray = Object.values(rawData.points) as any[];
            pointsArray.sort(
              (a, b) => (a?.timestamp || 0) - (b?.timestamp || 0),
            );
            points = pointsArray
              .filter(
                p =>
                  p &&
                  typeof p.latitude === 'number' &&
                  typeof p.longitude === 'number',
              )
              .map(p => ({latitude: p.latitude, longitude: p.longitude}));
          } catch (e) {
            console.error('Error processing points:', e);
          }
        }

        // 버퍼 폴리곤 처리
        if (rawData.buffer_polygon && Array.isArray(rawData.buffer_polygon)) {
          const isValidPolygon = rawData.buffer_polygon.every(
            (p: any) =>
              typeof p === 'object' &&
              p !== null &&
              typeof p.latitude === 'number' &&
              typeof p.longitude === 'number',
          );
          if (isValidPolygon) {
            bufferPolygon = rawData.buffer_polygon as LatLng[];
            console.log(
              `[useRegisteredRouteData] Buffer FOUND for ${routeId}.`,
            );
          } else {
            console.warn(`Invalid buffer_polygon data format for ${routeId}`);
          }
        } else {
          console.log(
            `[useRegisteredRouteData] Buffer NOT FOUND for ${routeId}.`,
          );
        }

        // ===== 최종 상태 업데이트 =====
        console.log(
          `[useRegisteredRouteData] Setting final routeData for ${routeId}. Has buffer: ${!!bufferPolygon}`,
        );
        setRouteData({metadata, points, bufferPolygon});
        setError(null); // 성공 시 에러 초기화
      } else {
        console.log(
          `[useRegisteredRouteData] Snapshot does not exist for ${routeId}.`,
        );
        setError(`경로 데이터(ID: ${routeId})를 찾을 수 없습니다.`);
        setRouteData(null);
      }
      // ===== 데이터 처리 후 로딩 종료 =====
      setIsLoading(false);
    };

    // ===== 단일 리스너 등록 =====
    console.log(
      `[useRegisteredRouteData] Attaching listener to ${routeRef.toString()}`,
    );
    routeRef.on('value', onValueCallback.current, (err: any) => {
      if (!isMounted.current) return;
      console.error(`Error listening to route data for ${routeId}:`, err);
      setError('경로 데이터 실시간 수신 오류');
      setIsLoading(false);
      setRouteData(null);
    });

    // 클린업 함수
    return () => {
      isMounted.current = false;
      if (listenerRef.current && onValueCallback.current) {
        console.log(
          `[useRegisteredRouteData] Detaching listener for routeId: ${routeId}`,
        );
        listenerRef.current.off('value', onValueCallback.current); // 등록된 리스너 해제
      }
      listenerRef.current = null;
      onValueCallback.current = null;
    };
  }, [routeId]); // routeId가 변경되면 effect 재실행 (리스너 재부착)

  return {routeData, isLoading, error};
};

export default useRegisteredRouteData;
