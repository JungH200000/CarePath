import React, {useState, useEffect} from 'react'; // useState, useEffect 추가
import {Polygon} from 'react-native-maps';
import useRegisteredRouteData from '../hooks/useRegisteredRouteData';

type LatLng = {latitude: number; longitude: number}; // 타입 정의 추가

type Props = {
  routeId: string;
  bufferFillColor?: string;
  onError?: (routeId: string, errorMessage: string) => void;
};

const RegisteredRouteLayer = ({
  routeId,
  bufferFillColor = 'rgba(0, 255, 0, 0.3)',
  onError,
}: Props) => {
  const {routeData, isLoading, error} = useRegisteredRouteData(routeId);
  // ===== Polygon 리렌더링을 위한 key 상태 추가 =====
  const [polygonKey, setPolygonKey] = useState(0);

  // 에러 처리 Effect (기존 유지)
  React.useEffect(() => {
    if (error && typeof onError === 'function') {
      onError(routeId, error);
    }
  }, [error, routeId, onError]);

  // ===== bufferPolygon 데이터 변경 시 key 업데이트 Effect =====
  React.useEffect(() => {
    // routeData나 bufferPolygon이 변경될 때 key를 업데이트하여 Polygon 리렌더링 유도
    // 로딩 중이 아닐 때만 실행 (초기 로딩 시 불필요한 업데이트 방지)
    if (!isLoading && routeData?.bufferPolygon) {
      // console.log(`[RegisteredRouteLayer] Buffer data updated for ${routeId}, updating key.`); // 디버깅 로그
      setPolygonKey(prevKey => prevKey + 1);
    }
  }, [routeData?.bufferPolygon, isLoading]);

  // 로딩 중 처리
  if (isLoading) return null;

  // 에러 또는 데이터 없음 처리
  if (error || !routeData) return null;

  // bufferPolygon 데이터 추출
  const {bufferPolygon} = routeData;

  return (
    <React.Fragment>
      {/* 완충 지대 Polygon (key prop 추가) */}
      {bufferPolygon && bufferPolygon.length > 3 && (
        <Polygon
          // ===== key prop 추가 =====
          key={`${routeId}-polygon-${polygonKey}`} // routeId와 key 상태 조합
          coordinates={bufferPolygon}
          fillColor={bufferFillColor}
          strokeWidth={1}
          strokeColor={bufferFillColor.replace('0.3', '0.5')}
          zIndex={0}
        />
      )}
    </React.Fragment>
  );
};

// React.memo는 유지 (routeId 등 props 변경 시만 리렌더링)
export default React.memo(RegisteredRouteLayer);
