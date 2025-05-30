// careclient/src/utils/routeUtils.ts

import * as turf from '@turf/turf';
import {
  Point,
  Polygon,
  Position,
  Feature,
  GeoJsonProperties,
  LineString as TurfLineString,
} from 'geojson'; // TurfLineString 추가

type LatLng = {
  latitude: number;
  longitude: number;
};

// 기존 유지
export const isPointInsideAnyBuffer = (
  currentPoint: LatLng | null,
  routeBufferPolygons: LatLng[][],
): boolean => {
  if (
    !currentPoint ||
    !routeBufferPolygons ||
    routeBufferPolygons.length === 0
  ) {
    return false;
  }
  const currentGeoJsonPointGeometry: Point = turf.point([
    currentPoint.longitude,
    currentPoint.latitude,
  ]).geometry;
  for (const bufferPolygonCoords of routeBufferPolygons) {
    if (bufferPolygonCoords && bufferPolygonCoords.length > 3) {
      const turfPolygonCoords: Position[] = bufferPolygonCoords.map(p => [
        p.longitude,
        p.latitude,
      ]);
      const bufferGeoJsonPolygonGeometry: Polygon = turf.polygon([
        turfPolygonCoords,
      ]).geometry;
      if (
        turf.booleanPointInPolygon(
          currentGeoJsonPointGeometry,
          bufferGeoJsonPolygonGeometry,
        )
      ) {
        // console.log('[routeUtils] Point is INSIDE a buffer.');
        return true;
      }
    }
  }
  // console.log('[routeUtils] Point is OUTSIDE all buffers.');
  return false;
};

// 기존 유지
export const findNearestPointOnRoutes = (
  currentPoint: LatLng | null,
  routesPoints: LatLng[][] | null,
): LatLng | null => {
  if (!currentPoint || !routesPoints || routesPoints.length === 0) {
    return null;
  }
  const turfCurrentPoint = turf.point([
    currentPoint.longitude,
    currentPoint.latitude,
  ]);
  let overallNearestPointInfo: {point: LatLng; distance: number} | null = null;
  for (const singleRoutePoints of routesPoints) {
    if (singleRoutePoints && singleRoutePoints.length >= 2) {
      const turfRouteCoords: Position[] = singleRoutePoints.map(p => [
        p.longitude,
        p.latitude,
      ]);
      try {
        const routeLineString: Feature<TurfLineString> =
          turf.lineString(turfRouteCoords);
        const nearestPointFeature = turf.nearestPointOnLine(
          routeLineString,
          turfCurrentPoint,
          {units: 'meters'},
        );
        if (nearestPointFeature?.geometry?.coordinates) {
          const nearestCoords = nearestPointFeature.geometry.coordinates;
          const nearestLatLng: LatLng = {
            latitude: nearestCoords[1],
            longitude: nearestCoords[0],
          };
          const distanceToPoint = nearestPointFeature.properties.dist;
          if (typeof distanceToPoint === 'number') {
            if (
              overallNearestPointInfo === null ||
              distanceToPoint < overallNearestPointInfo.distance
            ) {
              overallNearestPointInfo = {
                point: nearestLatLng,
                distance: distanceToPoint,
              };
            }
          }
        }
      } catch (error) {
        console.error(
          '[routeUtils] Error processing route for nearestPointOnLine:',
          error,
          singleRoutePoints,
        );
      }
    }
  }
  // if (overallNearestPointInfo) { // 로그는 필요시 주석 해제
  //   console.log('[routeUtils] Found nearest point on routes:', overallNearestPointInfo.point, 'Distance:', overallNearestPointInfo.distance);
  // } else {
  //   console.log('[routeUtils] Could not find any nearest point on provided routes.');
  // }
  return overallNearestPointInfo ? overallNearestPointInfo.point : null;
};

/**
 * 현재 헤딩과 목표 방위각을 비교하여 회전해야 할 방향을 계산합니다.
 * @param currentHeading 현재 스마트폰 헤딩 (0-360도)
 * @param targetBearing 목표 지점까지의 방위각 (0-360도, turf.bearing 결과는 -180~180이므로 변환 필요)
 * @param tolerance 각도 허용 오차 (이 범위 내는 'straight'로 간주) - 기본값 15도
 * @returns 'left', 'right', 'straight' 또는 계산 불가 시 null
 */
export const calculateTurnDirection = (
  currentHeading: number,
  targetBearing: number,
  tolerance: number = 15, // 기본 허용 오차 15도
): 'left' | 'right' | 'straight' | null => {
  if (typeof currentHeading !== 'number' || typeof targetBearing !== 'number') {
    return null; // 유효하지 않은 입력
  }

  // turf.bearing의 결과는 -180 ~ 180도 이므로, 0 ~ 360도 범위로 변환
  const normalizedTargetBearing = (targetBearing + 360) % 360;

  // 각도 차이 계산 (-180 ~ 180 범위로 정규화)
  let diff = normalizedTargetBearing - currentHeading;
  if (diff > 180) {
    diff -= 360;
  } else if (diff <= -180) {
    diff += 360;
  }

  // 허용 오차 범위 내인지 확인
  if (Math.abs(diff) <= tolerance) {
    return 'straight'; // 목표 방향과 거의 일치
  } else if (diff > 0) {
    return 'right'; // 목표가 오른쪽에 있음 (시계 방향으로 회전 필요)
  } else {
    return 'left'; // 목표가 왼쪽에 있음 (반시계 방향으로 회전 필요)
  }
};
